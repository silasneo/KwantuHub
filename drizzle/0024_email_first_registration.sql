CREATE TABLE `emailDomainOverrides` (
	`domain` varchar(253) NOT NULL,
	`policy` enum('allow','block') NOT NULL,
	`reason` varchar(500) NOT NULL,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `emailDomainOverrides_domain` PRIMARY KEY(`domain`)
);
--> statement-breakpoint
CREATE TABLE `pendingRegistrations` (
	`tokenHash` varchar(64) NOT NULL,
	`email` varchar(320) NOT NULL,
	`firstName` varchar(100) NOT NULL,
	`lastName` varchar(100) NOT NULL,
	`signupIntent` enum('buyer','vendor') NOT NULL,
	`termsVersion` varchar(40) NOT NULL,
	`codeCiphertext` text,
	`codeExpiresAt` timestamp,
	`attempts` int NOT NULL DEFAULT 0,
	`expiresAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `pendingRegistrations_tokenHash` PRIMARY KEY(`tokenHash`)
);
--> statement-breakpoint
CREATE INDEX `pending_registration_email_idx` ON `pendingRegistrations` (`email`);--> statement-breakpoint
CREATE INDEX `pending_registration_expiry_idx` ON `pendingRegistrations` (`expiresAt`);