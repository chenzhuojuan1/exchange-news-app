CREATE TABLE `news_articles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` text NOT NULL,
	`titleDisplay` varchar(200),
	`titleChinese` text,
	`publishDate` varchar(10) NOT NULL,
	`url` varchar(1024) NOT NULL,
	`matchedKeywords` text NOT NULL,
	`summary` text,
	`isRelevant` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `news_articles_id` PRIMARY KEY(`id`),
	CONSTRAINT `news_articles_url_unique` UNIQUE(`url`)
);
--> statement-breakpoint
CREATE TABLE `scrape_jobs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`startDate` varchar(10) NOT NULL,
	`endDate` varchar(10) NOT NULL,
	`articlesFound` int NOT NULL DEFAULT 0,
	`articlesFiltered` int NOT NULL DEFAULT 0,
	`status` varchar(20) NOT NULL DEFAULT 'completed',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `scrape_jobs_id` PRIMARY KEY(`id`)
);
