import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { createServer, type Server } from "node:http";
import fs from "node:fs";

const state = vi.hoisted(() => ({ rows: [] as unknown[][], available: true }));
vi.mock("./db", () => ({
  getDb: vi.fn(async () =>
    state.available
      ? {
          select: () => {
            const chain: Record<string, unknown> = {};
            for (const key of [
              "from",
              "innerJoin",
              "where",
              "limit",
              "orderBy",
            ])
              chain[key] = () => chain;
            chain.then = (resolve: (rows: unknown[]) => unknown) =>
              Promise.resolve(state.rows.shift() || []).then(resolve);
            return chain;
          },
        }
      : null
  ),
}));
vi.mock("./storage", () => ({
  getPublicMediaUrl: (key: string) => `/media/${key}`,
}));
vi.mock("./_core/env", () => ({ ENV: { appUrl: "https://market.example" } }));

import {
  buildRobotsTxt,
  buildSitemapXml,
  registerSeoEndpoints,
  renderPageMetadata,
  resolvePageMetadata,
} from "./seoService";
import { sendSpaPage, serveStatic } from "./_core/vite";

let server: Server | undefined;
beforeEach(() => {
  state.rows = [];
  state.available = true;
});
afterEach(async () => {
  if (server)
    await new Promise<void>(resolve => server!.close(() => resolve()));
  server = undefined;
});

async function serve() {
  const app = express();
  registerSeoEndpoints(app);
  app.get("*", (req, res) => {
    void sendSpaPage(
      req,
      res,
      '<html><head><title>Old</title><meta property="og:title" content="Old"/></head><body><div id="root"></div></body></html>'
    );
  });
  server = createServer(app);
  await new Promise<void>(resolve => server!.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No test port");
  return `http://127.0.0.1:${address.port}`;
}

describe("public SEO publication policy", () => {
  it("uses real routes, excludes private URLs, canonicalizes aliases and escapes XML", () => {
    const xml = buildSitemapXml("https://market.example/", [
      "",
      "/marketplace",
      "/story",
      "/vendor/shop",
      "/storefronts/shop",
      "/vendors/shop",
      "/account",
      "/profile",
      "/vendor",
      "/admin",
      "/api/test",
      "/listings/a?preview=true",
      "//evil.test",
      "/missing",
    ]);
    expect(xml).toContain("https://market.example/about");
    expect(xml.match(/https:\/\/market.example\/vendors\/shop/g)).toHaveLength(
      1
    );
    for (const path of [
      "/story",
      "/vendor/shop",
      "/storefronts/",
      "/account",
      "/profile",
      "/admin",
      "/api/",
      "evil.test",
      "?preview",
    ])
      expect(xml).not.toContain(path);
    const robots = buildRobotsTxt("https://market.example");
    for (const path of [
      "/vendor$",
      "/vendor/",
      "/profile",
      "/verify-account",
      "/reset-password",
      "/api/",
    ])
      expect(robots).toContain(`Disallow: ${path}`);
    expect(robots).not.toContain("Disallow: /vendors");
  });

  it("renders public listing metadata without Javascript or analytics side effects", async () => {
    state.rows = [
      [
        {
          id: 1,
          title: 'Art </script><script>alert("x")</script>',
          description: "Handwoven art",
        },
      ],
      [{ storageKey: "art.webp" }],
    ];
    const base = await serve();
    const response = await fetch(`${base}/listings/art`);
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(html).toContain('property="og:type" content="product"');
    expect(html).toContain(
      'property="og:image" content="https://market.example/media/art.webp"'
    );
    expect(html).toContain(
      'rel="canonical" href="https://market.example/listings/art"'
    );
    expect(html).toContain(
      'name="twitter:description" content="Handwoven art"'
    );
    expect(html).not.toContain('<script>alert("x")');
    expect(html).toContain("\\u003c/script>");
    expect(html.match(/property="og:title"/g)).toHaveLength(1);
  });

  it("provides server-visible storefront social metadata", async () => {
    state.rows = [
      [
        {
          name: "Diaspora Arts",
          description: "African artisans",
          logoStorageKey: "logo.webp",
        },
      ],
    ];
    const meta = await resolvePageMetadata("/vendors/diaspora");
    expect(meta).toMatchObject({
      status: 200,
      title: "Diaspora Arts | KwantuHub",
      image: "/media/logo.webp",
    });
    expect(renderPageMetadata("<head></head>", meta)).toContain(
      '"@type":"Organization"'
    );
  });

  it.each(["/missing", "/listings/hidden", "/vendors/suspended"])(
    "returns actual HTTP 404/noindex for %s",
    async path => {
      const response = await fetch(`${await serve()}${path}`);
      expect(response.status).toBe(404);
      expect(response.headers.get("x-robots-tag")).toContain("noindex");
      expect(await response.text()).not.toContain('rel="canonical"');
    }
  );

  it.each([
    "/account",
    "/profile",
    "/vendor",
    "/vendor/onboarding",
    "/admin",
    "/reset-password",
    "/listings/secret?preview=true",
  ])("never indexes private %s", async path => {
    const response = await fetch(`${await serve()}${path}`);
    expect(response.status).toBe(200);
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    const html = await response.text();
    expect(html).not.toContain('rel="canonical"');
    expect(html).not.toContain("application/ld+json");
  });

  it.each([
    ["/story", "/about"],
    ["/vendor/shop", "/vendors/shop"],
    ["/storefronts/shop", "/vendors/shop"],
  ])("redirects old %s to %s", async (path, canonical) => {
    const response = await fetch(`${await serve()}${path}`, {
      redirect: "manual",
    });
    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe(canonical);
  });

  it("builds sitemap using eligible results and fails transiently when database is unavailable", async () => {
    state.rows = [[{ slug: "shop" }], [{ slug: "art" }]];
    const base = await serve();
    const response = await fetch(`${base}/sitemap.xml`);
    expect(await response.text()).toContain("/vendors/shop");
    state.available = false;
    expect((await fetch(`${base}/sitemap.xml`)).status).toBe(503);
    const page = await fetch(`${base}/listings/art`);
    expect(page.status).toBe(503);
    expect(page.headers.get("x-robots-tag")).toContain("noindex");
  });

  it("applies HTTP status and metadata in the actual production static fallback", async () => {
    const exists = vi.spyOn(fs, "existsSync").mockReturnValue(true);
    const read = vi
      .spyOn(fs.promises, "readFile")
      .mockResolvedValue(
        "<html><head><title>Static default</title></head><body>SPA</body></html>"
      );
    try {
      const app = express();
      serveStatic(app);
      server = createServer(app);
      await new Promise<void>(resolve =>
        server!.listen(0, "127.0.0.1", resolve)
      );
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("No port");
      const base = `http://127.0.0.1:${address.port}`;
      const page = await fetch(`${base}/unknown`);
      expect(page.status).toBe(404);
      expect(page.headers.get("x-robots-tag")).toContain("noindex");
      const privatePage = await fetch(`${base}/vendor`);
      expect(privatePage.status).toBe(200);
      expect(privatePage.headers.get("x-robots-tag")).toContain("noindex");
      expect((await fetch(`${base}/index.html`)).status).toBe(404);
      const home = await fetch(base);
      expect(home.status).toBe(200);
      expect(await home.text()).toContain(
        'rel="canonical" href="https://market.example/"'
      );
    } finally {
      read.mockRestore();
      exists.mockRestore();
    }
  });

  it("resolves the original URL inside the development wildcard middleware", async () => {
    const app = express();
    app.use("*", (req, res) => {
      void sendSpaPage(req, res, "<head></head>");
    });
    server = createServer(app);
    await new Promise<void>(resolve => server!.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("No port");
    expect(
      (await fetch(`http://127.0.0.1:${address.port}/missing`)).status
    ).toBe(404);
  });
});
