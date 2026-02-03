CREATE TABLE `batteryHealthReports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`scooterId` int NOT NULL,
	`userId` int NOT NULL,
	`reportDate` timestamp NOT NULL DEFAULT (now()),
	`healthPercent` decimal(5,2) NOT NULL,
	`estimatedCyclesRemaining` int,
	`totalCycles` int,
	`totalDistanceKm` decimal(10,2),
	`avgEfficiency` decimal(6,2),
	`capacityDegradation` decimal(5,2),
	`aiAnalysis` text,
	`recommendations` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `batteryHealthReports_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `maintenanceItems` (
	`id` int AUTO_INCREMENT NOT NULL,
	`scooterId` int NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(100) NOT NULL,
	`intervalKm` int NOT NULL,
	`lastMaintenanceKm` decimal(10,2) DEFAULT '0',
	`lastMaintenanceDate` timestamp,
	`isEnabled` boolean NOT NULL DEFAULT true,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `maintenanceItems_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `maintenanceRecords` (
	`id` int AUTO_INCREMENT NOT NULL,
	`maintenanceItemId` int NOT NULL,
	`scooterId` int NOT NULL,
	`userId` int NOT NULL,
	`distanceKm` decimal(10,2) NOT NULL,
	`cost` decimal,
	`location` varchar(200),
	`notes` text,
	`maintenanceDate` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `maintenanceRecords_id` PRIMARY KEY(`id`)
);
