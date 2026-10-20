CREATE TABLE `abuseSignals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`signalType` enum('turnstile_failed','otp_failed','otp_rate_limited','contact_reveal_rate_limited','inquiry_rate_limited','suspicious_contact_reveal') NOT NULL,
	`ipHash` varchar(128),
	`metadata` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`resolvedAt` timestamp,
	`resolvedBy` int,
	CONSTRAINT `abuseSignals_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `verificationChallenges` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`channel` enum('email','phone') NOT NULL,
	`purpose` enum('email_ownership','phone_ownership') NOT NULL,
	`targetHash` varchar(128) NOT NULL,
	`codeCiphertext` varchar(512) NOT NULL,
	`attempts` int NOT NULL DEFAULT 0,
	`maxAttempts` int NOT NULL DEFAULT 5,
	`lastSentAt` timestamp NOT NULL DEFAULT (now()),
	`expiresAt` timestamp NOT NULL,
	`consumedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `verificationChallenges_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `notifications` MODIFY COLUMN `notificationType` enum('inquiry_created','inquiry_reply_received','inquiry_resolved','vendor_approved','vendor_rejected','review_moderated','email_address_action_required','email_delivery_alert','contact_verification_otp') NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `phone` varchar(32);--> statement-breakpoint
ALTER TABLE `users` ADD `emailVerifiedAt` timestamp;--> statement-breakpoint
ALTER TABLE `users` ADD `phoneVerifiedAt` timestamp;--> statement-breakpoint
ALTER TABLE `abuseSignals` ADD CONSTRAINT `abuseSignals_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `abuseSignals` ADD CONSTRAINT `abuseSignals_resolvedBy_users_id_fk` FOREIGN KEY (`resolvedBy`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `verificationChallenges` ADD CONSTRAINT `verificationChallenges_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `abuse_signal_type_created_idx` ON `abuseSignals` (`signalType`,`createdAt`);--> statement-breakpoint
CREATE INDEX `abuse_signal_user_created_idx` ON `abuseSignals` (`userId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `verification_challenge_user_channel_idx` ON `verificationChallenges` (`userId`,`channel`,`createdAt`);--> statement-breakpoint
CREATE INDEX `verification_challenge_target_idx` ON `verificationChallenges` (`channel`,`targetHash`,`createdAt`);