CREATE TABLE `notificationSuppressions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`email` varchar(320) NOT NULL,
	`provider` varchar(64) NOT NULL,
	`reason` enum('hard_bounce','complaint','unsubscribe','manual') NOT NULL,
	`sourceEventId` varchar(255),
	`active` boolean NOT NULL DEFAULT true,
	`suppressedAt` timestamp NOT NULL DEFAULT (now()),
	`releasedAt` timestamp,
	`releaseReason` varchar(255),
	`metadata` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `notificationSuppressions_id` PRIMARY KEY(`id`),
	CONSTRAINT `notification_suppression_provider_email_reason_active_unique` UNIQUE(`provider`,`email`,`reason`,`active`)
);
--> statement-breakpoint
CREATE TABLE `notificationWebhookEvents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`provider` varchar(64) NOT NULL,
	`providerEventId` varchar(255) NOT NULL,
	`providerMessageId` varchar(255),
	`providerEventType` varchar(80) NOT NULL,
	`signatureVerified` boolean NOT NULL DEFAULT false,
	`payloadHash` varchar(128) NOT NULL,
	`payload` json,
	`processingStatus` enum('received','processed','ignored','failed') NOT NULL DEFAULT 'received',
	`processingAttempts` int NOT NULL DEFAULT 0,
	`receivedAt` timestamp NOT NULL DEFAULT (now()),
	`providerEventAt` timestamp,
	`processedAt` timestamp,
	`lastError` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `notificationWebhookEvents_id` PRIMARY KEY(`id`),
	CONSTRAINT `notification_webhook_provider_event_unique` UNIQUE(`provider`,`providerEventId`)
);
--> statement-breakpoint
ALTER TABLE `notificationDeliveries` ADD `providerEventAt` timestamp;--> statement-breakpoint
ALTER TABLE `notificationDeliveries` ADD `providerEventType` varchar(80);--> statement-breakpoint
ALTER TABLE `notificationDeliveries` ADD `lastProviderEventId` varchar(255);--> statement-breakpoint
ALTER TABLE `notificationOutbox` ADD `lockToken` varchar(120);--> statement-breakpoint
ALTER TABLE `notificationOutbox` ADD `leaseExpiresAt` timestamp;--> statement-breakpoint
ALTER TABLE `notificationOutbox` ADD `lastAttemptAt` timestamp;--> statement-breakpoint
ALTER TABLE `notificationSuppressions` ADD CONSTRAINT `notificationSuppressions_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `notification_suppression_email_active_idx` ON `notificationSuppressions` (`email`,`active`);--> statement-breakpoint
CREATE INDEX `notification_suppression_user_active_idx` ON `notificationSuppressions` (`userId`,`active`);--> statement-breakpoint
CREATE INDEX `notification_suppression_provider_event_idx` ON `notificationSuppressions` (`provider`,`sourceEventId`);--> statement-breakpoint
CREATE INDEX `notification_webhook_message_type_idx` ON `notificationWebhookEvents` (`providerMessageId`,`providerEventType`);--> statement-breakpoint
CREATE INDEX `notification_webhook_status_received_idx` ON `notificationWebhookEvents` (`processingStatus`,`receivedAt`);--> statement-breakpoint
CREATE INDEX `notification_webhook_payload_hash_idx` ON `notificationWebhookEvents` (`payloadHash`);--> statement-breakpoint
CREATE INDEX `notification_delivery_provider_status_idx` ON `notificationDeliveries` (`provider`,`providerMessageId`,`status`);--> statement-breakpoint
CREATE INDEX `notification_outbox_lease_idx` ON `notificationOutbox` (`status`,`availableAt`,`leaseExpiresAt`);