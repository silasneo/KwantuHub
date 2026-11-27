import { Resolver } from "node:dns/promises";
import { domainToASCII } from "node:url";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "./db";
import { emailDomainOverrides, moderationRecords } from "../drizzle/schema";
import { adminProcedure } from "./_core/trpc";

export function normalizeDomain(value: string) {
  const domain = domainToASCII(value.trim().toLowerCase().replace(/\.$/, ""));
  if (domain.length > 253 || !domain.includes(".") ||
    !domain.split(".").every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) {
    throw new Error("Use a valid email domain, not a full email address or URL.");
  }
  return domain;
}

export function domainSuffixes(domain: string) {
  const labels = normalizeDomain(domain).split(".");
  return labels.slice(0, -1).map((_, index) => labels.slice(index).join("."));
}

const resolver = new Resolver({ timeout: 1500, tries: 2 });
export const emailDns = {
  mx: (domain: string) => resolver.resolveMx(domain),
  a: (domain: string) => resolver.resolve4(domain),
  aaaa: (domain: string) => resolver.resolve6(domain),
};
const mailCache = new Map<string, { expiresAt: number; valid: boolean }>();
const absent = (error: unknown) => error instanceof Error && "code" in error &&
  (error.code === "ENODATA" || error.code === "ENOTFOUND");

export async function checkDomainMail(domain: string, dns = emailDns): Promise<boolean> {
  const cached = dns === emailDns && mailCache.get(domain);
  if (cached && cached.expiresAt > Date.now()) return cached.valid;
  let valid: boolean;
  try {
    const mx = await dns.mx(domain);
    if (mx.some(record => !record.exchange || record.exchange === ".")) {
      valid = false;
    } else if (mx.length) {
      valid = true;
    } else {
      valid = await addressFallback();
    }
  } catch (error) {
    if (!absent(error)) throw error;
    if (error instanceof Error && "code" in error && error.code === "ENOTFOUND") valid = false;
    else valid = await addressFallback();
  }
  if (dns === emailDns) {
    if (mailCache.size >= 5000) mailCache.delete(mailCache.keys().next().value!);
    mailCache.set(domain, { valid, expiresAt: Date.now() + (valid ? 15 : 2) * 60_000 });
  }
  return valid;

  async function addressFallback() {
    const results = await Promise.allSettled([dns.a(domain), dns.aaaa(domain)]);
    if (results.some(result => result.status === "fulfilled" && result.value.length > 0)) return true;
    const temporary = results.find(result => result.status === "rejected" && !absent(result.reason));
    if (temporary?.status === "rejected") throw temporary.reason;
    return false;
  }
}

type ListMetadata = { source: string; revision: string; sha256: string; updatedAt: string; count: number };
let listPromise: Promise<{ domains: Set<string>; metadata: ListMetadata }> | undefined;
export function loadDisposableDomains() {
  return listPromise ??= (async () => {
    const snapshot = JSON.parse(await readFile(resolve("data", "email", "snapshot.json"), "utf8")) as
      { metadata: ListMetadata; domains: string[] };
    const { metadata } = snapshot;
    const text = snapshot.domains.join("\n") + "\n";
    if (createHash("sha256").update(text).digest("hex") !== metadata.sha256) {
      throw new Error("Disposable-domain snapshot checksum mismatch.");
    }
    const domains = new Set(snapshot.domains.map(normalizeDomain));
    if (domains.size !== metadata.count || domains.size < 1000) throw new Error("Invalid disposable-domain snapshot.");
    return { domains, metadata };
  })().catch(error => {
    listPromise = undefined;
    console.error("[EmailPolicy] Disposable-domain snapshot unavailable", error);
    throw error;
  });
}

export async function screenEmailAddress(email: string) {
  const domain = normalizeDomain(email.slice(email.lastIndexOf("@") + 1));
  const suffixes = domainSuffixes(domain);
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Email checks unavailable." });
  const overrides = await db.select().from(emailDomainOverrides).where(inArray(emailDomainOverrides.domain, suffixes));
  const override = suffixes.map(suffix => overrides.find(row => row.domain === suffix)).find(Boolean);
  const list = await loadDisposableDomains();
  if (override?.policy === "block" || (!override && suffixes.some(suffix => list.domains.has(suffix)))) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Temporary/disposable email domains are not accepted. Use a permanent email address or contact support." });
  }
  let valid: boolean;
  try { valid = await checkDomainMail(domain); }
  catch (error) {
    console.error("[EmailPolicy] DNS mail check temporarily failed", error instanceof Error ? error.name : "UnknownError");
    throw new TRPCError({ code: "TIMEOUT", message: "Email domain checks are temporarily unavailable. Please retry.", cause: error });
  }
  if (!valid) throw new TRPCError({ code: "BAD_REQUEST", message: "This domain cannot receive email. Check your email address." });
}

const domainSchema = z.string().transform((value, ctx) => {
  try { return normalizeDomain(value); }
  catch { ctx.addIssue({ code: "custom", message: "Enter a domain such as example.com." }); return z.NEVER; }
});

export const adminEmailPolicyProcedures = {
  emailPolicy: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const { metadata } = await loadDisposableDomains();
    return { metadata, stale: Date.now() - Date.parse(metadata.updatedAt) > 7 * 86400_000,
      overrides: await db.select().from(emailDomainOverrides).orderBy(emailDomainOverrides.domain) };
  }),
  setEmailDomainOverride: adminProcedure.input(z.object({
    domain: domainSchema, policy: z.enum(["allow", "block", "inherit"]), reason: z.string().trim().min(5).max(500),
  })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await db.transaction(async tx => {
      if (input.policy === "inherit") {
        await tx.delete(emailDomainOverrides).where(eq(emailDomainOverrides.domain, input.domain));
      } else {
        await tx.insert(emailDomainOverrides).values({ domain: input.domain, policy: input.policy, reason: input.reason })
          .onDuplicateKeyUpdate({ set: { policy: input.policy, reason: input.reason } });
      }
      await tx.insert(moderationRecords).values({ actorId: ctx.user.id, entityType: "conversation",
        entityId: `email-domain:${createHash("sha256").update(input.domain).digest("hex").slice(0, 48)}`,
        action: `email_domain_${input.policy}`, reason: `${input.domain}: ${input.reason}` });
    });
    return { success: true };
  }),
};
