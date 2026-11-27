import { describe, expect, it } from "vitest";
import { assertProvisionableAccount, parseAdminProvisioningArgs } from "./adminProvisioning";

describe("explicit administrator provisioning", () => {
  it("requires an explicit matching email confirmation", () => {
    expect(parseAdminProvisioningArgs(["--email", "Owner@Example.com", "--confirm-email", "owner@example.com"]))
      .toBe("owner@example.com");
    expect(() => parseAdminProvisioningArgs([])).toThrow("Usage");
    expect(() => parseAdminProvisioningArgs(["--email", "a@example.com", "--confirm-email", "b@example.com"]))
      .toThrow("confirmation");
    expect(() => parseAdminProvisioningArgs(["--email", "invalid", "--confirm-email", "invalid"])).toThrow();
  });

  it("refuses missing, unverified, suspended, vendor and non-password accounts", () => {
    const eligible = { role: "buyer", status: "active", emailVerifiedAt: new Date(), passwordHash: "hash" };
    expect(() => assertProvisionableAccount(eligible)).not.toThrow();
    for (const user of [undefined, { ...eligible, emailVerifiedAt: null }, { ...eligible, status: "suspended" },
      { ...eligible, role: "vendor" }, { ...eligible, passwordHash: null }]) {
      expect(() => assertProvisionableAccount(user)).toThrow();
    }
  });
});
