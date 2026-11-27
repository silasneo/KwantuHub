import { z } from "zod";

export const pageInput = z.object({
  page: z.number().int().min(1).max(10000).default(1),
  pageSize: z.number().int().min(1).max(50).default(20),
});

export type PageInput = z.infer<typeof pageInput>;

export function pagination(total: number, input: PageInput) {
  return {
    page: input.page,
    pageSize: input.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / input.pageSize)),
  };
}
