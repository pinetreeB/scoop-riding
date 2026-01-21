CREATE TABLE `ridingRecords` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`recordId` varchar(64) NOT NULL,
	`date` varchar(32) NOT NULL,
	`duration` int NOT NULL,
	`distance` int NOT NULL,
	`avgSpeed` int NOT NULL,
	`maxSpeed` int NOT NULL,
	`startTime` timestamp,
	`endTime` timestamp,
	`gpsPointsJson` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ridingRecords_id` PRIMARY KEY(`id`),
	CONSTRAINT `ridingRecords_recordId_unique` UNIQUE(`recordId`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `passwordHash` varchar(255);--> statement-breakpoint
ALTER TABLE `users` ADD `emailVerified` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_email_unique` UNIQUE(`email`);