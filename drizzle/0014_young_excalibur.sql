CREATE TABLE `appVersions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`version` varchar(20) NOT NULL,
	`versionCode` int NOT NULL,
	`downloadUrl` varchar(500) NOT NULL,
	`releaseNotes` text,
	`forceUpdate` boolean NOT NULL DEFAULT false,
	`platform` varchar(20) NOT NULL DEFAULT 'android',
	`isActive` boolean NOT NULL DEFAULT true,
	`publishedAt` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `appVersions_id` PRIMARY KEY(`id`)
);
