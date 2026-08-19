CREATE TABLE `auth` (
	`id` integer PRIMARY KEY NOT NULL,
	`password_hash` text NOT NULL,
	`api_key` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `files` (
	`uid` text PRIMARY KEY NOT NULL,
	`url` text NOT NULL,
	`title` text NOT NULL,
	`uploader` text,
	`type` text NOT NULL,
	`path` text NOT NULL,
	`size_bytes` integer,
	`duration_sec` real,
	`thumbnail_path` text,
	`upload_date` text,
	`info_json` text,
	`favorite` integer DEFAULT false NOT NULL,
	`view_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `jobs` (
	`uid` text PRIMARY KEY NOT NULL,
	`url` text NOT NULL,
	`type` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`priority` integer DEFAULT 0 NOT NULL,
	`options` text NOT NULL,
	`title` text,
	`uploader` text,
	`progress_pct` real DEFAULT 0 NOT NULL,
	`progress_speed` text,
	`progress_eta` text,
	`size_bytes` integer,
	`stderr` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`max_attempts` integer DEFAULT 3 NOT NULL,
	`pid` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`started_at` integer,
	`finished_at` integer
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text
);
