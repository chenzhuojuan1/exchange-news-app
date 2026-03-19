CREATE TABLE `keywords` (
	`id` int AUTO_INCREMENT NOT NULL,
	`keyword` varchar(100) NOT NULL,
	`isActive` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `keywords_id` PRIMARY KEY(`id`),
	CONSTRAINT `keywords_keyword_unique` UNIQUE(`keyword`)
);
