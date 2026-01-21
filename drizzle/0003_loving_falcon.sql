CREATE TABLE `scooters` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(100) NOT NULL,
	`brand` varchar(100),
	`model` varchar(100),
	`serialNumber` varchar(100),
	`purchaseDate` timestamp,
	`initialOdometer` int NOT NULL DEFAULT 0,
	`totalDistance` int NOT NULL DEFAULT 0,
	`totalRides` int NOT NULL DEFAULT 0,
	`isDefault` boolean NOT NULL DEFAULT false,
	`color` varchar(20) DEFAULT '#FF6D00',
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `scooters_id` PRIMARY KEY(`id`)
);
