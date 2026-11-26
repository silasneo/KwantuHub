import type { Express } from "express";
import { and, eq } from "drizzle-orm";
import { getDb } from "./db";
import {
  listingMedia,
  listings,
  storefronts,
  vendorProfiles,
} from "../drizzle/schema";
import { ENV } from "./_core/env";
import {
  publicListingEligibility,
  publicVendorEligibility,
} from "./publicEligibility";
import { getPublicMediaUrl } from "./storage";
import {
  canonicalPagePath,
  PRIVATE_PAGES,
  PUBLIC_PAGES,
  SEO_DESCRIPTION,
  SEO_TITLE,
} from "../shared/seo";

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    char =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[char]!
  );
const origin = (base = ENV.appUrl) => new URL(base).origin;
const excerpt = (text: string | null | undefined) =>
  text
    ?.replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200) || SEO_DESCRIPTION;

export function buildRobotsTxt(baseUrl = ENV.appUrl) {
  return `User-agent: *
Allow: /
${[...PRIVATE_PAGES, "/api/", "/register", "/vendor-portal"].map(path => `Disallow: ${path}$\nDisallow: ${path.endsWith("/") ? path : `${path}/`}`).join("\n")}

Sitemap: ${origin(baseUrl)}/sitemap.xml
`;
}

export function buildSitemapXml(baseUrl: string, paths: string[]) {
  const safePaths = Array.from(
    new Set(paths.map(path => canonicalPagePath(path || "/")))
  ).filter(
    path =>
      Boolean(PUBLIC_PAGES[path]) ||
      /^\/(?:listings|vendors)\/[a-zA-Z0-9_-]+$/.test(path)
  );
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${safePaths.map(path => `  <url><loc>${escapeHtml(`${origin(baseUrl)}${path}`)}</loc></url>`).join("\n")}
</urlset>`;
}

export type PageMetadata = {
  status: number;
  title: string;
  description: string;
  path: string;
  noindex?: boolean;
  image?: string;
  type?: "website" | "product";
  jsonLd?: Record<string, unknown>;
  redirect?: string;
};

/** Only selects publicly eligible content; never records analytics or renders private previews. */
export async function resolvePageMetadata(
  path: string,
  preview = false
): Promise<PageMetadata> {
  const canonical = canonicalPagePath(path);
  const base: PageMetadata = {
    status: 200,
    title: PUBLIC_PAGES[path] || SEO_TITLE,
    description: SEO_DESCRIPTION,
    path: canonical,
  };
  if (canonical !== path) return { ...base, status: 308, redirect: canonical };
  if (PRIVATE_PAGES.includes(path)) return { ...base, noindex: true };
  if (PUBLIC_PAGES[path]) return { ...base, noindex: preview };
  const match = /^\/(listings|vendors)\/([a-zA-Z0-9_-]+)$/.exec(path);
  if (!match)
    return {
      ...base,
      status: 404,
      title: "Page not found | KwantuHub",
      noindex: true,
    };
  if (preview) return { ...base, noindex: true };
  const db = await getDb();
  if (!db) return { ...base, status: 503, noindex: true };
  if (match[1] === "listings") {
    const [item] = await db
      .select({
        id: listings.id,
        title: listings.title,
        description: listings.description,
        listingType: listings.listingType,
      })
      .from(listings)
      .where(and(eq(listings.slug, match[2]), publicListingEligibility()))
      .limit(1);
    if (item) {
      const [media] = await db
        .select({ url: listingMedia.url, storageKey: listingMedia.storageKey })
        .from(listingMedia)
        .where(eq(listingMedia.listingId, item.id))
        .orderBy(listingMedia.sortOrder)
        .limit(1);
      const image = media?.storageKey
        ? getPublicMediaUrl(media.storageKey)
        : media?.url || undefined;
      return {
        ...base,
        title: `${item.title} | KwantuHub`,
        description: excerpt(item.description),
        type: "product",
        image,
        jsonLd: {
          "@context": "https://schema.org",
          "@type": item.listingType === "service" ? "Service" : "Product",
          name: item.title,
          description: excerpt(item.description),
          url: `${origin()}${path}`,
          ...(image ? { image: new URL(image, origin()).href } : {}),
        },
      };
    }
  } else {
    const [item] = await db
      .select({
        name: storefronts.displayName,
        description: storefronts.description,
        headline: storefronts.headline,
        logoUrl: storefronts.logoUrl,
        logoStorageKey: storefronts.logoStorageKey,
      })
      .from(storefronts)
      .innerJoin(vendorProfiles, eq(storefronts.vendorId, vendorProfiles.id))
      .where(and(eq(storefronts.slug, match[2]), publicVendorEligibility()))
      .limit(1);
    if (item) {
      const image = item.logoStorageKey
        ? getPublicMediaUrl(item.logoStorageKey)
        : item.logoUrl || undefined;
      return {
        ...base,
        title: `${item.name} | KwantuHub`,
        description: excerpt(item.description || item.headline),
        image,
        jsonLd: {
          "@context": "https://schema.org",
          "@type": "Organization",
          name: item.name,
          description: excerpt(item.description || item.headline),
          url: `${origin()}${path}`,
        },
      };
    }
  }
  return {
    ...base,
    status: 404,
    title: "Page not found | KwantuHub",
    noindex: true,
  };
}

export function renderPageMetadata(template: string, meta: PageMetadata) {
  const url = `${origin()}${meta.path}`;
  const image = meta.image ? new URL(meta.image, origin()).href : undefined;
  const cleaned = template
    .replace(/<title\b[^>]*>[\s\S]*?<\/title>/gi, "")
    .replace(
      /<meta\b(?=[^>]*(?:name|property)=["'](?:description|robots|og:[^"']+|twitter:[^"']+)["'])[^>]*>/gi,
      ""
    )
    .replace(/<link\b(?=[^>]*rel=["']canonical["'])[^>]*>/gi, "")
    .replace(
      /<script\b(?=[^>]*id=["']kwantuhub-jsonld["'])[^>]*>[\s\S]*?<\/script>/gi,
      ""
    );
  const tag = (attribute: string, name: string, value: string) =>
    `<meta ${attribute}="${name}" content="${escapeHtml(value)}" />`;
  const tags = [
    `<title>${escapeHtml(meta.title)}</title>`,
    tag("name", "kwantu-origin", origin()),
    tag("name", "description", meta.description),
    tag("name", "robots", meta.noindex ? "noindex, nofollow" : "index, follow"),
    tag("property", "og:site_name", "KwantuHub"),
    tag("property", "og:title", meta.title),
    tag("property", "og:description", meta.description),
    tag("property", "og:type", meta.type || "website"),
    tag("property", "og:url", url),
    tag("name", "twitter:card", image ? "summary_large_image" : "summary"),
    tag("name", "twitter:title", meta.title),
    tag("name", "twitter:description", meta.description),
    ...(image
      ? [
          tag("property", "og:image", image),
          tag("name", "twitter:image", image),
        ]
      : []),
    ...(!meta.noindex
      ? [`<link rel="canonical" href="${escapeHtml(url)}" />`]
      : []),
    ...(meta.jsonLd
      ? [
          `<script id="kwantuhub-jsonld" type="application/ld+json">${JSON.stringify(meta.jsonLd).replace(/</g, "\\u003c")}</script>`,
        ]
      : []),
  ];
  return cleaned.replace("</head>", `${tags.join("\n")}\n</head>`);
}

export function registerSeoEndpoints(app: Express) {
  app.get("/robots.txt", (_req, res) =>
    res.type("text/plain").send(buildRobotsTxt())
  );
  app.get("/sitemap.xml", async (_req, res) => {
    try {
      const db = await getDb();
      if (!db) return res.status(503).set("Retry-After", "60").end();
      const approved = await db
        .select({ slug: storefronts.slug })
        .from(storefronts)
        .innerJoin(vendorProfiles, eq(storefronts.vendorId, vendorProfiles.id))
        .where(publicVendorEligibility());
      const published = await db
        .select({ slug: listings.slug })
        .from(listings)
        .where(publicListingEligibility());
      return res
        .type("application/xml")
        .send(
          buildSitemapXml(ENV.appUrl, [
            ...Object.keys(PUBLIC_PAGES),
            ...approved.map(v => `/vendors/${v.slug}`),
            ...published.map(l => `/listings/${l.slug}`),
          ])
        );
    } catch (error) {
      console.error("[SEO] Sitemap generation failed", error instanceof Error ? error.name : "Error");
      return res.status(503).set("Retry-After", "60").end();
    }
  });
}
