CREATE TABLE `conversationReports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`inquiryId` int NOT NULL,
	`reporterId` int NOT NULL,
	`reason` varchar(120) NOT NULL,
	`details` text,
	`status` enum('open','reviewed','dismissed','actioned') NOT NULL DEFAULT 'open',
	`resolutionNote` text,
	`reviewedBy` int,
	`reviewedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `conversationReports_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `conversationReports` ADD CONSTRAINT `conversationReports_inquiryId_inquiries_id_fk` FOREIGN KEY (`inquiryId`) REFERENCES `inquiries`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `conversationReports` ADD CONSTRAINT `conversationReports_reporterId_users_id_fk` FOREIGN KEY (`reporterId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `conversationReports` ADD CONSTRAINT `conversationReports_reviewedBy_users_id_fk` FOREIGN KEY (`reviewedBy`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `conversation_reports_status_created_idx` ON `conversationReports` (`status`,`createdAt`);--> statement-breakpoint
CREATE INDEX `conversation_reports_inquiry_idx` ON `conversationReports` (`inquiryId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `conversation_reports_reporter_idx` ON `conversationReports` (`reporterId`,`createdAt`);