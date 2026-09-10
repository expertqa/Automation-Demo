CREATE TABLE `artifacts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`attempt_id` integer NOT NULL,
	`run_id` text NOT NULL,
	`test_id` text NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`content_type` text NOT NULL,
	`relative_path` text NOT NULL,
	`size_bytes` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`attempt_id`) REFERENCES `test_attempts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`run_id`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`test_id`) REFERENCES `tests`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_artifacts_attempt` ON `artifacts` (`attempt_id`);--> statement-breakpoint
CREATE INDEX `idx_artifacts_run` ON `artifacts` (`run_id`);--> statement-breakpoint
CREATE INDEX `idx_artifacts_test` ON `artifacts` (`test_id`);--> statement-breakpoint
CREATE INDEX `idx_artifacts_kind` ON `artifacts` (`kind`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_artifacts_path` ON `artifacts` (`relative_path`);--> statement-breakpoint
CREATE TABLE `errors` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`attempt_id` integer NOT NULL,
	`run_id` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`message` text NOT NULL,
	`stack` text,
	`snippet` text,
	`location_file` text,
	`location_line` integer,
	`location_column` integer,
	`fingerprint` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`attempt_id`) REFERENCES `test_attempts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`run_id`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_errors_attempt` ON `errors` (`attempt_id`);--> statement-breakpoint
CREATE INDEX `idx_errors_run` ON `errors` (`run_id`);--> statement-breakpoint
CREATE INDEX `idx_errors_fingerprint` ON `errors` (`fingerprint`);--> statement-breakpoint
CREATE TABLE `run_suites` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`run_id` text NOT NULL,
	`suite_id` text NOT NULL,
	`total` integer DEFAULT 0 NOT NULL,
	`passed` integer DEFAULT 0 NOT NULL,
	`failed` integer DEFAULT 0 NOT NULL,
	`flaky` integer DEFAULT 0 NOT NULL,
	`skipped` integer DEFAULT 0 NOT NULL,
	`duration_ms` integer DEFAULT 0 NOT NULL,
	`avg_duration_ms` real DEFAULT 0 NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`suite_id`) REFERENCES `suites`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_run_suites` ON `run_suites` (`run_id`,`suite_id`);--> statement-breakpoint
CREATE INDEX `idx_run_suites_suite` ON `run_suites` (`suite_id`);--> statement-breakpoint
CREATE TABLE `run_tests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`run_id` text NOT NULL,
	`test_id` text NOT NULL,
	`suite_id` text NOT NULL,
	`playwright_id` text,
	`project` text DEFAULT '' NOT NULL,
	`browser` text,
	`status` text NOT NULL,
	`expected_status` text DEFAULT 'passed' NOT NULL,
	`duration_ms` integer DEFAULT 0 NOT NULL,
	`retries` integer DEFAULT 0 NOT NULL,
	`attempts` integer DEFAULT 1 NOT NULL,
	`started_at` text NOT NULL,
	`file` text NOT NULL,
	`line` integer DEFAULT 0 NOT NULL,
	`column` integer,
	`error_summary` text,
	`tags_json` text DEFAULT '[]' NOT NULL,
	`annotations_json` text DEFAULT '[]' NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`test_id`) REFERENCES `tests`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`suite_id`) REFERENCES `suites`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_run_tests_run_test_project` ON `run_tests` (`run_id`,`test_id`,`project`);--> statement-breakpoint
CREATE INDEX `idx_run_tests_run` ON `run_tests` (`run_id`);--> statement-breakpoint
CREATE INDEX `idx_run_tests_test` ON `run_tests` (`test_id`);--> statement-breakpoint
CREATE INDEX `idx_run_tests_suite` ON `run_tests` (`suite_id`);--> statement-breakpoint
CREATE INDEX `idx_run_tests_status` ON `run_tests` (`status`);--> statement-breakpoint
CREATE INDEX `idx_run_tests_started` ON `run_tests` (`started_at`);--> statement-breakpoint
CREATE INDEX `idx_run_tests_project` ON `run_tests` (`project`);--> statement-breakpoint
CREATE TABLE `runs` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`started_at` text NOT NULL,
	`finished_at` text NOT NULL,
	`duration_ms` integer DEFAULT 0 NOT NULL,
	`status` text NOT NULL,
	`source` text NOT NULL,
	`environment` text DEFAULT 'local' NOT NULL,
	`branch` text,
	`commit_sha` text,
	`commit_message` text,
	`commit_author` text,
	`repository_url` text,
	`ci_provider` text,
	`ci_workflow` text,
	`ci_job_name` text,
	`ci_run_id` text,
	`ci_run_number` text,
	`ci_run_url` text,
	`ci_actor` text,
	`playwright_version` text,
	`node_version` text,
	`os_platform` text,
	`os_release` text,
	`os_arch` text,
	`projects_json` text DEFAULT '[]' NOT NULL,
	`project_names` text DEFAULT '' NOT NULL,
	`browser_names` text DEFAULT '' NOT NULL,
	`total` integer DEFAULT 0 NOT NULL,
	`passed` integer DEFAULT 0 NOT NULL,
	`failed` integer DEFAULT 0 NOT NULL,
	`flaky` integer DEFAULT 0 NOT NULL,
	`skipped` integer DEFAULT 0 NOT NULL,
	`timed_out` integer DEFAULT 0 NOT NULL,
	`interrupted` integer DEFAULT 0 NOT NULL,
	`retries` integer DEFAULT 0 NOT NULL,
	`metadata_json` text DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_runs_started_at` ON `runs` (`started_at`);--> statement-breakpoint
CREATE INDEX `idx_runs_status` ON `runs` (`status`);--> statement-breakpoint
CREATE INDEX `idx_runs_branch` ON `runs` (`branch`);--> statement-breakpoint
CREATE INDEX `idx_runs_environment` ON `runs` (`environment`);--> statement-breakpoint
CREATE INDEX `idx_runs_source` ON `runs` (`source`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value_json` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `suites` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_suites_name` ON `suites` (`name`);--> statement-breakpoint
CREATE TABLE `test_attempts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`run_test_id` integer NOT NULL,
	`run_id` text NOT NULL,
	`retry` integer DEFAULT 0 NOT NULL,
	`status` text NOT NULL,
	`started_at` text NOT NULL,
	`duration_ms` integer DEFAULT 0 NOT NULL,
	`worker_index` integer,
	`parallel_index` integer,
	`stdout` text DEFAULT '' NOT NULL,
	`stderr` text DEFAULT '' NOT NULL,
	`steps_json` text DEFAULT '[]' NOT NULL,
	FOREIGN KEY (`run_test_id`) REFERENCES `run_tests`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`run_id`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_attempts_run_test_retry` ON `test_attempts` (`run_test_id`,`retry`);--> statement-breakpoint
CREATE INDEX `idx_attempts_run` ON `test_attempts` (`run_id`);--> statement-breakpoint
CREATE INDEX `idx_attempts_status` ON `test_attempts` (`status`);--> statement-breakpoint
CREATE TABLE `tests` (
	`id` text PRIMARY KEY NOT NULL,
	`suite_id` text NOT NULL,
	`title` text NOT NULL,
	`title_path_json` text DEFAULT '[]' NOT NULL,
	`full_title` text NOT NULL,
	`file` text NOT NULL,
	`line` integer DEFAULT 0 NOT NULL,
	`column` integer,
	`first_seen_at` text NOT NULL,
	`last_seen_at` text NOT NULL,
	FOREIGN KEY (`suite_id`) REFERENCES `suites`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_tests_suite` ON `tests` (`suite_id`);--> statement-breakpoint
CREATE INDEX `idx_tests_file` ON `tests` (`file`);--> statement-breakpoint
CREATE INDEX `idx_tests_title` ON `tests` (`title`);