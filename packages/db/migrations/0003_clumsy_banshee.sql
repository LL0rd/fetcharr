CREATE TABLE `notifications` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`body` text,
	`url` text,
	`read` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `task_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`task_key` text NOT NULL,
	`phase` text DEFAULT 'run' NOT NULL,
	`started_at` integer NOT NULL,
	`duration_ms` integer,
	`summary` text,
	`error` text
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`key` text PRIMARY KEY NOT NULL,
	`schedule` text,
	`options` text,
	`running` integer DEFAULT false NOT NULL,
	`confirming` integer DEFAULT false NOT NULL,
	`confirm_payload` text,
	`last_ran_at` integer,
	`last_confirmed_at` integer,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `jobs` ADD `not_before` integer;