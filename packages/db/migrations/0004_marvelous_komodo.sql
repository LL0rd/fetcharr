ALTER TABLE `tasks` ADD `run_requested` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `tasks` ADD `confirm_requested` integer DEFAULT false NOT NULL;