ALTER TABLE `scooters` ADD `maintenanceInterval` int DEFAULT 500000 NOT NULL;--> statement-breakpoint
ALTER TABLE `scooters` ADD `lastMaintenanceDistance` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `scooters` ADD `lastMaintenanceDate` timestamp;