import { describe, expect, it } from "vitest";
import {
  defaultHeroSlides,
  heroContentSchema,
  safeContentLink,
} from "../shared/siteContent";
import { activeHeroSlides } from "./siteContent";
import type { siteHeroSlides } from "../drizzle/schema";

describe("homepage content policy", () => {
  it("validates the unchanged default slides", () => {
    expect(defaultHeroSlides).toHaveLength(3);
    for (const slide of defaultHeroSlides)
      expect(heroContentSchema.safeParse(slide).success).toBe(true);
  });
  it.each([
    "//evil.test",
    "/\\evil.test",
    "javascript:alert(1)",
    "http://example.test",
    "https://user:secret@example.test",
    "/foo\nbar",
  ])("rejects unsafe CTA %s", link => {
    expect(safeContentLink.safeParse(link).success).toBe(false);
  });
  it.each([
    "/marketplace?type=service",
    "/vendors",
    "https://example.test/page",
  ])("accepts CTA %s", link => {
    expect(safeContentLink.safeParse(link).success).toBe(true);
  });
  it("requires alt text and bounded copy", () => {
    expect(
      heroContentSchema.safeParse({ ...defaultHeroSlides[0], alt: " " }).success
    ).toBe(false);
    expect(
      heroContentSchema.safeParse({
        ...defaultHeroSlides[0],
        headline: "x".repeat(121),
      }).success
    ).toBe(false);
  });
  it("uses defaults only for an empty table, not intentionally inactive or scheduled content", () => {
    const now = new Date("2026-10-26T12:00:00Z");
    const row: typeof siteHeroSlides.$inferSelect = {
      id: 10,
      content: defaultHeroSlides[0],
      revision: 1,
      sortOrder: 0,
      isActive: true,
      startsAt: now,
      endsAt: new Date(now.getTime() + 1000),
      updatedAt: now,
    };
    expect(activeHeroSlides([])).toEqual(defaultHeroSlides);
    expect(activeHeroSlides([row], new Date(now.getTime() - 1))).toEqual([]);
    expect(activeHeroSlides([row], now)).toMatchObject([{ id: "10" }]);
    expect(activeHeroSlides([row], new Date(now.getTime() + 1000))).toEqual([]);
    expect(activeHeroSlides([{ ...row, isActive: false }], now)).toEqual([]);
  });
});
