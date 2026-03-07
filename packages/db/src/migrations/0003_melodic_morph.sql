ALTER TABLE `job_runs` ADD `user_id` text REFERENCES user(id);--> statement-breakpoint
ALTER TABLE `standups` ADD `user_id` text REFERENCES user(id);