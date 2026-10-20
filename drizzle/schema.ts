import {
  boolean,
  int,
  json,
  index,
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
  phone: varchar("phone", { length: 32 }),
  passwordHash: varchar("passwordHash", { length: 255 }),
  avatarUrl: varchar("avatarUrl", { length: 1024 }),
  notificationPreferences: json("notificationPreferences"),
  emailVerifiedAt: timestamp("emailVerifiedAt"),
  phoneVerifiedAt: timestamp("phoneVerifiedAt"),
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
  standardsAcknowledgedAt: timestamp("standardsAcknowledgedAt"),
  identityStatus: mysqlEnum("identityStatus", [
    "unverified",
    "pending",
    "verified",
    "rejected",
    "expired",
  ])
    .default("unverified")
    .notNull(),
  identityVerifiedAt: timestamp("identityVerifiedAt"),
  residenceStatus: mysqlEnum("residenceStatus", [
    "unverified",
    "pending",
    "verified",
    "rejected",
    "expired",
  ])
    .default("unverified")
    .notNull(),
  residenceCountry: varchar("residenceCountry", { length: 2 }),
  residenceVerifiedAt: timestamp("residenceVerifiedAt"),
  verificationBadgeSummary: json("verificationBadgeSummary"),
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
  status: mysqlEnum("status", ["open", "closed", "archived"])
    .default("open")
    .notNull(),
  leadStage: mysqlEnum("leadStage", [
    "new_inquiry",
    "contacted",
    "quote_sent",
    "deal_won",
    "deal_lost",
  ])
    .default("new_inquiry")
    .notNull(),
  vendorPrivateNotes: text("vendorPrivateNotes"),
  followUpDate: timestamp("followUpDate"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const inquiryLeadHistory = mysqlTable(
  "inquiryLeadHistory",
  {
    id: int("id").autoincrement().primaryKey(),
    inquiryId: int("inquiryId")
      .notNull()
      .references(() => inquiries.id, { onDelete: "cascade" }),
    fromStage: varchar("fromStage", { length: 64 }).notNull(),
    toStage: varchar("toStage", { length: 64 }).notNull(),
    changedByUserId: int("changedByUserId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    notes: text("notes"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    index("inquiry_lead_history_inquiry_idx").on(table.inquiryId, table.createdAt),
  ]
);

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
  isHidden: boolean("isHidden").default(false).notNull(),
  hiddenAt: timestamp("hiddenAt"),
  hiddenBy: int("hiddenBy").references(() => users.id, { onDelete: "set null" }),
  hiddenReason: text("hiddenReason"),
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

export const conversationReports = mysqlTable(
  "conversationReports",
  {
    id: int("id").autoincrement().primaryKey(),
    inquiryId: int("inquiryId")
      .notNull()
      .references(() => inquiries.id, { onDelete: "cascade" }),
    linkedDisputeId: int("linkedDisputeId").references(() => disputes.id, {
      onDelete: "set null",
    }),
    reporterId: int("reporterId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    reason: varchar("reason", { length: 120 }).notNull(),
    details: text("details"),
    status: mysqlEnum("status", ["open", "reviewed", "dismissed", "actioned"])
      .default("open")
      .notNull(),
    resolutionNote: text("resolutionNote"),
    reviewedBy: int("reviewedBy").references(() => users.id, {
      onDelete: "set null",
    }),
    reviewedAt: timestamp("reviewedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    index("conversation_reports_status_created_idx").on(
      table.status,
      table.createdAt
    ),
    index("conversation_reports_inquiry_idx").on(table.inquiryId, table.createdAt),
    index("conversation_reports_reporter_idx").on(table.reporterId, table.createdAt),
  ]
);

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
    "conversation",
    "notification",
    "dispute",
  ]).notNull(),
  entityId: varchar("entityId", { length: 64 }).notNull(),
  actorId: int("actorId").notNull(),
  action: varchar("action", { length: 64 }).notNull(),
  reason: text("reason"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const verificationChallenges = mysqlTable(
  "verificationChallenges",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    channel: mysqlEnum("channel", ["email", "phone"]).notNull(),
    purpose: mysqlEnum("purpose", ["email_ownership", "phone_ownership"]).notNull(),
    targetHash: varchar("targetHash", { length: 128 }).notNull(),
    codeCiphertext: varchar("codeCiphertext", { length: 512 }).notNull(),
    attempts: int("attempts").default(0).notNull(),
    maxAttempts: int("maxAttempts").default(5).notNull(),
    lastSentAt: timestamp("lastSentAt").defaultNow().notNull(),
    expiresAt: timestamp("expiresAt").notNull(),
    consumedAt: timestamp("consumedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    index("verification_challenge_user_channel_idx").on(
      table.userId,
      table.channel,
      table.createdAt
    ),
    index("verification_challenge_target_idx").on(
      table.channel,
      table.targetHash,
      table.createdAt
    ),
  ]
);

export const abuseSignals = mysqlTable(
  "abuseSignals",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").references(() => users.id, { onDelete: "set null" }),
    signalType: mysqlEnum("signalType", [
      "turnstile_failed",
      "otp_failed",
      "otp_rate_limited",
      "contact_reveal_rate_limited",
      "inquiry_rate_limited",
      "suspicious_contact_reveal",
    ]).notNull(),
    ipHash: varchar("ipHash", { length: 128 }),
    metadata: json("metadata"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    resolvedAt: timestamp("resolvedAt"),
    resolvedBy: int("resolvedBy").references(() => users.id, {
      onDelete: "set null",
    }),
  },
  table => [
    index("abuse_signal_type_created_idx").on(table.signalType, table.createdAt),
    index("abuse_signal_user_created_idx").on(table.userId, table.createdAt),
  ]
);

export const vendorVerificationSessions = mysqlTable(
  "vendorVerificationSessions",
  {
    id: int("id").autoincrement().primaryKey(),
    vendorId: int("vendorId")
      .notNull()
      .references(() => vendorProfiles.id, { onDelete: "cascade" }),
    userId: int("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: mysqlEnum("provider", ["didit", "veriff", "sumsub", "manual"]).notNull(),
    providerSessionId: varchar("providerSessionId", { length: 255 }).unique(),
    sessionType: mysqlEnum("sessionType", [
      "identity_document",
      "liveness",
      "proof_of_residence",
      "combined_na_vendor",
    ]).notNull(),
    status: mysqlEnum("status", [
      "created",
      "submitted",
      "in_review",
      "approved",
      "declined",
      "expired",
      "abandoned",
    ])
      .default("created")
      .notNull(),
    countryCode: varchar("countryCode", { length: 2 }),
    consentGivenAt: timestamp("consentGivenAt"),
    declinedReason: text("declinedReason"),
    reviewerNotes: text("reviewerNotes"),
    reviewedBy: int("reviewedBy").references(() => users.id, {
      onDelete: "set null",
    }),
    reviewedAt: timestamp("reviewedAt"),
    expiresAt: timestamp("expiresAt"),
    metadata: json("metadata"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    index("vendor_verification_vendor_created_idx").on(
      table.vendorId,
      table.createdAt
    ),
    index("vendor_verification_status_idx").on(table.status, table.createdAt),
    index("vendor_verification_provider_session_idx").on(
      table.provider,
      table.providerSessionId
    ),
  ]
);

export const vendorVerificationEvidence = mysqlTable(
  "vendorVerificationEvidence",
  {
    id: int("id").autoincrement().primaryKey(),
    sessionId: int("sessionId")
      .notNull()
      .references(() => vendorVerificationSessions.id, { onDelete: "cascade" }),
    evidenceType: mysqlEnum("evidenceType", [
      "government_id",
      "utility_bill",
      "bank_statement",
      "lease_agreement",
      "business_registration",
    ]).notNull(),
    fileStoragePath: varchar("fileStoragePath", { length: 1024 }).notNull(),
    redactedSummary: varchar("redactedSummary", { length: 255 }),
    retentionExpiresAt: timestamp("retentionExpiresAt"),
    deletedAt: timestamp("deletedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    index("verification_evidence_session_idx").on(table.sessionId, table.createdAt),
  ]
);

export const notificationPreferences = mysqlTable(
  "notificationPreferences",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId")
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: "cascade" }),
    inAppEnabled: boolean("inAppEnabled").default(true).notNull(),
    emailInquiries: boolean("emailInquiries").default(true).notNull(),
    emailReplies: boolean("emailReplies").default(true).notNull(),
    emailResolutions: boolean("emailResolutions").default(false).notNull(),
    emailAccount: boolean("emailAccount").default(true).notNull(),
    emailSavedSearches: boolean("emailSavedSearches").default(false).notNull(),
    quietHoursStart: varchar("quietHoursStart", { length: 5 }),
    quietHoursEnd: varchar("quietHoursEnd", { length: 5 }),
    timezone: varchar("timezone", { length: 64 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  }
);

export const notifications = mysqlTable(
  "notifications",
  {
    id: int("id").autoincrement().primaryKey(),
    recipientUserId: int("recipientUserId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    actorUserId: int("actorUserId").references(() => users.id, {
      onDelete: "set null",
    }),
    notificationType: mysqlEnum("notificationType", [
      "inquiry_created",
      "inquiry_reply_received",
      "inquiry_resolved",
      "vendor_approved",
      "vendor_rejected",
      "review_moderated",
      "email_address_action_required",
      "email_delivery_alert",
      "contact_verification_otp",
    ]).notNull(),
    entityType: varchar("entityType", { length: 64 }).notNull(),
    entityId: int("entityId"),
    inquiryId: int("inquiryId").references(() => inquiries.id, {
      onDelete: "cascade",
    }),
    listingId: int("listingId").references(() => listings.id, {
      onDelete: "set null",
    }),
    title: varchar("title", { length: 180 }).notNull(),
    body: varchar("body", { length: 500 }).notNull(),
    actionUrl: varchar("actionUrl", { length: 512 }),
    metadata: json("metadata"),
    readAt: timestamp("readAt"),
    expiresAt: timestamp("expiresAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    index("notification_recipient_read_created_idx").on(
      table.recipientUserId,
      table.readAt,
      table.createdAt
    ),
    index("notification_recipient_created_idx").on(
      table.recipientUserId,
      table.createdAt
    ),
    index("notification_type_created_idx").on(
      table.notificationType,
      table.createdAt
    ),
    index("notification_entity_idx").on(table.entityType, table.entityId),
    index("notification_inquiry_recipient_idx").on(
      table.inquiryId,
      table.recipientUserId
    ),
  ]
);

export const notificationOutbox = mysqlTable(
  "notificationOutbox",
  {
    id: int("id").autoincrement().primaryKey(),
    idempotencyKey: varchar("idempotencyKey", { length: 180 })
      .notNull()
      .unique(),
    eventType: varchar("eventType", { length: 80 }).notNull(),
    recipientUserId: int("recipientUserId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    actorUserId: int("actorUserId").references(() => users.id, {
      onDelete: "set null",
    }),
    entityType: varchar("entityType", { length: 64 }).notNull(),
    entityId: int("entityId").notNull(),
    payload: json("payload").notNull(),
    status: mysqlEnum("status", [
      "queued",
      "processing",
      "completed",
      "failed",
      "dead",
    ])
      .default("queued")
      .notNull(),
    attempts: int("attempts").default(0).notNull(),
    availableAt: timestamp("availableAt").defaultNow().notNull(),
    lockedAt: timestamp("lockedAt"),
    lockToken: varchar("lockToken", { length: 120 }),
    leaseExpiresAt: timestamp("leaseExpiresAt"),
    lastAttemptAt: timestamp("lastAttemptAt"),
    processedAt: timestamp("processedAt"),
    lastError: text("lastError"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    index("notification_outbox_status_available_idx").on(
      table.status,
      table.availableAt
    ),
    index("notification_outbox_lease_idx").on(
      table.status,
      table.availableAt,
      table.leaseExpiresAt
    ),
    index("notification_outbox_recipient_created_idx").on(
      table.recipientUserId,
      table.createdAt
    ),
    index("notification_outbox_event_entity_idx").on(
      table.eventType,
      table.entityType,
      table.entityId
    ),
  ]
);

export const notificationDeliveries = mysqlTable(
  "notificationDeliveries",
  {
    id: int("id").autoincrement().primaryKey(),
    notificationId: int("notificationId").references(() => notifications.id, {
      onDelete: "cascade",
    }),
    outboxId: int("outboxId").references(() => notificationOutbox.id, {
      onDelete: "cascade",
    }),
    recipientUserId: int("recipientUserId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    channel: mysqlEnum("channel", ["in_app", "email"]).notNull(),
    provider: varchar("provider", { length: 64 }),
    providerMessageId: varchar("providerMessageId", { length: 255 }),
    status: mysqlEnum("status", [
      "queued",
      "sent",
      "delivered",
      "failed",
      "bounced",
      "complained",
    ])
      .default("queued")
      .notNull(),
    attempts: int("attempts").default(0).notNull(),
    lastAttemptAt: timestamp("lastAttemptAt"),
    nextAttemptAt: timestamp("nextAttemptAt"),
    sentAt: timestamp("sentAt"),
    deliveredAt: timestamp("deliveredAt"),
    providerEventAt: timestamp("providerEventAt"),
    providerEventType: varchar("providerEventType", { length: 80 }),
    lastProviderEventId: varchar("lastProviderEventId", { length: 255 }),
    failureCode: varchar("failureCode", { length: 120 }),
    failureReason: text("failureReason"),
    providerPayload: json("providerPayload"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    index("notification_delivery_provider_message_idx").on(
      table.provider,
      table.providerMessageId
    ),
    index("notification_delivery_provider_status_idx").on(
      table.provider,
      table.providerMessageId,
      table.status
    ),
    index("notification_delivery_recipient_channel_status_idx").on(
      table.recipientUserId,
      table.channel,
      table.status,
      table.createdAt
    ),
    index("notification_delivery_status_retry_idx").on(
      table.status,
      table.nextAttemptAt
    ),
    index("notification_delivery_outbox_channel_idx").on(
      table.outboxId,
      table.channel
    ),
  ]
);

export const notificationWebhookEvents = mysqlTable(
  "notificationWebhookEvents",
  {
    id: int("id").autoincrement().primaryKey(),
    provider: varchar("provider", { length: 64 }).notNull(),
    providerEventId: varchar("providerEventId", { length: 255 }).notNull(),
    providerMessageId: varchar("providerMessageId", { length: 255 }),
    providerEventType: varchar("providerEventType", { length: 80 }).notNull(),
    signatureVerified: boolean("signatureVerified").default(false).notNull(),
    payloadHash: varchar("payloadHash", { length: 128 }).notNull(),
    payload: json("payload"),
    processingStatus: mysqlEnum("processingStatus", [
      "received",
      "processed",
      "ignored",
      "failed",
    ])
      .default("received")
      .notNull(),
    processingAttempts: int("processingAttempts").default(0).notNull(),
    receivedAt: timestamp("receivedAt").defaultNow().notNull(),
    providerEventAt: timestamp("providerEventAt"),
    processedAt: timestamp("processedAt"),
    lastError: text("lastError"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("notification_webhook_provider_event_unique").on(
      table.provider,
      table.providerEventId
    ),
    index("notification_webhook_message_type_idx").on(
      table.providerMessageId,
      table.providerEventType
    ),
    index("notification_webhook_status_received_idx").on(
      table.processingStatus,
      table.receivedAt
    ),
    index("notification_webhook_payload_hash_idx").on(table.payloadHash),
  ]
);

export const notificationSuppressions = mysqlTable(
  "notificationSuppressions",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").references(() => users.id, { onDelete: "set null" }),
    email: varchar("email", { length: 320 }).notNull(),
    provider: varchar("provider", { length: 64 }).notNull(),
    reason: mysqlEnum("reason", [
      "hard_bounce",
      "complaint",
      "unsubscribe",
      "manual",
    ]).notNull(),
    sourceEventId: varchar("sourceEventId", { length: 255 }),
    active: boolean("active").default(true).notNull(),
    suppressedAt: timestamp("suppressedAt").defaultNow().notNull(),
    releasedAt: timestamp("releasedAt"),
    releaseReason: varchar("releaseReason", { length: 255 }),
    metadata: json("metadata"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("notification_suppression_provider_email_reason_active_unique").on(
      table.provider,
      table.email,
      table.reason,
      table.active
    ),
    index("notification_suppression_email_active_idx").on(
      table.email,
      table.active
    ),
    index("notification_suppression_user_active_idx").on(
      table.userId,
      table.active
    ),
    index("notification_suppression_provider_event_idx").on(
      table.provider,
      table.sourceEventId
    ),
  ]
);

export const savedSearches = mysqlTable(
  "savedSearches",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 140 }).notNull(),
    query: varchar("query", { length: 255 }),
    categoryId: int("categoryId").references(() => categories.id, {
      onDelete: "set null",
    }),
    listingType: mysqlEnum("listingType", ["product", "service"]),
    location: varchar("location", { length: 160 }),
    minPrice: int("minPrice"),
    maxPrice: int("maxPrice"),
    remoteOnly: boolean("remoteOnly").default(false).notNull(),
    verifiedVendorOnly: boolean("verifiedVendorOnly").default(false).notNull(),
    alertFrequency: mysqlEnum("alertFrequency", ["immediate", "daily", "off"])
      .default("off")
      .notNull(),
    isActive: boolean("isActive").default(true).notNull(),
    lastAlertedAt: timestamp("lastAlertedAt"),
    lastMatchedListingId: int("lastMatchedListingId"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    index("saved_search_user_active_idx").on(table.userId, table.isActive),
    index("saved_search_frequency_active_idx").on(
      table.alertFrequency,
      table.isActive
    ),
  ]
);

export const savedSearchMatches = mysqlTable(
  "savedSearchMatches",
  {
    id: int("id").autoincrement().primaryKey(),
    savedSearchId: int("savedSearchId")
      .notNull()
      .references(() => savedSearches.id, { onDelete: "cascade" }),
    listingId: int("listingId")
      .notNull()
      .references(() => listings.id, { onDelete: "cascade" }),
    alertDispatched: boolean("alertDispatched").default(false).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("saved_search_listing_match_unique").on(
      table.savedSearchId,
      table.listingId
    ),
    index("saved_search_match_search_idx").on(table.savedSearchId, table.createdAt),
  ]
);

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
export type NotificationPreference = typeof notificationPreferences.$inferSelect;
export type InsertNotificationPreference = typeof notificationPreferences.$inferInsert;
export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = typeof notifications.$inferInsert;
export type NotificationOutbox = typeof notificationOutbox.$inferSelect;
export type InsertNotificationOutbox = typeof notificationOutbox.$inferInsert;
export type NotificationDelivery = typeof notificationDeliveries.$inferSelect;
export type InsertNotificationDelivery = typeof notificationDeliveries.$inferInsert;
export type NotificationWebhookEvent = typeof notificationWebhookEvents.$inferSelect;
export type InsertNotificationWebhookEvent = typeof notificationWebhookEvents.$inferInsert;
export type NotificationSuppression = typeof notificationSuppressions.$inferSelect;
export type InsertNotificationSuppression = typeof notificationSuppressions.$inferInsert;
export type VerificationChallenge = typeof verificationChallenges.$inferSelect;
export type InsertVerificationChallenge = typeof verificationChallenges.$inferInsert;
export type VendorVerificationSession = typeof vendorVerificationSessions.$inferSelect;
export type InsertVendorVerificationSession = typeof vendorVerificationSessions.$inferInsert;
export type VendorVerificationEvidence = typeof vendorVerificationEvidence.$inferSelect;
export type InsertVendorVerificationEvidence = typeof vendorVerificationEvidence.$inferInsert;
export type SavedSearch = typeof savedSearches.$inferSelect;
export type InsertSavedSearch = typeof savedSearches.$inferInsert;
export type SavedSearchMatch = typeof savedSearchMatches.$inferSelect;
export type InsertSavedSearchMatch = typeof savedSearchMatches.$inferInsert;
export type InquiryLeadHistory = typeof inquiryLeadHistory.$inferSelect;
export type InsertInquiryLeadHistory = typeof inquiryLeadHistory.$inferInsert;
export type AbuseSignal = typeof abuseSignals.$inferSelect;
export type InsertAbuseSignal = typeof abuseSignals.$inferInsert;
