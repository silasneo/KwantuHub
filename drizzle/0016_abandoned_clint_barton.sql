CREATE TABLE `inquiryLeadHistory` (
	`id` int AUTO_INCREMENT NOT NULL,
	`inquiryId` int NOT NULL,
	`fromStage` varchar(64) NOT NULL,
	`toStage` varchar(64) NOT NULL,
	`changedByUserId` int NOT NULL,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `inquiryLeadHistory_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `inquiries` ADD `leadStage` enum('new_inquiry','contacted','quote_sent','deal_won','deal_lost') DEFAULT 'new_inquiry' NOT NULL;--> statement-breakpoint
ALTER TABLE `inquiries` ADD `vendorPrivateNotes` text;--> statement-breakpoint
ALTER TABLE `inquiries` ADD `followUpDate` timestamp;--> statement-breakpoint
ALTER TABLE `inquiryLeadHistory` ADD CONSTRAINT `inquiryLeadHistory_inquiryId_inquiries_id_fk` FOREIGN KEY (`inquiryId`) REFERENCES `inquiries`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `inquiryLeadHistory` ADD CONSTRAINT `inquiryLeadHistory_changedByUserId_users_id_fk` FOREIGN KEY (`changedByUserId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `inquiry_lead_history_inquiry_idx` ON `inquiryLeadHistory` (`inquiryId`,`createdAt`);