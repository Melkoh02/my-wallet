CREATE TABLE `places` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`latitude` real,
	`longitude` real,
	`address` text,
	`source` text DEFAULT 'manual' NOT NULL,
	`visit_count` integer DEFAULT 0 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_places_coords` ON `places` (`latitude`,`longitude`);
--> statement-breakpoint
ALTER TABLE `transactions` ADD COLUMN `place_id` integer REFERENCES `places`(`id`);
--> statement-breakpoint
CREATE INDEX `idx_transactions_place` ON `transactions` (`place_id`);
