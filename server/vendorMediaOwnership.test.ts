import { beforeEach, describe, expect, it, vi } from "vitest";

const fake = vi.hoisted(() => ({
  tx: { select: vi.fn(), update: vi.fn(), delete: vi.fn(), insert: vi.fn() },
  transaction: vi.fn(),
}));
vi.mock("./db", async importOriginal => ({
  ...await importOriginal<typeof import("./db")>(),
  getDb: async () => ({ transaction: fake.transaction }),
  getVendorProfileByUserId: async () => ({ id: 12, approvalStatus: "approved", storefront: { id: 1 } }),
}));
vi.mock("./accountSecurity", async importOriginal => ({
  ...await importOriginal<typeof import("./accountSecurity")>(), enforceAuthRateLimit: vi.fn(),
}));
import { appRouter } from "./routers";

describe("vendor listing transaction ownership boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    let select = 0;
    fake.tx.select.mockImplementation(() => {
      const call = select++;
      const result = call === 0 ? [{ id: 12, approvalStatus: "approved" }] : call === 1 ? [{ id: 1, isActive: true }] : [];
      const query: any = {
        from: () => query, where: () => query, for: async () => result,
        then: (resolve: (rows: unknown[]) => unknown, reject: (error: unknown) => unknown) => Promise.resolve(result).then(resolve, reject),
      };
      return query;
    });
    fake.transaction.mockImplementation(async callback => callback(fake.tx));
  });

  it.each([{ media: [] }, { media: ["/media/public/vendors/12/8c6cc968-c75e-43a4-ae2f-b8996be33f07.webp"] }])(
    "rejects missing or another vendor's ID before any mutation (media $media)", async ({ media }) => {
      const caller = appRouter.createCaller({
        user: { id: 10, role: "vendor", emailVerifiedAt: new Date() }, req: {}, res: {},
      } as any);
      await expect(caller.vendor.saveListing({
        id: 999, title: "Listing title", description: "Long description", categoryId: 1,
        listingType: "product", status: "draft", media,
      })).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect(fake.transaction).toHaveBeenCalledOnce();
      expect(fake.tx.update).not.toHaveBeenCalled();
      expect(fake.tx.delete).not.toHaveBeenCalled();
      expect(fake.tx.insert).not.toHaveBeenCalled();
    }
  );
});
