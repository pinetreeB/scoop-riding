CREATE TABLE `adminLogs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`adminEmail` varchar(320) NOT NULL,
	`actionType` varchar(50) NOT NULL,
	`targetType` varchar(50) NOT NULL,
	`targetId` int NOT NULL,
	`details` text,
	`ipAddress` varchar(45),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `adminLogs_id` PRIMARY KEY(`id`)
);
