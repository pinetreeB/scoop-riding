CREATE TABLE `groupMembers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`groupId` int NOT NULL,
	`userId` int NOT NULL,
	`isHost` boolean NOT NULL DEFAULT false,
	`isRiding` boolean NOT NULL DEFAULT false,
	`distance` int NOT NULL DEFAULT 0,
	`duration` int NOT NULL DEFAULT 0,
	`currentSpeed` int NOT NULL DEFAULT 0,
	`latitude` varchar(20),
	`longitude` varchar(20),
	`lastLocationUpdate` timestamp,
	`joinedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `groupMembers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `groupSessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(6) NOT NULL,
	`name` varchar(100) NOT NULL,
	`hostId` int NOT NULL,
	`isActive` boolean NOT NULL DEFAULT true,
	`isRiding` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `groupSessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `groupSessions_code_unique` UNIQUE(`code`)
);
