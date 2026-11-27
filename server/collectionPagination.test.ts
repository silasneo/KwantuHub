import { describe, expect, it } from "vitest";
import { pageInput, pagination } from "../shared/pagination";

describe("collection pagination contract", () => {
  it("supplies bounded defaults and exact totals independently of the returned page", () => {
    expect(pageInput.parse({})).toEqual({ page: 1, pageSize: 20 });
    expect(pagination(55, { page: 3, pageSize: 20 })).toEqual({
      page: 3,
      pageSize: 20,
      total: 55,
      totalPages: 3,
    });
    expect(pagination(0, { page: 1, pageSize: 20 }).totalPages).toBe(1);
    expect(pagination(50, { page: 2, pageSize: 50 }).totalPages).toBe(1);
  });

  it.each([
    { page: 0 },
    { page: -1 },
    { page: 10001 },
    { page: 1.5 },
    { pageSize: 0 },
    { pageSize: 51 },
  ])("rejects unsupported paging input %j", input => {
    expect(pageInput.safeParse(input).success).toBe(false);
  });

  it("does not leak filters or resource identifiers into pagination metadata", () => {
    const input = { page: 1, pageSize: 20, inquiryId: 77, preview: true };
    expect(Object.keys(pagination(1, input)).sort()).toEqual([
      "page",
      "pageSize",
      "total",
      "totalPages",
    ]);
  });
});
