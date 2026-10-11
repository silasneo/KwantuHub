CREATE TABLE `notificationDeliveries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`notificationId` int,
	`outboxId` int,
	`recipientUserId` int NOT NULL,
	`channel` enum('in_app','email') NOT NULL,
	`provider` varchar(64),
	`providerMessageId` varchar(255),
	`status` enum('queued','sent','delivered','failed','bounced','complained') NOT NULL DEFAULT 'queued',
	`attempts` int NOT NULL DEFAULT 0,
	`lastAttemptAt` timestamp,
	`nextAttemptAt` timestamp,
	`sentAt` timestamp,
	`deliveredAt` timestamp,
	`failureCode` varchar(120),
	`failureReason` text,
	`providerPayload` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `notificationDeliveries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `notificationOutbox` (
	`id` int AUTO_INCREMENT NOT NULL,
	`idempotencyKey` varchar(180) NOT NULL,
	`eventType` varchar(80) NOT NULL,
	`recipientUserId` int NOT NULL,
	`actorUserId` int,
	`entityType` varchar(64) NOT NULL,
	`entityId` int NOT NULL,
	`payload` json NOT NULL,
	`status` enum('queued','processing','completed','failed','dead') NOT NULL DEFAULT 'queued',
	`attempts` int NOT NULL DEFAULT 0,
	`availableAt` timestamp NOT NULL DEFAULT (now()),
	`lockedAt` timestamp,
	`processedAt` timestamp,
	`lastError` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `notificationOutbox_id` PRIMARY KEY(`id`),
	CONSTRAINT `notificationOutbox_idempotencyKey_unique` UNIQUE(`idempotencyKey`)
);
--> statement-breakpoint
CREATE TABLE `notificationPreferences` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`inAppEnabled` boolean NOT NULL DEFAULT true,
	`emailInquiries` boolean NOT NULL DEFAULT true,
	`emailReplies` boolean NOT NULL DEFAULT true,
	`emailResolutions` boolean NOT NULL DEFAULT false,
	`emailAccount` boolean NOT NULL DEFAULT true,
	`quietHoursStart` varchar(5),
	`quietHoursEnd` varchar(5),
	`timezone` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `notificationPreferences_id` PRIMARY KEY(`id`),
	CONSTRAINT `notificationPreferences_userId_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`recipientUserId` int NOT NULL,
	`actorUserId` int,
	`notificationType` enum('inquiry_created','inquiry_reply_received','inquiry_resolved','vendor_approved','vendor_rejected','review_moderated') NOT NULL,
	`entityType` varchar(64) NOT NULL,
	`entityId` int,
	`inquiryId` int,
	`listingId` int,
	`title` varchar(180) NOT NULL,
	`body` varchar(500) NOT NULL,
	`actionUrl` varchar(512),
	`metadata` json,
	`readAt` timestamp,
	`expiresAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `notificationDeliveries` ADD CONSTRAINT `notificationDeliveries_notificationId_notifications_id_fk` FOREIGN KEY (`notificationId`) REFERENCES `notifications`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notificationDeliveries` ADD CONSTRAINT `notificationDeliveries_outboxId_notificationOutbox_id_fk` FOREIGN KEY (`outboxId`) REFERENCES `notificationOutbox`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notificationDeliveries` ADD CONSTRAINT `notificationDeliveries_recipientUserId_users_id_fk` FOREIGN KEY (`recipientUserId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notificationOutbox` ADD CONSTRAINT `notificationOutbox_recipientUserId_users_id_fk` FOREIGN KEY (`recipientUserId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notificationOutbox` ADD CONSTRAINT `notificationOutbox_actorUserId_users_id_fk` FOREIGN KEY (`actorUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notificationPreferences` ADD CONSTRAINT `notificationPreferences_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_recipientUserId_users_id_fk` FOREIGN KEY (`recipientUserId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_actorUserId_users_id_fk` FOREIGN KEY (`actorUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_inquiryId_inquiries_id_fk` FOREIGN KEY (`inquiryId`) REFERENCES `inquiries`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_listingId_listings_id_fk` FOREIGN KEY (`listingId`) REFERENCES `listings`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `notification_delivery_provider_message_idx` ON `notificationDeliveries` (`provider`,`providerMessageId`);--> statement-breakpoint
CREATE INDEX `notification_delivery_recipient_channel_status_idx` ON `notificationDeliveries` (`recipientUserId`,`channel`,`status`,`createdAt`);--> statement-breakpoint
CREATE INDEX `notification_delivery_status_retry_idx` ON `notificationDeliveries` (`status`,`nextAttemptAt`);--> statement-breakpoint
CREATE INDEX `notification_delivery_outbox_channel_idx` ON `notificationDeliveries` (`outboxId`,`channel`);--> statement-breakpoint
CREATE INDEX `notification_outbox_status_available_idx` ON `notificationOutbox` (`status`,`availableAt`);--> statement-breakpoint
CREATE INDEX `notification_outbox_recipient_created_idx` ON `notificationOutbox` (`recipientUserId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `notification_outbox_event_entity_idx` ON `notificationOutbox` (`eventType`,`entityType`,`entityId`);--> statement-breakpoint
CREATE INDEX `notification_recipient_read_created_idx` ON `notifications` (`recipientUserId`,`readAt`,`createdAt`);--> statement-breakpoint
CREATE INDEX `notification_recipient_created_idx` ON `notifications` (`recipientUserId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `notification_type_created_idx` ON `notifications` (`notificationType`,`createdAt`);--> statement-breakpoint
CREATE INDEX `notification_entity_idx` ON `notifications` (`entityType`,`entityId`);--> statement-breakpoint
CREATE INDEX `notification_inquiry_recipient_idx` ON `notifications` (`inquiryId`,`recipientUserId`);