CREATE TABLE `groupMessages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`groupId` int NOT NULL,
	`userId` int NOT NULL,
	`message` text NOT NULL,
	`messageType` enum('text','location','alert') NOT NULL DEFAULT 'text',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `groupMessages_id` PRIMARY KEY(`id`)
);
