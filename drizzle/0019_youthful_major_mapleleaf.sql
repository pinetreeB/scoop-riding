CREATE TABLE `announcements` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(200) NOT NULL,
	`content` text NOT NULL,
	`type` enum('notice','update','event','maintenance') NOT NULL DEFAULT 'notice',
	`isActive` boolean NOT NULL DEFAULT true,
	`showPopup` boolean NOT NULL DEFAULT true,
	`priority` int NOT NULL DEFAULT 0,
	`startDate` timestamp,
	`endDate` timestamp,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `announcements_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `userAnnouncementReads` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`announcementId` int NOT NULL,
	`dismissed` boolean NOT NULL DEFAULT false,
	`readAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `userAnnouncementReads_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `userBans` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`bannedBy` int NOT NULL,
	`reason` text,
	`banType` enum('temporary','permanent') NOT NULL DEFAULT 'temporary',
	`expiresAt` timestamp,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `userBans_id` PRIMARY KEY(`id`)
);
