import { chromium } from "playwright-core";
import { mkdir } from "node:fs/promises";

const base = process.env.BASE_URL || "http://localhost:3000";
const output = new URL("../docs/screenshots/", import.meta.url).pathname;
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox"],
});

async function capturePublic(
  name,
  path,
  viewport = { width: 1440, height: 960 },
) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  await page.goto(`${base}${path}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(750);
  await page.screenshot({ path: `${output}${name}.png`, fullPage: true });
  await context.close();
}

async function captureRole(name, path, email) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
  });
  const login = await context.request.post(`${base}/api/v1/auth/login`, {
    data: { email, password: "DemoPass123!" },
  });
  if (!login.ok())
    throw new Error(`Login failed for ${email}: ${login.status()}`);
  const page = await context.newPage();
  await page.goto(`${base}${path}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${output}${name}.png`, fullPage: true });
  await context.close();
}

await capturePublic("homepage-desktop", "/");
await capturePublic(
  "marketplace-desktop",
  "/marketplace?category=fashion-textiles&type=PRODUCT&verified=true&sort=title",
);
await capturePublic("homepage-mobile", "/", { width: 390, height: 844 });
await captureRole(
  "vendor-dashboard",
  "/vendor",
  "demo.vendor.eki@kwantuhub.local",
);
await captureRole("buyer-account", "/account", "demo.buyer@kwantuhub.local");
await captureRole("admin-dashboard", "/admin", "admin@kwantuhub.local");
await browser.close();
console.log(output);
