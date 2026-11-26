-- Stop application writers first. Duplicate historical reviews require review, not deletion.
CREATE TEMPORARY TABLE `_review_uniqueness_preflight` (
  `buyerId` int NOT NULL,
  `listingId` int NOT NULL,
  UNIQUE (`buyerId`, `listingId`)
);--> statement-breakpoint
INSERT INTO `_review_uniqueness_preflight` (`buyerId`, `listingId`)
SELECT `buyerId`, `listingId` FROM `reviews`;--> statement-breakpoint
DROP TEMPORARY TABLE `_review_uniqueness_preflight`;--> statement-breakpoint
-- Older code did not record whether a reviewed report caused an archive.
-- Stop rather than guess or silently remove a possible administrative restriction.
CREATE TEMPORARY TABLE `_legacy_conversation_review_required` (`id` int PRIMARY KEY);--> statement-breakpoint
INSERT INTO `_legacy_conversation_review_required` VALUES (0);--> statement-breakpoint
INSERT INTO `_legacy_conversation_review_required`
SELECT 0 FROM `inquiries` legacy_inquiry
WHERE legacy_inquiry.status = 'archived' AND EXISTS (
  SELECT 1 FROM `conversationReports` legacy_report
  WHERE legacy_report.inquiryId = legacy_inquiry.id AND legacy_report.reviewedAt IS NOT NULL
) LIMIT 1;--> statement-breakpoint
DROP TEMPORARY TABLE `_legacy_conversation_review_required`;--> statement-breakpoint
ALTER TABLE `savedSearches` MODIFY COLUMN `minPrice` decimal(12,2);--> statement-breakpoint
ALTER TABLE `savedSearches` MODIFY COLUMN `maxPrice` decimal(12,2);--> statement-breakpoint
ALTER TABLE `inquiries` ADD `clientRequestId` varchar(64);--> statement-breakpoint
ALTER TABLE `inquiries` ADD `moderatorSuspendedAt` timestamp;--> statement-breakpoint
ALTER TABLE `inquiries` ADD `archivedFromStatus` enum('open','closed');--> statement-breakpoint
ALTER TABLE `savedSearches` ADD `currency` enum('USD','CAD') DEFAULT 'USD' NOT NULL;--> statement-breakpoint
ALTER TABLE `inquiries` ADD CONSTRAINT `inquiry_buyer_request_unique` UNIQUE(`buyerId`,`clientRequestId`);--> statement-breakpoint
ALTER TABLE `reviews` ADD CONSTRAINT `review_buyer_listing_unique` UNIQUE(`buyerId`,`listingId`);--> statement-breakpoint
CREATE INDEX `inquiry_buyer_listing_created_idx` ON `inquiries` (`buyerId`,`listingId`,`createdAt`);