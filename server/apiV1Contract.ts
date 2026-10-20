export const REST_QUERY_OPERATIONS = {
  "auth.me": "Get the current authenticated user",
  "auth.contactStatus": "Get current-user contact verification status",
  "notifications.list": "List current-user notifications",
  "notifications.unreadCount": "Get current-user unread notification count",
  "notifications.getPreferences": "Get current-user notification preferences",
  "categories.list": "List active marketplace categories",
  "vendors.list": "List approved public vendors",
  "marketplace.megaMenu": "Get the public marketplace mega-menu",
  "marketplace.search": "Search published marketplace listings",
  "marketplace.getListing": "Get a published listing by slug",
  "marketplace.reviews": "List public listing reviews",
  "marketplace.getRelated": "List related published listings",
  "marketplace.getStorefront": "Get a public vendor storefront",
  "buyer.wishlist": "List the current buyer wishlist",
  "buyer.viewHistory": "List the current buyer view history",
  "buyer.reviews": "List the current buyer reviews",
  "buyer.inquiries": "List the current buyer inquiries",
  "buyer.savedSearches": "List the current buyer saved searches",
  "vendor.getProfile": "Get the current vendor profile",
  "vendor.listings": "List the current vendor listings",
  "vendor.analytics": "Get scoped vendor analytics",
  "vendor.reviews": "List vendor reviews",
  "vendor.inquiries": "List vendor inquiries",
  "vendor.verificationStatus": "Get vendor verification status",
  "vendor.leadFunnel": "Get vendor lead funnel metrics",
  "admin.pendingVendors": "List pending vendors",
  "admin.categories": "List admin categories",
  "admin.users": "List users for admin governance",
  "admin.listings": "List listings for admin moderation",
  "admin.reviews": "List reviews for admin moderation",
  "admin.disputes": "List disputes for admin governance",
  "admin.moderation": "List moderation records",
  "admin.conversationReports": "List reported conversations",
  "admin.conversationMessages": "List messages in a reported conversation",
  "admin.analytics": "Get admin aggregate analytics",
  "admin.featureFlags": "List feature flags",
  "admin.notificationDeliverySummary": "Get notification delivery summary",
  "admin.notificationDeliveries": "List notification deliveries",
  "admin.notificationWebhookEvents": "List provider webhook events",
  "admin.notificationSuppressions": "List notification suppressions",
  "admin.verificationSessions": "List vendor verification sessions",
  "admin.leadConversionSummary": "Get admin lead conversion summary",
} as const;

export const REST_MUTATION_OPERATIONS = {
  "auth.login": "Issue a JWT session cookie",
  "auth.register": "Register a buyer or vendor",
  "auth.updateProfile": "Update the current user profile",
  "auth.logout": "Clear the current JWT session",
  "auth.changePassword": "Change the current user password",
  "auth.requestEmailOtp": "Request an email ownership OTP",
  "auth.verifyEmailOtp": "Verify an email ownership OTP",
  "auth.requestPhoneOtp": "Request a phone ownership OTP",
  "auth.verifyPhoneOtp": "Verify a phone ownership OTP",
  "notifications.markRead": "Mark one notification read",
  "notifications.markAllRead": "Mark current-user notifications read",
  "notifications.updatePreferences": "Update current-user notification preferences",
  "marketplace.revealContact": "Reveal a vendor contact channel to an authorized buyer",
  "buyer.toggleWishlist": "Save or remove a listing from the wishlist",
  "buyer.removeViewHistory": "Remove one buyer view-history item",
  "buyer.clearViewHistory": "Clear buyer view history",
  "buyer.submitReview": "Submit a buyer review",
  "buyer.createInquiry": "Create a buyer inquiry",
  "buyer.markInquiryRead": "Mark a buyer inquiry read",
  "buyer.replyInquiry": "Reply to a buyer inquiry",
  "buyer.closeInquiry": "Resolve a buyer inquiry",
  "buyer.reopenInquiry": "Reopen a buyer inquiry",
  "buyer.archiveInquiry": "Archive a buyer inquiry",
  "buyer.unarchiveInquiry": "Unarchive a buyer inquiry",
  "buyer.reportConversation": "Report a buyer conversation",
  "buyer.createSavedSearch": "Create a buyer saved search",
  "buyer.updateSavedSearch": "Update a buyer saved search",
  "buyer.deleteSavedSearch": "Delete a buyer saved search",
  "vendor.saveProfile": "Update the current vendor profile",
  "vendor.saveListing": "Create or update a vendor listing",
  "vendor.markInquiryRead": "Mark a vendor inquiry read",
  "vendor.replyInquiry": "Reply to a vendor inquiry",
  "vendor.closeInquiry": "Resolve a vendor inquiry",
  "vendor.reopenInquiry": "Reopen a vendor inquiry",
  "vendor.archiveInquiry": "Archive a vendor inquiry",
  "vendor.unarchiveInquiry": "Unarchive a vendor inquiry",
  "vendor.reportConversation": "Report a vendor conversation",
  "vendor.startVerificationSession": "Start a vendor verification session",
  "vendor.submitManualEvidence": "Submit vendor verification evidence",
  "vendor.updateLeadStage": "Update a vendor lead stage",
  "admin.decideVendor": "Approve or reject a vendor",
  "admin.saveCategory": "Create or update a category",
  "admin.updateUserStatus": "Suspend or reinstate a user",
  "admin.updateReviewStatus": "Moderate a review",
  "admin.updateDispute": "Update a dispute",
  "admin.updateListingStatus": "Moderate a listing",
  "admin.updateConversationReport": "Resolve a conversation report",
  "admin.moderateMessage": "Hide or restore a conversation message",
  "admin.escalateAccount": "Suspend or reinstate an account with audit",
  "admin.setFeatureFlag": "Update a feature flag",
  "admin.retryNotificationDelivery": "Retry one notification delivery",
  "admin.reviewVerificationSession": "Review a vendor verification session",
} as const;

export const REST_OPERATION_REGISTRY = {
  ...REST_QUERY_OPERATIONS,
  ...REST_MUTATION_OPERATIONS,
} as const;

export type RestOperation = keyof typeof REST_OPERATION_REGISTRY;
export type RestDomain = keyof typeof REST_OPERATION_REGISTRY extends never
  ? never
  : RestOperation extends `${infer Domain}.${string}`
    ? Domain
    : never;

export const REST_DOMAINS = [
  "auth",
  "notifications",
  "categories",
  "vendors",
  "marketplace",
  "buyer",
  "vendor",
  "admin",
] as const;

export const REST_ALIAS_ROUTES = {
  "/api/v1/users/me": "auth.me",
  "/api/v1/users/contact-status": "auth.contactStatus",
  "/api/v1/notifications": "notifications.list",
  "/api/v1/notifications/unread-count": "notifications.unreadCount",
  "/api/v1/preferences/notifications": "notifications.getPreferences / notifications.updatePreferences",
  "/api/v1/storefronts/{slug}": "marketplace.getStorefront",
  "/api/v1/search": "marketplace.search",
  "/api/v1/wishlist": "buyer.wishlist / buyer.toggleWishlist",
  "/api/v1/inquiries": "buyer.inquiries / buyer.createInquiry / vendor.inquiries",
  "/api/v1/messages": "buyer.inquiries / vendor.inquiries / admin.conversationMessages",
  "/api/v1/reviews": "marketplace.reviews / buyer.submitReview",
  "/api/v1/analytics/vendor": "vendor.analytics",
  "/api/v1/analytics/admin": "admin.analytics",
  "/api/v1/verification/status": "vendor.verificationStatus",
  "/api/v1/verification/session": "vendor.startVerificationSession",
  "/api/v1/verification/evidence": "vendor.submitManualEvidence",
  "/api/v1/moderation/reports": "admin.conversationReports / buyer.reportConversation / vendor.reportConversation",
  "/api/v1/abuse/report": "buyer.reportConversation / vendor.reportConversation",
} as const;

export function operationKey(domain: string, procedure: string): string {
  return `${domain}.${procedure}`;
}

export function isKnownRestOperation(domain: string, procedure: string): boolean {
  return Object.prototype.hasOwnProperty.call(
    REST_OPERATION_REGISTRY,
    operationKey(domain, procedure),
  );
}

export function isQueryOperation(domain: string, procedure: string): boolean {
  return Object.prototype.hasOwnProperty.call(
    REST_QUERY_OPERATIONS,
    operationKey(domain, procedure),
  );
}

export function isMutationOperation(domain: string, procedure: string): boolean {
  return Object.prototype.hasOwnProperty.call(
    REST_MUTATION_OPERATIONS,
    operationKey(domain, procedure),
  );
}
