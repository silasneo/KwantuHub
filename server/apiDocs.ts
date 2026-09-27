import type { Express } from "express";
import { openapiDocument } from "./openapi";

export function registerApiDocs(app: Express) {
  app.get("/openapi.json", (_req, res) => {
    res.type("application/json").send(openapiDocument);
  });

  app.get("/api-docs", (_req, res) => {
    res.type("html").send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>KwantuHub API Docs</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
    <style>
      html { box-sizing: border-box; overflow-y: scroll; }
      *, *:before, *:after { box-sizing: inherit; }
      body { margin: 0; background: #f0e8dc; }
      .swagger-ui .topbar { background: #0a0a0a; }
      .swagger-ui .topbar .download-url-wrapper input { border-color: #d71466; }
      .swagger-ui .info .title { font-family: Georgia, serif; }
      .swagger-ui .opblock.opblock-get { border-color: #d71466; }
      .swagger-ui .opblock.opblock-post { border-color: #fe8129; }
    </style>
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
    <script>
      window.onload = function () {
        window.ui = SwaggerUIBundle({
          url: '/openapi.json',
          dom_id: '#swagger-ui',
          deepLinking: true,
          persistAuthorization: true,
          presets: [SwaggerUIBundle.presets.apis]
        });
      };
    </script>
  </body>
</html>`);
  });
}
