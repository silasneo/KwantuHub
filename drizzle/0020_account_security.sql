-- Stop application writers before applying this migration.
-- This preflight fails on normalized duplicates without changing user records.
CREATE TEMPORARY TABLE `_account_email_preflight` (
  `email` varchar(320) COLLATE utf8mb4_0900_ai_ci UNIQUE
);
--> statement-breakpoint
INSERT INTO `_account_email_preflight` (`email`)
SELECT LOWER(TRIM(`email`)) FROM `users` WHERE `email` IS NOT NULL;
--> statement-breakpoint
DROP TEMPORARY TABLE `_account_email_preflight`;
--> statement-breakpoint
UPDATE `users` SET `email` = LOWER(TRIM(`email`)) WHERE `email` IS NOT NULL;
--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_email_unique` UNIQUE(`email`);
--> statement-breakpoint
CREATE TABLE `authRateLimits` (
	`id` varchar(64) NOT NULL,
	`attempts` int NOT NULL DEFAULT 1,
	`expiresAt` timestamp NOT NULL,
	CONSTRAINT `authRateLimits_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `authSessions` (
	`id` varchar(64) NOT NULL,
	`userId` int NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `authSessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `authSessions` ADD CONSTRAINT `authSessions_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `auth_rate_limit_expiry_idx` ON `authRateLimits` (`expiresAt`);--> statement-breakpoint
CREATE INDEX `auth_session_expiry_idx` ON `authSessions` (`expiresAt`);