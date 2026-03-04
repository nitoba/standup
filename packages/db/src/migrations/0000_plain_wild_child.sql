CREATE TABLE `job_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`job_name` text NOT NULL,
	`date` text NOT NULL,
	`status` text NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	`error` text
);
--> statement-breakpoint
CREATE TABLE `standups` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`meeting_type` text NOT NULL,
	`content` text NOT NULL,
	`source_data` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
