import {
  boolean,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

/**
 * Users table with Manus OAuth identity and role support.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 255 }),
  email: varchar("email", { length: 320 }),
  passwordHash: varchar("passwordHash", { length: 255 }),
  avatarUrl: varchar("avatarUrl", { length: 1024 }),
  notificationPreferences: json("notificationPreferences"),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["buyer", "vendor", "admin"])
    .default("buyer")
    .notNull(),
  status: mysqlEnum("status", ["active", "suspended"])
    .default("active")
    .notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const categories = mysqlTable("categories", {
  id: int("id").autoincrement().primaryKey(),
  slug: varchar("slug", { length: 128 }).notNull().unique(),
  name: varchar("name", { length: 160 }).notNull(),
  parentId: int("parentId"),
  isActive: boolean("isActive").default(true).notNull(),
  sortOrder: int("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const vendorProfiles = mysqlTable("vendorProfiles", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  businessName: varchar("businessName", { length: 180 }).notNull(),
  description: text("description"),
  location: varchar("location", { length: 160 }),
  serviceArea: varchar("serviceArea", { length: 240 }),
  remoteAvailable: boolean("remoteAvailable").default(false).notNull(),
  contactEmail: varchar("contactEmail", { length: 320 }),
  phone: varchar("phone", { length: 80 }),
  whatsapp: varchar("whatsapp", { length: 80 }),
  imessage: varchar("imessage", { length: 120 }),
  instagram: varchar("instagram", { length: 120 }),
  website: varchar("website", { length: 512 }),
  approvalStatus: mysqlEnum("approvalStatus", [
    "pending",
    "approved",
    "rejected",
    "suspended",
  ])
    .default("pending")
    .notNull(),
  approvedAt: timestamp("approvedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const storefronts = mysqlTable("storefronts", {
  id: int("id").autoincrement().primaryKey(),
  vendorId: int("vendorId")
    .notNull()
    .unique()
    .references(() => vendorProfiles.id, { onDelete: "cascade" }),
  slug: varchar("slug", { length: 180 }).notNull().unique(),
  displayName: varchar("displayName", { length: 180 }).notNull(),
  headline: varchar("headline", { length: 255 }),
  description: text("description"),
  location: varchar("location", { length: 160 }),
  serviceArea: varchar("serviceArea", { length: 240 }),
  remoteAvailable: boolean("remoteAvailable").default(false).notNull(),
  logoUrl: varchar("logoUrl", { length: 1024 }),
  coverUrl: varchar("coverUrl", { length: 1024 }),
  website: varchar("website", { length: 512 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const listings = mysqlTable("listings", {
  id: int("id").autoincrement().primaryKey(),
  slug: varchar("slug", { length: 200 }).notNull().unique(),
  vendorId: int("vendorId")
    .notNull()
    .references(() => vendorProfiles.id, { onDelete: "cascade" }),
  storefrontId: int("storefrontId").references(() => storefronts.id, {
    onDelete: "set null",
  }),
  categoryId: int("categoryId")
    .notNull()
    .references(() => categories.id),
  title: varchar("title", { length: 220 }).notNull(),
  description: text("description").notNull(),
  listingType: mysqlEnum("listingType", ["product", "service"]).notNull(),
  priceIndication: varchar("priceIndication", { length: 120 }),
  location: varchar("location", { length: 160 }),
  remoteAvailable: boolean("remoteAvailable").default(false).notNull(),
  status: mysqlEnum("status", [
    "draft",
    "pending",
    "approved",
    "rejected",
    "published",
    "hidden",
    "archived",
  ])
    .default("draft")
    .notNull(),
  publishedAt: timestamp("publishedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const listingMedia = mysqlTable("listingMedia", {
  id: int("id").autoincrement().primaryKey(),
  listingId: int("listingId")
    .notNull()
    .references(() => listings.id, { onDelete: "cascade" }),
  url: varchar("url", { length: 1024 }).notNull(),
  storageKey: varchar("storageKey", { length: 512 }),
  altText: varchar("altText", { length: 255 }),
  sortOrder: int("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const wishlists = mysqlTable(
  "wishlists",
  {
    id: int("id").autoincrement().primaryKey(),
    buyerId: int("buyerId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    listingId: int("listingId")
      .notNull()
      .references(() => listings.id, { onDelete: "cascade" }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [uniqueIndex("buyer_listing_idx").on(table.buyerId, table.listingId)]
);

export const listingViews = mysqlTable("listingViews", {
  id: int("id").autoincrement().primaryKey(),
  listingId: int("listingId")
    .notNull()
    .references(() => listings.id, { onDelete: "cascade" }),
  viewerId: int("viewerId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const inquiries = mysqlTable("inquiries", {
  id: int("id").autoincrement().primaryKey(),
  listingId: int("listingId")
    .notNull()
    .references(() => listings.id, { onDelete: "cascade" }),
  buyerId: int("buyerId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  vendorId: int("vendorId")
    .notNull()
    .references(() => vendorProfiles.id, { onDelete: "cascade" }),
  subject: varchar("subject", { length: 255 }).notNull(),
  status: mysqlEnum("status", ["open", "closed"]).default("open").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const messages = mysqlTable("messages", {
  id: int("id").autoincrement().primaryKey(),
  inquiryId: int("inquiryId")
    .notNull()
    .references(() => inquiries.id, { onDelete: "cascade" }),
  senderId: int("senderId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  readAt: timestamp("readAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const analyticsEvents = mysqlTable("analyticsEvents", {
  id: int("id").autoincrement().primaryKey(),
  eventType: varchar("eventType", { length: 64 }).notNull(),
  userId: int("userId"),
  anonymousSessionId: varchar("anonymousSessionId", { length: 128 }),
  vendorId: int("vendorId"),
  listingId: int("listingId"),
  metadata: json("metadata"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const reviews = mysqlTable("reviews", {
  id: int("id").autoincrement().primaryKey(),
  listingId: int("listingId")
    .notNull()
    .references(() => listings.id, { onDelete: "cascade" }),
  vendorId: int("vendorId")
    .notNull()
    .references(() => vendorProfiles.id, { onDelete: "cascade" }),
  buyerId: int("buyerId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  rating: int("rating").notNull(),
  comment: text("comment"),
  status: mysqlEnum("status", ["pending", "approved", "rejected"])
    .default("pending")
    .notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const disputes = mysqlTable("disputes", {
  id: int("id").autoincrement().primaryKey(),
  listingId: int("listingId").references(() => listings.id, {
    onDelete: "set null",
  }),
  buyerId: int("buyerId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  vendorId: int("vendorId")
    .notNull()
    .references(() => vendorProfiles.id, { onDelete: "cascade" }),
  subject: varchar("subject", { length: 255 }).notNull(),
  description: text("description").notNull(),
  status: mysqlEnum("status", ["open", "in_review", "resolved", "rejected"])
    .default("open")
    .notNull(),
  resolution: text("resolution"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const systemSettings = mysqlTable("systemSettings", {
  id: int("id").autoincrement().primaryKey(),
  settingKey: varchar("settingKey", { length: 128 }).notNull().unique(),
  booleanValue: boolean("booleanValue").default(false).notNull(),
  description: varchar("description", { length: 255 }),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const moderationRecords = mysqlTable("moderationRecords", {
  id: int("id").autoincrement().primaryKey(),
  entityType: mysqlEnum("entityType", [
    "vendor",
    "listing",
    "review",
    "message",
    "dispute",
  ]).notNull(),
  entityId: varchar("entityId", { length: 64 }).notNull(),
  actorId: int("actorId").notNull(),
  action: varchar("action", { length: 64 }).notNull(),
  reason: text("reason"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Category = typeof categories.$inferSelect;
export type InsertCategory = typeof categories.$inferInsert;
export type VendorProfile = typeof vendorProfiles.$inferSelect;
export type InsertVendorProfile = typeof vendorProfiles.$inferInsert;
export type Storefront = typeof storefronts.$inferSelect;
export type InsertStorefront = typeof storefronts.$inferInsert;
export type Listing = typeof listings.$inferSelect;
export type InsertListing = typeof listings.$inferInsert;
export type ListingMedia = typeof listingMedia.$inferSelect;
export type InsertListingMedia = typeof listingMedia.$inferInsert;
export type Wishlist = typeof wishlists.$inferSelect;
export type InsertWishlist = typeof wishlists.$inferInsert;
export type Inquiry = typeof inquiries.$inferSelect;
export type InsertInquiry = typeof inquiries.$inferInsert;
export type Message = typeof messages.$inferSelect;
export type InsertMessage = typeof messages.$inferInsert;
export type Review = typeof reviews.$inferSelect;
export type InsertReview = typeof reviews.$inferInsert;
export type Dispute = typeof disputes.$inferSelect;
export type InsertDispute = typeof disputes.$inferInsert;
