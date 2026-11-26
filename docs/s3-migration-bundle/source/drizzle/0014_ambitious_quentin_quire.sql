CREATE TABLE `vendorVerificationEvidence` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sessionId` int NOT NULL,
	`evidenceType` enum('government_id','utility_bill','bank_statement','lease_agreement','business_registration') NOT NULL,
	`fileStoragePath` varchar(1024) NOT NULL,
	`redactedSummary` varchar(255),
	`retentionExpiresAt` timestamp,
	`deletedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `vendorVerificationEvidence_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `vendorVerificationSessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`vendorId` int NOT NULL,
	`userId` int NOT NULL,
	`provider` enum('veriff','sumsub','manual') NOT NULL,
	`providerSessionId` varchar(255),
	`sessionType` enum('identity_document','liveness','proof_of_residence','combined_na_vendor') NOT NULL,
	`status` enum('created','submitted','in_review','approved','declined','expired','abandoned') NOT NULL DEFAULT 'created',
	`countryCode` varchar(2),
	`consentGivenAt` timestamp,
	`declinedReason` text,
	`reviewerNotes` text,
	`reviewedBy` int,
	`reviewedAt` timestamp,
	`expiresAt` timestamp,
	`metadata` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `vendorVerificationSessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `vendorVerificationSessions_providerSessionId_unique` UNIQUE(`providerSessionId`)
);
--> statement-breakpoint
ALTER TABLE `vendorProfiles` ADD `identityStatus` enum('unverified','pending','verified','rejected','expired') DEFAULT 'unverified' NOT NULL;--> statement-breakpoint
ALTER TABLE `vendorProfiles` ADD `identityVerifiedAt` timestamp;--> statement-breakpoint
ALTER TABLE `vendorProfiles` ADD `residenceStatus` enum('unverified','pending','verified','rejected','expired') DEFAULT 'unverified' NOT NULL;--> statement-breakpoint
ALTER TABLE `vendorProfiles` ADD `residenceCountry` varchar(2);--> statement-breakpoint
ALTER TABLE `vendorProfiles` ADD `residenceVerifiedAt` timestamp;--> statement-breakpoint
ALTER TABLE `vendorProfiles` ADD `verificationBadgeSummary` json;--> statement-breakpoint
ALTER TABLE `vendorVerificationEvidence` ADD CONSTRAINT `vendorVerificationEvidence_sessionId_vendorVerificationSessions_id_fk` FOREIGN KEY (`sessionId`) REFERENCES `vendorVerificationSessions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `vendorVerificationSessions` ADD CONSTRAINT `vendorVerificationSessions_vendorId_vendorProfiles_id_fk` FOREIGN KEY (`vendorId`) REFERENCES `vendorProfiles`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `vendorVerificationSessions` ADD CONSTRAINT `vendorVerificationSessions_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `vendorVerificationSessions` ADD CONSTRAINT `vendorVerificationSessions_reviewedBy_users_id_fk` FOREIGN KEY (`reviewedBy`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `verification_evidence_session_idx` ON `vendorVerificationEvidence` (`sessionId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `vendor_verification_vendor_created_idx` ON `vendorVerificationSessions` (`vendorId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `vendor_verification_status_idx` ON `vendorVerificationSessions` (`status`,`createdAt`);--> statement-breakpoint
CREATE INDEX `vendor_verification_provider_session_idx` ON `vendorVerificationSessions` (`provider`,`providerSessionId`);