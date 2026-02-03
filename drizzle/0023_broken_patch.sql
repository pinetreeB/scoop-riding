CREATE TABLE `aiChatHistory` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`role` enum('user','assistant') NOT NULL,
	`content` text NOT NULL,
	`scooterId` int,
	`tokenCount` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `aiChatHistory_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `aiChatUsage` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`usageDate` varchar(10) NOT NULL,
	`messageCount` int NOT NULL DEFAULT 0,
	`lastMessageAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `aiChatUsage_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `batteryAnalysisSummary` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`scooterId` int NOT NULL,
	`totalRides` int NOT NULL DEFAULT 0,
	`avgEfficiency` decimal(6,2),
	`bestEfficiency` decimal(6,2),
	`worstEfficiency` decimal(6,2),
	`estimatedCycles` decimal(6,2),
	`batteryHealthScore` int,
	`totalEnergyConsumed` decimal(12,2),
	`avgTemperature` decimal(4,1),
	`lastAnalysisDate` timestamp,
	`aiInsights` text,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `batteryAnalysisSummary_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `batteryRideLogs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`scooterId` int NOT NULL,
	`ridingRecordId` varchar(64),
	`voltageStart` decimal(5,2),
	`voltageEnd` decimal(5,2),
	`socStart` decimal(5,2),
	`socEnd` decimal(5,2),
	`energyConsumed` decimal(8,2),
	`distance` int,
	`efficiency` decimal(6,2),
	`avgSpeed` decimal(5,2),
	`temperature` decimal(4,1),
	`weatherCondition` varchar(50),
	`elevationGain` int,
	`elevationLoss` int,
	`accelerationScore` int,
	`aiAnalysis` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `batteryRideLogs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `ridingRecords` ADD `voltageStart` decimal(5,2);--> statement-breakpoint
ALTER TABLE `ridingRecords` ADD `voltageEnd` decimal(5,2);--> statement-breakpoint
ALTER TABLE `ridingRecords` ADD `socStart` decimal(5,2);--> statement-breakpoint
ALTER TABLE `ridingRecords` ADD `socEnd` decimal(5,2);--> statement-breakpoint
ALTER TABLE `ridingRecords` ADD `temperature` decimal(4,1);--> statement-breakpoint
ALTER TABLE `scooters` ADD `batteryVoltage` int;--> statement-breakpoint
ALTER TABLE `scooters` ADD `batteryCapacity` decimal(5,2);--> statement-breakpoint
ALTER TABLE `scooters` ADD `batteryType` varchar(20) DEFAULT 'lithium_ion';--> statement-breakpoint
ALTER TABLE `scooters` ADD `batteryCellCount` int;--> statement-breakpoint
ALTER TABLE `scooters` ADD `batteryFullVoltage` decimal(5,2);--> statement-breakpoint
ALTER TABLE `scooters` ADD `batteryEmptyVoltage` decimal(5,2);