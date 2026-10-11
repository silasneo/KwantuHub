CREATE TABLE `disputes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`listingId` int,
	`buyerId` int NOT NULL,
	`vendorId` int NOT NULL,
	`subject` varchar(255) NOT NULL,
	`description` text NOT NULL,
	`status` enum('open','in_review','resolved','rejected') NOT NULL DEFAULT 'open',
	`resolution` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `disputes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `moderationRecords` MODIFY COLUMN `entityType` enum('vendor','listing','review','message','dispute') NOT NULL;--> statement-breakpoint
ALTER TABLE `disputes` ADD CONSTRAINT `disputes_listingId_listings_id_fk` FOREIGN KEY (`listingId`) REFERENCES `listings`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `disputes` ADD CONSTRAINT `disputes_buyerId_users_id_fk` FOREIGN KEY (`buyerId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `disputes` ADD CONSTRAINT `disputes_vendorId_vendorProfiles_id_fk` FOREIGN KEY (`vendorId`) REFERENCES `vendorProfiles`(`id`) ON DELETE cascade ON UPDATE no action;