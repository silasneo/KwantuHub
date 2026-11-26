import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ items: [] as object[], error: null as { message: string } | null }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ notifications: { list: { invalidate: vi.fn() }, unreadCount: { invalidate: vi.fn() } } }),
    notifications: {
      list: { useQuery: () => ({ data: { items: mocks.items, unreadCount: 0, nextCursor: null }, isLoading: false, error: mocks.error, refetch: vi.fn() }) },
      markRead: { useMutation: () => ({ mutate: vi.fn() }) },
      markAllRead: { useMutation: () => ({ mutate: vi.fn() }) },
    },
  },
}));
import { NotificationCenter } from "../client/src/components/NotificationCenter";
import { CollectionPager } from "../client/src/components/CollectionPager";

describe("collection navigation markup", () => {
  it.each([0, 2])("renders exactly one notification pager with %i notification rows", count => {
    mocks.error = null;
    mocks.items = Array.from({ length: count }, (_, index) => ({
      id: index, title: "Notice", body: "Body", createdAt: new Date("2026-01-01"), readAt: null,
    }));
    const html = renderToStaticMarkup(createElement(NotificationCenter, { mode: "panel" }));
    expect(html.match(/aria-label="Notification pagination"/g)).toHaveLength(1);
    expect(html).toContain("Page 1");
  });
  it("surfaces notification failures instead of claiming the user is caught up", () => {
    mocks.items = [];
    mocks.error = { message: "Updates unavailable" };
    const html = renderToStaticMarkup(createElement(NotificationCenter, { mode: "panel" }));
    expect(html).toContain('role="alert"');
    expect(html).toContain("Updates unavailable");
    expect(html).not.toContain("all caught up");
    mocks.error = null;
  });
  it("shows real collection totals and an accessible pager name", () => {
    const html = renderToStaticMarkup(createElement(CollectionPager, {
      pagination: { page: 2, totalPages: 3, total: 55 }, onPage: vi.fn(), label: "Saved items",
    }));
    expect(html).toContain('aria-label="Saved items pagination"');
    expect(html).toContain("Page 2 of 3");
    expect(html).toContain("55 total");
  });
});
