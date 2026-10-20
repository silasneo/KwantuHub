import { describe, expect, it } from "vitest";
import { normalizeAnalyticsRange, resolveAnalyticsScope, safeRate } from "./analytics";

describe("analytics policy", () => {
  it("normalizes date-only ranges to UTC day boundaries", () => {
    const normalized = normalizeAnalyticsRange({
      from: new Date("2026-10-01T18:30:00-04:00"),
      to: new Date("2026-10-03T12:00:00Z"),
    });
    expect(normalized.from?.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(normalized.to?.toISOString()).toBe("2026-10-03T23:59:59.999Z");
  });

  it("keeps reversed date filters deterministic by swapping the boundaries", () => {
    const normalized = normalizeAnalyticsRange({
      from: new Date("2026-10-10T00:00:00Z"),
      to: new Date("2026-10-05T00:00:00Z"),
    });
    expect(normalized.from?.toISOString()).toBe("2026-10-05T00:00:00.000Z");
    expect(normalized.to?.toISOString()).toBe("2026-10-10T23:59:59.999Z");
  });

  it("never produces NaN for empty funnels", () => {
    expect(safeRate(0, 0)).toBe(0);
    expect(safeRate(3, 0)).toBe(0);
    expect(safeRate(3, 12)).toBe(0.25);
  });

  it("keeps vendor scope explicit for role-isolated reporting", () => {
    const range = normalizeAnalyticsRange({ ...resolveAnalyticsScope("vendor", 42), categoryId: 7 });
    expect(range.vendorId).toBe(42);
    expect(range.categoryId).toBe(7);
  });

  it("allows admin dimension scoping but rejects buyer analytics access", () => {
    expect(resolveAnalyticsScope("admin", null, 42).vendorId).toBe(42);
    expect(() => resolveAnalyticsScope("buyer", null)).toThrow("Analytics access denied");
  });
});
