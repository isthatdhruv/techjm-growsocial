ALTER TABLE "platform_connections"
ADD COLUMN "scopes" jsonb DEFAULT '[]'::jsonb;
--> statement-breakpoint
ALTER TABLE "platform_connections"
ADD COLUMN "metadata" jsonb DEFAULT '{}'::jsonb;
--> statement-breakpoint
ALTER TABLE "platform_connections"
ADD COLUMN "is_active" boolean DEFAULT true NOT NULL;
