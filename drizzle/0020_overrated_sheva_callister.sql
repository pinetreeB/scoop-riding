CREATE TABLE `bugReports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`title` varchar(200) NOT NULL,
	`description` text NOT NULL,
	`stepsToReproduce` text,
	`expectedBehavior` text,
	`actualBehavior` text,
	`screenshotUrls` text,
	`severity` enum('low','medium','high','critical') NOT NULL DEFAULT 'medium',
	`status` enum('open','in_progress','resolved','closed','wont_fix') NOT NULL DEFAULT 'open',
	`appVersion` varchar(20),
	`deviceInfo` varchar(200),
	`adminNotes` text,
	`resolvedBy` int,
	`resolvedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `bugReports_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `surveyResponses` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`overallRating` int NOT NULL,
	`usabilityRating` int NOT NULL,
	`featureRating` int NOT NULL,
	`mostUsedFeature` varchar(50) NOT NULL,
	`improvementSuggestion` text,
	`bugReport` text,
	`wouldRecommend` boolean,
	`appVersion` varchar(20),
	`deviceInfo` varchar(200),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `surveyResponses_id` PRIMARY KEY(`id`)
);
