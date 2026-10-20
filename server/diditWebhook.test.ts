import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  canonicalizeDiditPayload,
  mapDiditStatus,
  sortDiditKeys,
  verifyDiditSignature,
} from "./diditWebhook";
import { DiditVerificationAdapter } from "./vendorVerificationAdapters";

describe("Didit KYC adapter & webhook integration", () => {
  const secret = "test-didit-webhook-secret-1234567890";

  it("sorts object keys recursively and preserves unescaped unicode in canonical payload", () => {
    const input = {
      b: "Kwantu",
      a: {
        z: 1,
        y: "Kémet",
      },
    };

    const sorted = sortDiditKeys(input) as Record<string, unknown>;
    expect(Object.keys(sorted)).toEqual(["a", "b"]);
    expect(Object.keys(sorted.a as object)).toEqual(["y", "z"]);

    const canonical = canonicalizeDiditPayload({
      b: "Kwantu",
      a: "Kémet",
      timestamp: 1774970000,
    });
    expect(canonical).toContain('"Kémet"');
    expect(canonical.indexOf('"a"')).toBeLessThan(canonical.indexOf('"b"'));
  });

  it("verifies valid X-Signature-V2 and rejects stale or tampered requests", () => {
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      event_id: "evt_123",
      session_id: "ses_123",
      status: "Approved",
      timestamp: now,
      webhook_type: "status.updated",
    };
    const canonical = canonicalizeDiditPayload(payload);
    const signatureV2 = crypto.createHmac("sha256", secret).update(canonical, "utf8").digest("hex");

    const validResult = verifyDiditSignature(
      payload,
      Buffer.from(JSON.stringify(payload)),
      { signatureV2 },
      secret,
      now
    );
    expect(validResult.valid).toBe(true);
    expect(validResult.version).toBe("v2");

    const staleResult = verifyDiditSignature(
      { ...payload, timestamp: now - 360 },
      Buffer.from(JSON.stringify(payload)),
      { signatureV2 },
      secret,
      now
    );
    expect(staleResult.valid).toBe(false);
    expect(staleResult.reason).toBe("stale");

    const badSigResult = verifyDiditSignature(
      payload,
      Buffer.from(JSON.stringify(payload)),
      { signatureV2: "bad-signature" },
      secret,
      now
    );
    expect(badSigResult.valid).toBe(false);
    expect(badSigResult.reason).toBe("invalid-signature");
  });

  it("maps Didit statuses to KwantuHub internal verification lifecycle states", () => {
    expect(mapDiditStatus("Not Started")).toBe("created");
    expect(mapDiditStatus("In Progress")).toBe("submitted");
    expect(mapDiditStatus("Awaiting User")).toBe("submitted");
    expect(mapDiditStatus("In Review")).toBe("in_review");
    expect(mapDiditStatus("Resubmitted")).toBe("in_review");
    expect(mapDiditStatus("Approved")).toBe("approved");
    expect(mapDiditStatus("Declined")).toBe("declined");
    expect(mapDiditStatus("Expired")).toBe("expired");
    expect(mapDiditStatus("Kyc Expired")).toBe("expired");
    expect(mapDiditStatus("Abandoned")).toBe("abandoned");
    expect(mapDiditStatus("UnknownStatus")).toBeNull();
  });

  it("handles unconfigured adapter state safely without throwing in inspection", () => {
    const adapter = new DiditVerificationAdapter();
    expect(typeof adapter.isConfigured()).toBe("boolean");
    expect(adapter.provider).toBe("didit");
  });
});
