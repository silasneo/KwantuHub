CREATE TABLE `phoneVerificationCountries` (
	`countryCode` varchar(2) NOT NULL,
	`enabled` boolean NOT NULL DEFAULT true,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `phoneVerificationCountries_countryCode` PRIMARY KEY(`countryCode`)
);
--> statement-breakpoint
INSERT INTO `phoneVerificationCountries` (`countryCode`, `enabled`)
VALUES ('US', true), ('CA', true), ('MX', true), ('NG', true);
