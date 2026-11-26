export type CategoryGroupDefinition = {
  key: string;
  title: string;
  slugs: readonly string[];
};

export const CATEGORY_GROUPS: readonly CategoryGroupDefinition[] = [
  {
    key: "style",
    title: "Textiles & style",
    slugs: ["fashion-textiles", "beauty-personal-care", "arts-crafts-culture"],
  },
  {
    key: "food",
    title: "Food & celebration",
    slugs: [
      "african-food-groceries",
      "agriculture-african-products",
      "events-celebrations",
      "media-music-entertainment",
    ],
  },
  {
    key: "learning",
    title: "Learning & culture",
    slugs: ["education-learning", "family-community", "community-organizations"],
  },
  {
    key: "home",
    title: "Care & home",
    slugs: ["home-living", "health-wellness", "professional-business-services"],
  },
  {
    key: "borders",
    title: "Life across borders",
    slugs: [
      "real-estate-housing",
      "travel-experiences",
      "automotive-transport",
      "jobs-opportunities",
      "other-general",
    ],
  },
];

const OTHER_GROUP = { key: "other", title: "More to explore" } as const;

/**
 * Groups live categories for navigation. Unknown or newly added categories
 * fall into a trailing "More to explore" group so none are hidden.
 */
export function groupCategories<T extends { slug: string }>(categories: readonly T[]) {
  const bySlug = new Map(categories.map(category => [category.slug, category]));
  const used = new Set<string>();
  const groups = CATEGORY_GROUPS.map(group => {
    const items = group.slugs.flatMap(slug => {
      const category = bySlug.get(slug);
      if (!category) return [];
      used.add(slug);
      return [category];
    });
    return { key: group.key, title: group.title, items };
  }).filter(group => group.items.length > 0);
  const rest = categories.filter(category => !used.has(category.slug));
  if (rest.length) groups.push({ ...OTHER_GROUP, items: rest });
  return groups;
}
