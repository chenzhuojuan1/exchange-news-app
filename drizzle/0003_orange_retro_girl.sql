CREATE TABLE `favorites` (
	`id` int AUTO_INCREMENT NOT NULL,
	`articleId` int NOT NULL,
	`note` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `favorites_id` PRIMARY KEY(`id`)
);
