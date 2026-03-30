PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_standups` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`meeting_type` text NOT NULL,
	`content` text NOT NULL,
	`source_data` text NOT NULL,
	`custom_entries` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`user_id` text NOT NULL,
	`dm_message_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`sent_to_discord_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_standups`("id", "date", "meeting_type", "content", "source_data", "custom_entries", "status", "user_id", "dm_message_id", "created_at", "updated_at", "sent_to_discord_at") SELECT "id", "date", "meeting_type", "content", "source_data", "custom_entries", "status", "user_id", "dm_message_id", "created_at", "updated_at", "sent_to_discord_at" FROM `standups`;--> statement-breakpoint
DROP TABLE `standups`;--> statement-breakpoint
ALTER TABLE `__new_standups` RENAME TO `standups`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `standups_user_date_unique` ON `standups` (`user_id`,`date`);--> statement-breakpoint
CREATE UNIQUE INDEX `job_runs_job_date_user_unique` ON `job_runs` (`job_name`,`date`,`user_id`);