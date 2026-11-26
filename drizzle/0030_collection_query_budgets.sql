CREATE INDEX `inquiry_buyer_updated_idx` ON `inquiries` (`buyerId`,`updatedAt`,`id`);--> statement-breakpoint
CREATE INDEX `inquiry_vendor_updated_idx` ON `inquiries` (`vendorId`,`updatedAt`,`id`);--> statement-breakpoint
CREATE INDEX `media_listing_order_idx` ON `listingMedia` (`listingId`,`sortOrder`,`id`);--> statement-breakpoint
CREATE INDEX `view_viewer_created_idx` ON `listingViews` (`viewerId`,`createdAt`,`id`);--> statement-breakpoint
CREATE INDEX `listing_vendor_created_idx` ON `listings` (`vendorId`,`createdAt`,`id`);--> statement-breakpoint
CREATE INDEX `listing_storefront_published_idx` ON `listings` (`storefrontId`,`publishedAt`,`id`);--> statement-breakpoint
CREATE INDEX `listing_status_published_idx` ON `listings` (`status`,`publishedAt`,`id`);--> statement-breakpoint
CREATE INDEX `message_inquiry_visible_created_idx` ON `messages` (`inquiryId`,`isHidden`,`createdAt`,`id`);--> statement-breakpoint
CREATE INDEX `message_inquiry_sender_created_idx` ON `messages` (`inquiryId`,`senderId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `review_buyer_created_idx` ON `reviews` (`buyerId`,`createdAt`,`id`);--> statement-breakpoint
CREATE INDEX `review_vendor_status_created_idx` ON `reviews` (`vendorId`,`status`,`createdAt`,`id`);--> statement-breakpoint
CREATE INDEX `review_listing_status_created_idx` ON `reviews` (`listingId`,`status`,`createdAt`,`id`);--> statement-breakpoint
CREATE INDEX `saved_search_user_created_idx` ON `savedSearches` (`userId`,`createdAt`,`id`);--> statement-breakpoint
CREATE INDEX `wishlist_buyer_created_idx` ON `wishlists` (`buyerId`,`createdAt`,`id`);
--> statement-breakpoint
CREATE INDEX `notification_recipient_id_idx` ON `notifications` (`recipientUserId`,`id`);