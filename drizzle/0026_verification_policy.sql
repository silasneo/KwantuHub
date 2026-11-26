CREATE TABLE `vendorVerificationDecisions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sessionId` int NOT NULL,
	`checkType` enum('identity','residence') NOT NULL,
	`outcome` enum('verified','rejected') NOT NULL,
	`evidenceIds` json,
	`countryCode` varchar(2),
	`actorId` int,
	`reason` varchar(1000) NOT NULL,
	`decidedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `vendorVerificationDecisions_id` PRIMARY KEY(`id`),
	CONSTRAINT `verification_session_check_unique` UNIQUE(`sessionId`,`checkType`)
);
--> statement-breakpoint
ALTER TABLE `vendorProfiles` ADD `identityVerificationSessionId` int;--> statement-breakpoint
ALTER TABLE `vendorProfiles` ADD `residenceVerificationSessionId` int;--> statement-breakpoint
ALTER TABLE `vendorVerificationEvidence` ADD `legalHoldAt` timestamp;--> statement-breakpoint
ALTER TABLE `vendorVerificationEvidence` ADD `legalHoldReason` varchar(1000);--> statement-breakpoint
ALTER TABLE `vendorVerificationEvidence` ADD `deletionAttempts` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `vendorVerificationEvidence` ADD `lastDeletionError` varchar(255);--> statement-breakpoint
ALTER TABLE `vendorVerificationDecisions` ADD CONSTRAINT `verification_decision_session_fk` FOREIGN KEY (`sessionId`) REFERENCES `vendorVerificationSessions`(`id`) ON DELETE cascade ON UPDATE no action;