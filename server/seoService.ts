import type { Express, Request, Response } from "express";
import { and, eq } from "drizzle-orm";
import { getDb } from "./db";
import { listings, storefronts, vendorProfiles } from "../drizzle/schema";

export function buildRobotsTxt(baseUrl = "https://kwantumkt-lgpadidm.manus.space") {
  return `User-agent: *
Allow: /
Allow: /marketplace
Allow: /vendors
Allow: /listings/
Allow: /vendor/
Allow: /story

Disallow: /admin
Disallow: /account
Disallow: /vendor-portal
Disallow: /api/
Disallow: /login
Disallow: /register

Sitemap: ${baseUrl}/sitemap.xml
`;
}

export function buildSitemapXml(baseUrl: string, paths: string[]) {
  const privatePrefixes = ["/admin", "/account", "/vendor-portal", "/api", "/login", "/register"];
  const safePaths = paths.filter(path =>
    (path === "" || path.startsWith("/")) &&
    !path.includes("@") &&
    !path.includes("?") &&
    !privatePrefixes.some(prefix => path === prefix || path.startsWith(`${prefix}/`))
  );
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${safePaths
  .map(
    path => `  <url>
    <loc>${baseUrl}${path}</loc>
    <changefreq>daily</changefreq>
    <priority>${path === "" ? "1.0" : path.startsWith("/listings/") ? "0.8" : "0.7"}</priority>
  </url>`
  )
  .join("\n")}
</urlset>`;
}

export function registerSeoEndpoints(app: Express) {
  // Robots.txt: Exclude admin, account, vendor portals, and private endpoints
  app.get("/robots.txt", (_req: Request, res: Response) => {
    res.setHeader("Content-Type", "text/plain");
    res.send(buildRobotsTxt());
  });

  // Sitemap.xml: Dynamic generator including only approved vendors and published listings
  app.get("/sitemap.xml", async (_req: Request, res: Response) => {
    res.setHeader("Content-Type", "application/xml");

    const baseUrl = "https://kwantumkt-lgpadidm.manus.space";
    const staticRoutes = [
      "",
      "/marketplace",
      "/vendors",
      "/story",
    ];

    let dynamicUrls: string[] = [];

    try {
      const db = await getDb();
      if (db) {
        // Fetch approved vendors
        const approvedVendors = await db
          .select({ slug: storefronts.slug })
          .from(storefronts)
          .innerJoin(vendorProfiles, eq(storefronts.vendorId, vendorProfiles.id))
          .where(eq(vendorProfiles.approvalStatus, "approved"));

        // Fetch published listings
        const publishedListings = await db
          .select({ slug: listings.slug })
          .from(listings)
          .where(eq(listings.status, "published"));

        dynamicUrls = [
          ...approvedVendors.map(v => `/vendor/${v.slug}`),
          ...publishedListings.map(l => `/listings/${l.slug}`),
        ];
      }
    } catch (err) {
      console.warn("[SEO] Error building dynamic sitemap:", err);
    }

    const allUrls = [...staticRoutes, ...dynamicUrls];
    const xml = buildSitemapXml(baseUrl, allUrls);

    res.send(xml);
  });
}
