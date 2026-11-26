-- Stop app/worker writers. Preserve historical delivery records; duplicates need reviewed reconciliation.
CREATE TEMPORARY TABLE `_delivery_uniqueness_preflight` (
  `outboxId` int,
  `channel` varchar(16) NOT NULL,
  UNIQUE (`outboxId`, `channel`)
);--> statement-breakpoint
INSERT INTO `_delivery_uniqueness_preflight` (`outboxId`, `channel`)
SELECT `outboxId`, `channel` FROM `notificationDeliveries`;--> statement-breakpoint
DROP TEMPORARY TABLE `_delivery_uniqueness_preflight`;--> statement-breakpoint
ALTER TABLE `vendorVerificationDecisions` ADD `providerEventId` varchar(255) DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE `vendorVerificationDecisions`
  DROP INDEX `verification_session_check_unique`,
  ADD CONSTRAINT `verification_session_check_unique` UNIQUE(`sessionId`,`checkType`,`providerEventId`);--> statement-breakpoint
ALTER TABLE `notificationDeliveries`
  DROP INDEX `notification_delivery_outbox_channel_idx`,
  ADD CONSTRAINT `notification_delivery_outbox_channel_unique` UNIQUE(`outboxId`,`channel`);