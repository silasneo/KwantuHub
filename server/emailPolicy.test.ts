import { describe, expect, it, vi } from "vitest";
import { checkDomainMail, domainSuffixes, emailDns, loadDisposableDomains, normalizeDomain } from "./emailPolicy";

const dnsError = (code: string) => Object.assign(new Error(code), { code });
function resolver() {
  return { mx: vi.fn().mockResolvedValue([{ exchange: "mail.example.com", priority: 10 }]),
    a: vi.fn().mockRejectedValue(dnsError("ENODATA")), aaaa: vi.fn().mockRejectedValue(dnsError("ENODATA")) };
}
describe("email domain screening", () => {
  it("normalizes IDNs and matches complete domain boundaries, never arbitrary string suffixes", () => {
    expect(normalizeDomain(" EXAMPLE.COM. ")).toBe("example.com");
    expect(normalizeDomain("münich.de")).toBe("xn--mnich-kva.de");
    expect(domainSuffixes("mail.example.com")).toEqual(["mail.example.com", "example.com"]);
    expect(domainSuffixes("notexample.com")).not.toContain("example.com");
    for (const invalid of ["user@example.com", "https://example.com", "a..com", "localhost", "-bad.com"]) {
      expect(() => normalizeDomain(invalid)).toThrow();
    }
  });
  it("accepts MX without performing mailbox probes", async () => {
    const dns = resolver();
    expect(await checkDomainMail("example.com", dns)).toBe(true);
    expect(dns.a).not.toHaveBeenCalled();
  });
  it("rejects Null MX even when address records exist", async () => {
    const dns = resolver(); dns.mx.mockResolvedValue([{ exchange: "", priority: 0 }]);
    dns.a.mockResolvedValue(["192.0.2.1"]);
    expect(await checkDomainMail("example.com", dns)).toBe(false);
    expect(dns.a).not.toHaveBeenCalled();
  });
  it("accepts A or AAAA fallback only when MX is absent", async () => {
    const dns = resolver(); dns.mx.mockRejectedValue(dnsError("ENODATA"));
    dns.aaaa.mockResolvedValue(["2001:db8::1"]);
    expect(await checkDomainMail("example.com", dns)).toBe(true);
    dns.aaaa.mockRejectedValue(dnsError("ENODATA"));
    expect(await checkDomainMail("example.com", dns)).toBe(false);
  });
  it("distinguishes temporary failures from definitive absence", async () => {
    const dns = resolver(); dns.mx.mockRejectedValue(dnsError("ETIMEOUT"));
    await expect(checkDomainMail("example.com", dns)).rejects.toMatchObject({ code: "ETIMEOUT" });
    dns.mx.mockRejectedValue(dnsError("ENOTFOUND"));
    expect(await checkDomainMail("example.com", dns)).toBe(false);
    dns.mx.mockRejectedValue(dnsError("ENODATA")); dns.a.mockRejectedValue(dnsError("ESERVFAIL"));
    await expect(checkDomainMail("example.com", dns)).rejects.toMatchObject({ code: "ESERVFAIL" });
  });
  it("loads an integrity-checked pinned snapshot including common disposable domains", async () => {
    const { domains, metadata } = await loadDisposableDomains();
    expect(metadata.revision).toMatch(/^[a-f0-9]{40}$/);
    expect(metadata.count).toBe(domains.size);
    expect(domains.has("mailinator.com")).toBe(true);
    expect(domains.has("gmail.com")).toBe(false);
  });
  it("caches definitive results without repeating DNS lookups", async () => {
    const mx = vi.spyOn(emailDns, "mx").mockResolvedValue([{ exchange: "mail.example.test", priority: 10 }]);
    try {
      expect(await checkDomainMail("cache-policy.example.test")).toBe(true);
      expect(await checkDomainMail("cache-policy.example.test")).toBe(true);
      expect(mx).toHaveBeenCalledTimes(1);
    } finally { mx.mockRestore(); }
  });
});
