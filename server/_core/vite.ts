import express, { type Express } from "express";
import fs from "fs";
import { type Server } from "http";
import { nanoid } from "nanoid";
import path from "path";
import { createServer as createViteServer } from "vite";
import viteConfig from "../../vite.config";
import { renderPageMetadata, resolvePageMetadata } from "../seoService";
import type { Request, Response } from "express";

export async function sendSpaPage(
  req: Request,
  res: Response,
  template: string
) {
  try {
    const metadata = await resolvePageMetadata(
      req.originalUrl.split("?")[0],
      req.query.preview !== undefined
    );
    res.setHeader("Cache-Control", "no-store");
    if (metadata.redirect)
      return res.redirect(
        metadata.status,
        metadata.redirect +
          (req.query.preview !== undefined ? "?preview=1" : "")
      );
    if (metadata.noindex) res.setHeader("X-Robots-Tag", "noindex, nofollow");
    if (metadata.status === 503) res.setHeader("Retry-After", "60");
    return res
      .status(metadata.status)
      .type("html")
      .send(renderPageMetadata(template, metadata));
  } catch {
    return res
      .status(503)
      .set({
        "X-Robots-Tag": "noindex, nofollow",
        "Cache-Control": "no-store",
        "Retry-After": "60",
      })
      .type("text")
      .send("Page temporarily unavailable.");
  }
}

export async function setupVite(app: Express, server: Server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "../..",
        "client",
        "index.html"
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      await sendSpaPage(req, res, page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  const distPath =
    process.env.NODE_ENV === "development"
      ? path.resolve(import.meta.dirname, "../..", "dist", "public")
      : path.resolve(import.meta.dirname, "public");
  if (!fs.existsSync(distPath)) {
    console.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }

  const assets = express.static(distPath, { index: false });
  app.use((req, res, next) => {
    if (/\.html$/i.test(req.path)) return next();
    return assets(req, res, next);
  });

  // fall through to index.html if the file doesn't exist
  app.get("*", async (req, res, next) => {
    try {
      const template = await fs.promises.readFile(
        path.resolve(distPath, "index.html"),
        "utf-8"
      );
      await sendSpaPage(req, res, template);
    } catch (error) {
      next(error);
    }
  });
}
