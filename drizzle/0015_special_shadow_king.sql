CREATE TABLE `savedSearchMatches` (
	`id` int AUTO_INCREMENT NOT NULL,
	`savedSearchId` int NOT NULL,
	`listingId` int NOT NULL,
	`alertDispatched` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `savedSearchMatches_id` PRIMARY KEY(`id`),
	CONSTRAINT `saved_search_listing_match_unique` UNIQUE(`savedSearchId`,`listingId`)
);
--> statement-breakpoint
CREATE TABLE `savedSearches` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(140) NOT NULL,
	`query` varchar(255),
	`categoryId` int,
	`listingType` enum('product','service'),
	`location` varchar(160),
	`minPrice` int,
	`maxPrice` int,
	`remoteOnly` boolean NOT NULL DEFAULT false,
	`verifiedVendorOnly` boolean NOT NULL DEFAULT false,
	`alertFrequency` enum('immediate','daily','off') NOT NULL DEFAULT 'off',
	`isActive` boolean NOT NULL DEFAULT true,
	`lastAlertedAt` timestamp,
	`lastMatchedListingId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `savedSearches_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `notificationPreferences` ADD `emailSavedSearches` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `savedSearchMatches` ADD CONSTRAINT `savedSearchMatches_savedSearchId_savedSearches_id_fk` FOREIGN KEY (`savedSearchId`) REFERENCES `savedSearches`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `savedSearchMatches` ADD CONSTRAINT `savedSearchMatches_listingId_listings_id_fk` FOREIGN KEY (`listingId`) REFERENCES `listings`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `savedSearches` ADD CONSTRAINT `savedSearches_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `savedSearches` ADD CONSTRAINT `savedSearches_categoryId_categories_id_fk` FOREIGN KEY (`categoryId`) REFERENCES `categories`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `saved_search_match_search_idx` ON `savedSearchMatches` (`savedSearchId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `saved_search_user_active_idx` ON `savedSearches` (`userId`,`isActive`);--> statement-breakpoint
CREATE INDEX `saved_search_frequency_active_idx` ON `savedSearches` (`alertFrequency`,`isActive`);