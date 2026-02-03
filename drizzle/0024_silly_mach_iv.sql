CREATE TABLE `batteryAnalysis` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`scooterId` int NOT NULL,
	`totalRidesWithVoltage` int NOT NULL DEFAULT 0,
	`totalDistanceWithVoltage` int NOT NULL DEFAULT 0,
	`totalEnergyConsumed` int NOT NULL DEFAULT 0,
	`avgEfficiency` int,
	`bestEfficiency` int,
	`worstEfficiency` int,
	`estimatedCycles` int DEFAULT 0,
	`batteryHealth` int DEFAULT 100,
	`lastAnalyzedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `batteryAnalysis_id` PRIMARY KEY(`id`)
);
