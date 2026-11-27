import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure } from "./_core/trpc";
import { getDb } from "./db";
import { getAdminFunnelAnalytics, getLeadFunnelAnalytics } from "./analytics";
import {
  generateAggregateCsv,
  type AggregateReportRow,
} from "./marketplaceReporting";
import { moderationRecords } from "../drizzle/schema";

export const analyticsFilterSchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  vendorId: z.number().int().positive().optional(),
  categoryId: z.number().int().positive().optional(),
});

export const adminReportingProcedures = {
  exportReport: protectedProcedure
    .input(analyticsFilterSchema)
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const metrics = await getAdminFunnelAnalytics(input);
      const leads = await getLeadFunnelAnalytics(input);
      const rows: AggregateReportRow[] = [
        {
          domain: "accounts",
          metric: "users_created",
          value: metrics.users,
          note: "UTC date scope only; not category/vendor scope.",
        },
        {
          domain: "vendors",
          metric: "vendors_created",
          value: metrics.vendors,
          note: "UTC date and vendor scope; not category scope.",
        },
        {
          domain: "marketplace",
          metric: "listings_created",
          value: metrics.listings,
          note: "UTC date, vendor and category scope.",
        },
        {
          domain: "marketplace",
          metric: "listing_views",
          value: metrics.listingViews,
          note: "Events within UTC date, vendor and category scope.",
        },
        {
          domain: "marketplace",
          metric: "contact_reveals",
          value: metrics.contactReveals,
          note: "Events within UTC date, vendor and category scope.",
        },
        {
          domain: "inquiries",
          metric: "created",
          value: metrics.inquiries,
          note: "Inquiry creation cohort within UTC date, vendor and category scope.",
        },
        {
          domain: "inquiries",
          metric: "responded",
          value: metrics.replies,
          rate: `${(metrics.responseRate * 100).toFixed(2)}%`,
          note: "Distinct inquiries with a vendor reply by the end date, not message count.",
        },
        {
          domain: "inquiries",
          metric: "currently_closed",
          value: metrics.resolutions,
          rate: `${(metrics.resolutionRate * 100).toFixed(2)}%`,
          note: "Current closed state of the creation cohort; not historical state as of end date.",
        },
        {
          domain: "leads",
          metric: "currently_won",
          value: leads.won,
          rate: `${(leads.conversionRate * 100).toFixed(2)}%`,
          note: "Vendor-recorded current won stage in the inquiry creation cohort; not platform checkout/payment evidence.",
        },
      ];
      await db.insert(moderationRecords).values({
        entityType: "report",
        entityId: "aggregate",
        actorId: ctx.user.id,
        action: "aggregate_csv_exported",
        reason: JSON.stringify(metrics.scope),
      });
      return {
        filename: `kwantuhub-aggregate-${new Date().toISOString().slice(0, 10)}.csv`,
        csv: generateAggregateCsv(rows),
      };
    }),
};
