CREATE TABLE `archive` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`extractor` text NOT NULL,
	`media_id` text NOT NULL,
	`type` text DEFAULT 'video' NOT NULL,
	`sub_id` text,
	`title` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `archive_entry` ON `archive` (`extractor`,`media_id`,`sub_id`);--> statement-breakpoint
CREATE TABLE `subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`url` text NOT NULL,
	`name` text NOT NULL,
	`type` text DEFAULT 'channel' NOT NULL,
	`media_type` text DEFAULT 'video' NOT NULL,
	`cron` text DEFAULT '0 */6 * * *' NOT NULL,
	`paused` integer DEFAULT false NOT NULL,
	`timerange_from` text,
	`title_regex` text,
	`max_quality` text,
	`custom_args` text,
	`custom_output` text,
	`sponsorblock` text DEFAULT 'off' NOT NULL,
	`record_livestreams` integer DEFAULT false NOT NULL,
	`redownload_fresh_uploads` integer DEFAULT false NOT NULL,
	`rss_enabled` integer DEFAULT false NOT NULL,
	`checking` integer DEFAULT false NOT NULL,
	`check_requested` integer DEFAULT false NOT NULL,
	`last_check_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `files` ADD `sub_id` text;--> statement-breakpoint
ALTER TABLE `jobs` ADD `sub_id` text;