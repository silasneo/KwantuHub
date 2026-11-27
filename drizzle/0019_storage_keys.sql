ALTER TABLE `storefronts` ADD `logoStorageKey` varchar(512);--> statement-breakpoint
ALTER TABLE `storefronts` ADD `coverStorageKey` varchar(512);--> statement-breakpoint
UPDATE `listingMedia`
SET `storageKey` = CONCAT('public/', SUBSTRING_INDEX(`url`, '/manus-storage/', -1))
WHERE `storageKey` IS NULL AND `url` LIKE '%/manus-storage/%';--> statement-breakpoint
UPDATE `storefronts`
SET `logoStorageKey` = CONCAT('public/', SUBSTRING_INDEX(`logoUrl`, '/manus-storage/', -1))
WHERE `logoStorageKey` IS NULL AND `logoUrl` LIKE '%/manus-storage/%';--> statement-breakpoint
UPDATE `storefronts`
SET `coverStorageKey` = CONCAT('public/', SUBSTRING_INDEX(`coverUrl`, '/manus-storage/', -1))
WHERE `coverStorageKey` IS NULL AND `coverUrl` LIKE '%/manus-storage/%';