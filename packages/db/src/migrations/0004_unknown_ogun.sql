CREATE TABLE `user_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`standup_cron` text DEFAULT '30 17 * * 1-5' NOT NULL,
	`reminder_cron` text DEFAULT '20 17 * * 1-5' NOT NULL,
	`recovery_cron` text DEFAULT '0 18 * * 1-5' NOT NULL,
	`timezone` text DEFAULT 'America/Sao_Paulo' NOT NULL,
	`repos_base_path` text NOT NULL,
	`git_author` text NOT NULL,
	`git_since_period` text DEFAULT '16 hours ago' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`snoozed_until` integer,
	`cancelled_date` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_settings_user_id_unique` ON `user_settings` (`user_id`);