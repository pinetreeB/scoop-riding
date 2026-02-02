CREATE TABLE `suspiciousUserReports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`reportType` varchar(50) NOT NULL,
	`severityScore` int NOT NULL DEFAULT 0,
	`details` text,
	`isReviewed` boolean NOT NULL DEFAULT false,
	`reviewedBy` int,
	`reviewNotes` text,
	`actionTaken` enum('none','warning','temp_ban','perm_ban'),
	`reviewedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `suspiciousUserReports_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `userActivityLogs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`activityType` varchar(50) NOT NULL,
	`details` text,
	`ipAddress` varchar(45),
	`userAgent` varchar(500),
	`requestCount` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `userActivityLogs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `userBans` MODIFY COLUMN `reason` text NOT NULL;--> statement-breakpoint
ALTER TABLE `userBans` ADD `unbannedBy` int;--> statement-breakpoint
ALTER TABLE `userBans` ADD `unbannedAt` timestamp;