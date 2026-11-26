import { describe, expect, it } from "vitest";
import { groupCategories } from "../shared/categoryGroups";

describe("groupCategories", () => {
  it("orders known categories into navigation groups and drops empty groups", () => {
    const groups = groupCategories([
      { slug: "health-wellness" },
      { slug: "fashion-textiles" },
      { slug: "home-living" },
    ]);
    expect(groups.map(group => [group.key, group.items.map(item => item.slug)])).toEqual([
      ["style", ["fashion-textiles"]],
      ["home", ["home-living", "health-wellness"]],
    ]);
  });

  it("keeps unmapped categories visible in a trailing group", () => {
    const groups = groupCategories([{ slug: "fashion-textiles" }, { slug: "new-aisle" }]);
    expect(groups.at(-1)).toEqual({
      key: "other",
      title: "More to explore",
      items: [{ slug: "new-aisle" }],
    });
  });
});
