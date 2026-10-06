CREATE TABLE IF NOT EXISTS "profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"handle" text NOT NULL,
	"wallet" text NOT NULL,
	"avatar" text DEFAULT '' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"active" bigint DEFAULT 1 NOT NULL,
	"cursor" bigint DEFAULT 0 NOT NULL,
	"head" bigint DEFAULT 0 NOT NULL,
	"updated" bigint DEFAULT 0 NOT NULL,
	"error" text DEFAULT '' NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "profiles_wallet_unique" ON "profiles" ("wallet");
CREATE TABLE IF NOT EXISTS "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL
);

CREATE TABLE IF NOT EXISTS "tokens" (
	"address" text PRIMARY KEY NOT NULL,
	"symbol" text NOT NULL,
	"name" text NOT NULL,
	"image" text DEFAULT '' NOT NULL,
	"valid" bigint DEFAULT 1 NOT NULL
);

CREATE TABLE IF NOT EXISTS "trades" (
	"id" text PRIMARY KEY NOT NULL,
	"wallet" text NOT NULL,
	"token" text NOT NULL,
	"side" text NOT NULL,
	"quantity" text NOT NULL,
	"native" text NOT NULL,
	"gas" text DEFAULT '0' NOT NULL,
	"time" bigint NOT NULL,
	"block" bigint NOT NULL,
	"tx" text NOT NULL,
	"quality" text DEFAULT 'indexed' NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_trades_wallet_time" ON "trades" ("wallet","time");
CREATE TABLE IF NOT EXISTS "transfers" (
	"id" text PRIMARY KEY NOT NULL,
	"wallet" text NOT NULL,
	"token" text NOT NULL,
	"direction" text NOT NULL,
	"quantity" text NOT NULL,
	"block" bigint NOT NULL,
	"tx" text NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_transfers_wallet_token" ON "transfers" ("wallet","token");
CREATE TABLE IF NOT EXISTS "wallet_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"wallet" text NOT NULL,
	"token" text NOT NULL,
	"page" bigint DEFAULT 1 NOT NULL,
	"complete" bigint DEFAULT 0 NOT NULL,
	"updated" bigint DEFAULT 0 NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_wallet_tokens_wallet" ON "wallet_tokens" ("wallet");
CREATE TABLE IF NOT EXISTS "chain_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"wallet" text NOT NULL,
	"tx" text NOT NULL,
	"block" bigint NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"message" text DEFAULT '' NOT NULL,
	"updated" bigint DEFAULT 0 NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_chain_jobs_status" ON "chain_jobs" ("status","updated");