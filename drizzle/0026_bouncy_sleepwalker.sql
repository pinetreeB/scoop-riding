CREATE TABLE `chargingRecords` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`scooterId` int NOT NULL,
	`chargeDate` varchar(32) NOT NULL,
	`voltageBefore` decimal(5,2) NOT NULL,
	`voltageAfter` decimal(5,2) NOT NULL,
	`socBefore` decimal(5,2),
	`socAfter` decimal(5,2),
	`chargingDuration` int,
	`chargeType` varchar(32),
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `chargingRecords_id` PRIMARY KEY(`id`)
);
