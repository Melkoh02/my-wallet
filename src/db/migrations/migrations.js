// Inlined migration - avoids .sql import issues with Metro bundler
export default {
  journal: {
    version: "7",
    dialect: "sqlite",
    entries: [
      {
        idx: 0,
        version: "6",
        when: 1774968504261,
        tag: "0000_acoustic_phil_sheldon",
        breakpoints: true,
      },
      {
        idx: 1,
        version: "6",
        when: 1775955600000,
        tag: "0001_loans_investments",
        breakpoints: true,
      },
      {
        idx: 2,
        version: "6",
        when: 1776042000000,
        tag: "0002_templates",
        breakpoints: true,
      },
      {
        idx: 3,
        version: "6",
        when: 1776128400000,
        tag: "0003_recurring_schedule",
        breakpoints: true,
      },
      {
        idx: 4,
        version: "6",
        when: 1776214800000,
        tag: "0004_split_origin",
        breakpoints: true,
      },
    ],
  },
  migrations: {
    m0000: `CREATE TABLE \`accounts\` (
\t\`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
\t\`name\` text NOT NULL,
\t\`institution\` text DEFAULT '' NOT NULL,
\t\`type\` text NOT NULL,
\t\`balance\` real DEFAULT 0 NOT NULL,
\t\`credit_limit\` real,
\t\`currency\` text DEFAULT 'USD' NOT NULL,
\t\`color\` text DEFAULT '#607D8B' NOT NULL,
\t\`icon\` text DEFAULT 'wallet' NOT NULL,
\t\`is_active\` integer DEFAULT true NOT NULL,
\t\`sort_order\` integer DEFAULT 0 NOT NULL,
\t\`created_at\` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE \`backups\` (
\t\`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
\t\`filename\` text NOT NULL,
\t\`file_path\` text NOT NULL,
\t\`size_bytes\` integer NOT NULL,
\t\`is_auto\` integer DEFAULT true NOT NULL,
\t\`created_at\` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE \`cashback_rules\` (
\t\`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
\t\`account_id\` integer NOT NULL,
\t\`subcategory_id\` integer,
\t\`percentage\` real NOT NULL,
\t\`monthly_cap\` real,
\t\`cashback_account_id\` integer NOT NULL,
\t\`is_active\` integer DEFAULT true NOT NULL,
\t\`created_at\` text DEFAULT (datetime('now')) NOT NULL,
\tFOREIGN KEY (\`account_id\`) REFERENCES \`accounts\`(\`id\`) ON UPDATE no action ON DELETE no action,
\tFOREIGN KEY (\`subcategory_id\`) REFERENCES \`subcategories\`(\`id\`) ON UPDATE no action ON DELETE no action,
\tFOREIGN KEY (\`cashback_account_id\`) REFERENCES \`accounts\`(\`id\`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE \`categories\` (
\t\`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
\t\`name\` text NOT NULL,
\t\`color\` text DEFAULT '#6B7280' NOT NULL,
\t\`icon\` text DEFAULT 'tag' NOT NULL,
\t\`is_income\` integer DEFAULT false NOT NULL,
\t\`is_expense\` integer DEFAULT true NOT NULL,
\t\`is_system\` integer DEFAULT false NOT NULL,
\t\`is_active\` integer DEFAULT true NOT NULL,
\t\`sort_order\` integer DEFAULT 0 NOT NULL,
\t\`created_at\` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE \`recurring_subcategories\` (
\t\`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
\t\`recurring_id\` integer NOT NULL,
\t\`subcategory_id\` integer NOT NULL,
\tFOREIGN KEY (\`recurring_id\`) REFERENCES \`recurring_transactions\`(\`id\`) ON UPDATE no action ON DELETE cascade,
\tFOREIGN KEY (\`subcategory_id\`) REFERENCES \`subcategories\`(\`id\`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX \`idx_rec_sub_unique\` ON \`recurring_subcategories\` (\`recurring_id\`,\`subcategory_id\`);--> statement-breakpoint
CREATE TABLE \`recurring_transactions\` (
\t\`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
\t\`type\` text NOT NULL,
\t\`amount\` real NOT NULL,
\t\`description\` text NOT NULL,
\t\`account_id\` integer NOT NULL,
\t\`frequency\` text NOT NULL,
\t\`next_date\` text NOT NULL,
\t\`end_date\` text,
\t\`is_active\` integer DEFAULT true NOT NULL,
\t\`contact_id\` text,
\t\`contact_name\` text,
\t\`cashback_amount\` real,
\t\`cashback_account_id\` integer,
\t\`created_at\` text DEFAULT (datetime('now')) NOT NULL,
\tFOREIGN KEY (\`account_id\`) REFERENCES \`accounts\`(\`id\`) ON UPDATE no action ON DELETE no action,
\tFOREIGN KEY (\`cashback_account_id\`) REFERENCES \`accounts\`(\`id\`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX \`idx_recurring_next_date\` ON \`recurring_transactions\` (\`next_date\`,\`is_active\`);--> statement-breakpoint
CREATE TABLE \`settings\` (
\t\`key\` text PRIMARY KEY NOT NULL,
\t\`value\` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE \`subcategories\` (
\t\`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
\t\`category_id\` integer NOT NULL,
\t\`name\` text NOT NULL,
\t\`is_general\` integer DEFAULT false NOT NULL,
\t\`is_active\` integer DEFAULT true NOT NULL,
\t\`sort_order\` integer DEFAULT 0 NOT NULL,
\t\`created_at\` text DEFAULT (datetime('now')) NOT NULL,
\tFOREIGN KEY (\`category_id\`) REFERENCES \`categories\`(\`id\`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX \`idx_subcategories_category\` ON \`subcategories\` (\`category_id\`);--> statement-breakpoint
CREATE TABLE \`themes\` (
\t\`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
\t\`name\` text NOT NULL,
\t\`mode\` text NOT NULL,
\t\`accent_color\` text NOT NULL,
\t\`status_bar_style\` text DEFAULT 'auto' NOT NULL,
\t\`is_active\` integer DEFAULT false NOT NULL,
\t\`created_at\` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE \`transaction_subcategories\` (
\t\`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
\t\`transaction_id\` integer NOT NULL,
\t\`subcategory_id\` integer NOT NULL,
\tFOREIGN KEY (\`transaction_id\`) REFERENCES \`transactions\`(\`id\`) ON UPDATE no action ON DELETE cascade,
\tFOREIGN KEY (\`subcategory_id\`) REFERENCES \`subcategories\`(\`id\`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX \`idx_txn_sub_unique\` ON \`transaction_subcategories\` (\`transaction_id\`,\`subcategory_id\`);--> statement-breakpoint
CREATE TABLE \`transactions\` (
\t\`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
\t\`type\` text NOT NULL,
\t\`amount\` real NOT NULL,
\t\`description\` text DEFAULT '' NOT NULL,
\t\`account_id\` integer NOT NULL,
\t\`to_account_id\` integer,
\t\`date\` text NOT NULL,
\t\`time\` text NOT NULL,
\t\`latitude\` real,
\t\`longitude\` real,
\t\`location_name\` text,
\t\`contact_id\` text,
\t\`contact_name\` text,
\t\`cashback_amount\` real,
\t\`cashback_account_id\` integer,
\t\`linked_transaction_id\` integer,
\t\`notes\` text,
\t\`recurring_id\` integer,
\t\`created_at\` text DEFAULT (datetime('now')) NOT NULL,
\tFOREIGN KEY (\`account_id\`) REFERENCES \`accounts\`(\`id\`) ON UPDATE no action ON DELETE no action,
\tFOREIGN KEY (\`to_account_id\`) REFERENCES \`accounts\`(\`id\`) ON UPDATE no action ON DELETE no action,
\tFOREIGN KEY (\`cashback_account_id\`) REFERENCES \`accounts\`(\`id\`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX \`idx_transactions_date\` ON \`transactions\` (\`date\`);--> statement-breakpoint
CREATE INDEX \`idx_transactions_account\` ON \`transactions\` (\`account_id\`);--> statement-breakpoint
CREATE INDEX \`idx_transactions_type\` ON \`transactions\` (\`type\`);--> statement-breakpoint
CREATE INDEX \`idx_transactions_contact\` ON \`transactions\` (\`contact_id\`);--> statement-breakpoint
CREATE INDEX \`idx_transactions_recurring\` ON \`transactions\` (\`recurring_id\`);`,
    m0001: `ALTER TABLE \`accounts\` ADD COLUMN \`counterparty\` text;
--> statement-breakpoint
ALTER TABLE \`accounts\` ADD COLUMN \`counterparty_contact_id\` text;
--> statement-breakpoint
ALTER TABLE \`accounts\` ADD COLUMN \`interest_rate\` real;
--> statement-breakpoint
ALTER TABLE \`accounts\` ADD COLUMN \`due_date\` text;
--> statement-breakpoint
ALTER TABLE \`accounts\` ADD COLUMN \`last_interest_date\` text;`,
    m0002: `CREATE TABLE \`templates\` (
\t\`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
\t\`name\` text NOT NULL,
\t\`icon\` text DEFAULT 'file-document' NOT NULL,
\t\`type\` text NOT NULL,
\t\`amount\` real DEFAULT 0 NOT NULL,
\t\`description\` text DEFAULT '' NOT NULL,
\t\`account_id\` integer,
\t\`to_account_id\` integer,
\t\`contact_id\` text,
\t\`contact_name\` text,
\t\`created_at\` text DEFAULT (datetime('now')) NOT NULL,
\tFOREIGN KEY (\`account_id\`) REFERENCES \`accounts\`(\`id\`) ON UPDATE no action ON DELETE no action,
\tFOREIGN KEY (\`to_account_id\`) REFERENCES \`accounts\`(\`id\`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE \`template_subcategories\` (
\t\`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
\t\`template_id\` integer NOT NULL,
\t\`subcategory_id\` integer NOT NULL,
\tFOREIGN KEY (\`template_id\`) REFERENCES \`templates\`(\`id\`) ON UPDATE no action ON DELETE cascade,
\tFOREIGN KEY (\`subcategory_id\`) REFERENCES \`subcategories\`(\`id\`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX \`idx_tpl_sub_unique\` ON \`template_subcategories\` (\`template_id\`,\`subcategory_id\`);`,
    m0003: `ALTER TABLE \`recurring_transactions\` ADD COLUMN \`day_of_month\` integer;
--> statement-breakpoint
ALTER TABLE \`recurring_transactions\` ADD COLUMN \`day_of_week\` integer;
--> statement-breakpoint
ALTER TABLE \`recurring_transactions\` ADD COLUMN \`time_of_day\` text;`,
    m0004: `ALTER TABLE \`accounts\` ADD COLUMN \`origin_transaction_id\` integer;`,
  },
};
