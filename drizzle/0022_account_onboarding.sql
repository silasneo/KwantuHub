CREATE TABLE `accountOnboarding` (
	`userId` int NOT NULL,
	`identityCiphertext` text NOT NULL,
	`countryCode` enum('US','CA','MX') NOT NULL,
	`kycSessionId` int,
	`verificationUrl` varchar(2048),
	`kycVerifiedAt` timestamp,
	`completedAt` timestamp,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `accountOnboarding_userId` PRIMARY KEY(`userId`)
);
--> statement-breakpoint
CREATE TABLE `accountResetTokens` (
	`tokenHash` varchar(64) NOT NULL,
	`userId` int NOT NULL,
	`expiresAt` timestamp NOT NULL,
	CONSTRAINT `accountResetTokens_tokenHash` PRIMARY KEY(`tokenHash`)
);
--> statement-breakpoint
ALTER TABLE `verificationChallenges` MODIFY COLUMN `purpose` enum('email_ownership','phone_ownership','email_change') NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `firstName` varchar(100);--> statement-breakpoint
ALTER TABLE `users` ADD `lastName` varchar(100);--> statement-breakpoint
ALTER TABLE `users` ADD `signupIntent` enum('buyer','vendor') DEFAULT 'buyer' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `termsAcceptedAt` timestamp;--> statement-breakpoint
ALTER TABLE `users` ADD `termsVersion` varchar(40);--> statement-breakpoint
ALTER TABLE `verificationChallenges` ADD `targetCiphertext` text;--> statement-breakpoint
ALTER TABLE `verificationChallenges` ADD `provider` enum('sendpulse','twilio') DEFAULT 'sendpulse' NOT NULL;--> statement-breakpoint
ALTER TABLE `accountOnboarding` ADD CONSTRAINT `accountOnboarding_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `accountResetTokens` ADD CONSTRAINT `accountResetTokens_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `account_reset_user_idx` ON `accountResetTokens` (`userId`);