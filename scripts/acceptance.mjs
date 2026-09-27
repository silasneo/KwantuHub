import assert from "node:assert/strict";

const base = process.env.BASE_URL || "http://127.0.0.1:3000";
const stamp = Date.now();
const businessName = `Acceptance Textiles ${stamp}`;
let vendorCookie = "";
let adminCookie = "";
let buyerCookie = "";

async function request(path, options = {}, cookie = "") {
  const response = await fetch(`${base}${path}`, {
    ...options,
    headers: { ...(options.headers || {}), ...(cookie ? { cookie } : {}) },
  });
  const setCookie = response.headers.get("set-cookie")?.split(";")[0] || "";
  const body = response.headers
    .get("content-type")
    ?.includes("application/json")
    ? await response.json()
    : await response.text();
  return { response, body, setCookie };
}

const json = (body) => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});
const patch = (body) => ({
  method: "PATCH",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

const health = await request("/api/v1/health");
assert.equal(health.response.status, 200);
assert.equal(health.body.data.database, "ok");

const categories = await request("/api/v1/categories");
assert.ok(categories.body.data.length >= 18);
const category = categories.body.data.find(
  (item) => item.slug === "fashion-textiles",
);
assert.ok(category);

const vendorEmail = `acceptance.vendor.${stamp}@kwantuhub.local`;
const vendorRegistration = await request(
  "/api/v1/auth/register",
  json({
    email: vendorEmail,
    password: "AcceptancePass123!",
    name: "Acceptance Vendor",
    role: "VENDOR",
    businessName,
  }),
);
assert.equal(vendorRegistration.response.status, 201);
vendorCookie = vendorRegistration.setCookie;
const vendorId = vendorRegistration.body.data.vendorProfile.id;

const profile = await request(
  "/api/v1/vendors",
  patch({
    businessName,
    description: "Acceptance-test vendor profile.",
    location: "Houston, TX",
    serviceArea: "United States",
    remoteAvailable: false,
    contactEmail: vendorEmail,
  }),
  vendorCookie,
);
assert.equal(profile.response.status, 200);
assert.equal(profile.body.data.approvalStatus, "PENDING");
assert.ok(profile.body.data.storefront.slug.startsWith("acceptance-textiles-"));

const preapprovalListing = await request(
  "/api/v1/listings",
  json({
    title: "Blocked Before Approval",
    description: "This request must be rejected before vendor approval.",
    categoryId: category.id,
    listingType: "PRODUCT",
    priceIndication: "Contact for details",
    location: "Houston, TX",
    remoteAvailable: false,
    slug: `blocked-${stamp}`,
  }),
  vendorCookie,
);
assert.equal(preapprovalListing.response.status, 403);

const adminLogin = await request(
  "/api/v1/auth/login",
  json({ email: "admin@kwantuhub.local", password: "DemoPass123!" }),
);
assert.equal(adminLogin.response.status, 200);
adminCookie = adminLogin.setCookie;
const pending = await request("/api/v1/admin/vendors", {}, adminCookie);
assert.ok(pending.body.data.some((item) => item.id === vendorId));
const approval = await request(
  "/api/v1/admin/vendors",
  patch({ vendorId, status: "APPROVED" }),
  adminCookie,
);
assert.equal(approval.body.data.approvalStatus, "APPROVED");

const storefront = await request(
  "/api/v1/storefronts",
  patch({
    displayName: businessName,
    headline: "Cloth that carries memory",
    description: "Acceptance-test storefront.",
    location: "Houston, TX",
    serviceArea: "North America",
    remoteAvailable: false,
    website: "https://example.com",
  }),
  vendorCookie,
);
assert.equal(storefront.response.status, 200);
assert.equal(storefront.body.data.slug, profile.body.data.storefront.slug);

const listingSlug = `acceptance-ankara-${stamp}`;
const listing = await request(
  "/api/v1/listings",
  json({
    title: "Acceptance Ankara Edit",
    description:
      "A database-backed listing created by the full acceptance workflow.",
    categoryId: category.id,
    listingType: "PRODUCT",
    priceIndication: "Contact for details",
    location: "Houston, TX",
    remoteAvailable: false,
    slug: listingSlug,
  }),
  vendorCookie,
);
assert.equal(listing.response.status, 201);
assert.equal(listing.body.data.status, "DRAFT");
const listingId = listing.body.data.id;

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);
const mediaForm = new FormData();
mediaForm.set("file", new Blob([png], { type: "image/png" }), "acceptance.png");
const media = await request(
  `/api/v1/listings/${listingSlug}/media`,
  { method: "POST", body: mediaForm },
  vendorCookie,
);
assert.equal(media.response.status, 201);

const publish = await request(
  `/api/v1/listings/${listingSlug}`,
  patch({ action: "publish" }),
  vendorCookie,
);
assert.equal(publish.body.data.status, "PUBLISHED");

const search = await request(
  `/api/v1/search?q=Acceptance+Ankara&category=fashion-textiles&type=PRODUCT&location=Houston&price=Contact&verified=true&sort=title&page=1&pageSize=12`,
);
assert.equal(search.response.status, 200);
assert.ok(search.body.data.items.some((item) => item.id === listingId));
const detail = await request(`/api/v1/listings/${listingSlug}`);
assert.equal(detail.body.data.id, listingId);
const publicStorefront = await request(
  `/api/v1/vendors/${storefront.body.data.slug}`,
);
assert.equal(publicStorefront.body.data.id, vendorId);

const buyerEmail = `acceptance.buyer.${stamp}@kwantuhub.local`;
const buyerRegistration = await request(
  "/api/v1/auth/register",
  json({
    email: buyerEmail,
    password: "AcceptancePass123!",
    name: "Acceptance Buyer",
    role: "BUYER",
  }),
);
assert.equal(buyerRegistration.response.status, 201);
buyerCookie = buyerRegistration.setCookie;
const saved = await request(
  "/api/v1/wishlist",
  json({ listingId }),
  buyerCookie,
);
assert.equal(saved.response.status, 201);
const inquiry = await request(
  "/api/v1/inquiries",
  json({
    listingId,
    subject: "Acceptance inquiry",
    message: "I would like to learn more about this listing.",
  }),
  buyerCookie,
);
assert.equal(inquiry.response.status, 201);
const inquiryId = inquiry.body.data.id;

const vendorInbox = await request("/api/v1/inquiries", {}, vendorCookie);
assert.ok(vendorInbox.body.data.some((item) => item.id === inquiryId));
const reply = await request(
  "/api/v1/messages",
  json({
    inquiryId,
    body: "Thank you. This reply is persisted for the buyer.",
  }),
  vendorCookie,
);
assert.equal(reply.response.status, 201);
const buyerInbox = await request("/api/v1/inquiries", {}, buyerCookie);
assert.ok(
  buyerInbox.body.data
    .find((item) => item.id === inquiryId)
    .messages.some((message) => message.id === reply.body.data.id),
);

const unauthorizedAdmin = await request("/api/v1/admin/vendors");
assert.equal(unauthorizedAdmin.response.status, 401);
const buyerVendorRoute = await request("/api/v1/storefronts", {}, buyerCookie);
assert.equal(buyerVendorRoute.response.status, 403);

console.log(
  JSON.stringify(
    {
      passed: true,
      base,
      health: health.body.data,
      vendor: {
        email: vendorEmail,
        id: vendorId,
        storefront: storefront.body.data.slug,
      },
      listing: {
        id: listingId,
        slug: listingSlug,
        mediaUrl: media.body.data.url,
      },
      buyer: { email: buyerEmail },
      inquiry: { id: inquiryId, replyId: reply.body.data.id },
      checks: [
        "migration-backed health",
        "vendor preapproval block",
        "admin approval",
        "storefront",
        "listing draft/media/publish",
        "search filters",
        "public detail/storefront",
        "buyer save/inquiry",
        "vendor reply",
        "buyer reply visibility",
        "RBAC rejection",
      ],
    },
    null,
    2,
  ),
);
