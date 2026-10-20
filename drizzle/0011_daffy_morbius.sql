ALTER TABLE `conversationReports` ADD `linkedDisputeId` int;--> statement-breakpoint
ALTER TABLE `messages` ADD `isHidden` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `messages` ADD `hiddenAt` timestamp;--> statement-breakpoint
ALTER TABLE `messages` ADD `hiddenBy` int;--> statement-breakpoint
ALTER TABLE `messages` ADD `hiddenReason` text;--> statement-breakpoint
ALTER TABLE `conversationReports` ADD CONSTRAINT `conversationReports_linkedDisputeId_disputes_id_fk` FOREIGN KEY (`linkedDisputeId`) REFERENCES `disputes`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `messages` ADD CONSTRAINT `messages_hiddenBy_users_id_fk` FOREIGN KEY (`hiddenBy`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;