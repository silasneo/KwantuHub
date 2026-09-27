CREATE TABLE `reviews` (
	`id` int AUTO_INCREMENT NOT NULL,
	`listingId` int NOT NULL,
	`vendorId` int NOT NULL,
	`buyerId` int NOT NULL,
	`rating` int NOT NULL,
	`comment` text,
	`status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `reviews_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `systemSettings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`settingKey` varchar(128) NOT NULL,
	`booleanValue` boolean NOT NULL DEFAULT false,
	`description` varchar(255),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `systemSettings_id` PRIMARY KEY(`id`),
	CONSTRAINT `systemSettings_settingKey_unique` UNIQUE(`settingKey`)
);
--> statement-breakpoint
ALTER TABLE `analyticsEvents` ADD `anonymousSessionId` varchar(128);--> statement-breakpoint
ALTER TABLE `analyticsEvents` ADD `vendorId` int;--> statement-breakpoint
ALTER TABLE `users` ADD `notificationPreferences` json;--> statement-breakpoint
ALTER TABLE `vendorProfiles` ADD `phone` varchar(80);--> statement-breakpoint
ALTER TABLE `vendorProfiles` ADD `whatsapp` varchar(80);--> statement-breakpoint
ALTER TABLE `vendorProfiles` ADD `imessage` varchar(120);--> statement-breakpoint
ALTER TABLE `vendorProfiles` ADD `instagram` varchar(120);--> statement-breakpoint
ALTER TABLE `reviews` ADD CONSTRAINT `reviews_listingId_listings_id_fk` FOREIGN KEY (`listingId`) REFERENCES `listings`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `reviews` ADD CONSTRAINT `reviews_vendorId_vendorProfiles_id_fk` FOREIGN KEY (`vendorId`) REFERENCES `vendorProfiles`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `reviews` ADD CONSTRAINT `reviews_buyerId_users_id_fk` FOREIGN KEY (`buyerId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;