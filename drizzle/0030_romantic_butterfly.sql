CREATE TABLE `aiUsage` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`yearMonth` varchar(7) NOT NULL,
	`totalCalls` int NOT NULL DEFAULT 0,
	`chatbotCalls` int NOT NULL DEFAULT 0,
	`ridingAnalysisCalls` int NOT NULL DEFAULT 0,
	`otherCalls` int NOT NULL DEFAULT 0,
	`monthlyLimit` int NOT NULL DEFAULT 30,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `aiUsage_id` PRIMARY KEY(`id`)
);
