import { describe, expect, it } from "vitest";
import { heroSlides } from "./heroSlides";

describe("KwantuHub hero slides", () => {
  it("provides the marketplace, featured vendor, and Christmas sale journeys", () => {
    expect(heroSlides).toHaveLength(3);
    expect(heroSlides.map((slide) => slide.label)).toEqual([
      "The marketplace introduction",
      "Featured vendor spotlight",
      "Christmas sale collection",
    ]);
  });

  it("keeps every slide image-led and gives the Christmas sale a dedicated category destination", () => {
    expect(heroSlides.every((slide) => slide.image.startsWith("/manus-storage/"))).toBe(true);
    expect(heroSlides[2]).toMatchObject({
      primaryLabel: "Shop the Christmas sale",
      primaryHref: "/categories/christmas-sale",
    });
  });

  it("uses an ink-dark reading layer and a maker-focused crop throughout the carousel", () => {
    expect(heroSlides.every((slide) => slide.tone === "ink")).toBe(true);
    expect(heroSlides[1].position).toBe("52% 78%");
  });
});
