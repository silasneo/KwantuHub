export const SEO_TITLE = "KwantuHub — African Diaspora Marketplace";
export const SEO_DESCRIPTION =
  "Discover African diaspora vendors, artisans, and services across North America.";

export const PUBLIC_PAGES: Record<string, string> = {
  "/": SEO_TITLE,
  "/marketplace": "Marketplace | KwantuHub",
  "/vendors": "Vendors | KwantuHub",
  "/about": "About | KwantuHub",
  "/privacy": "Privacy policy | KwantuHub",
  "/terms": "Terms of service | KwantuHub",
  "/support": "Support | KwantuHub",
};
export const PRIVATE_PAGES = [
  "/account",
  "/profile",
  "/vendor",
  "/vendor/onboarding",
  "/admin",
  "/login",
  "/verify-account",
  "/reset-password",
];

export function canonicalPagePath(path: string) {
  if (path === "/story") return "/about";
  return path.replace(
    /^\/(?:storefronts|vendor)\/(?!onboarding$)([^/]+)$/,
    "/vendors/$1"
  );
}

export function isPublicPage(path: string) {
  return (
    Boolean(PUBLIC_PAGES[path]) || /^\/(?:listings|vendors)\/[^/]+$/.test(path)
  );
}
