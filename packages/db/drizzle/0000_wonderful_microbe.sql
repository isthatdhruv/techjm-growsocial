CREATE TYPE "public"."ai_provider" AS ENUM('openai', 'anthropic', 'google', 'xai', 'deepseek', 'mistral', 'replicate');--> statement-breakpoint
CREATE TYPE "public"."connection_health" AS ENUM('healthy', 'degraded', 'expired', 'disconnected');--> statement-breakpoint
CREATE TYPE "public"."consensus_tier" AS ENUM('definitive', 'strong', 'confirmed', 'experimental');--> statement-breakpoint
CREATE TYPE "public"."error_category" AS ENUM('INVALID_KEY', 'RATE_LIMITED', 'PROVIDER_ERROR', 'TOKEN_EXPIRED', 'DATA_NOT_FOUND', 'NETWORK_ERROR', 'INTERNAL_ERROR');--> statement-breakpoint
CREATE TYPE "public"."onboarding_step" AS ENUM('1', '2', '3', '4', '5', 'complete');--> statement-breakpoint
CREATE TYPE "public"."plan" AS ENUM('free', 'starter', 'pro', 'admin');--> statement-breakpoint
CREATE TYPE "public"."social_platform" AS ENUM('linkedin', 'x', 'instagram', 'facebook', 'tiktok', 'threads', 'bluesky');--> statement-breakpoint
CREATE TYPE "public"."post_status" AS ENUM('draft', 'generating', 'review', 'scheduled', 'publishing', 'published', 'failed');--> statement-breakpoint
CREATE TABLE "user_ai_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" "ai_provider" NOT NULL,
	"api_key_enc" text NOT NULL,
	"capabilities" jsonb NOT NULL,
	"validated_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "user_ai_keys_user_provider_unique" UNIQUE("user_id","provider")
);
--> statement-breakpoint
CREATE TABLE "user_model_config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"slot_a" jsonb,
	"slot_b" jsonb,
	"slot_c" jsonb,
	"slot_d" jsonb,
	"sub_agent_model" jsonb,
	"caption_model" jsonb,
	"image_model" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "user_model_config_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"firebase_uid" varchar(128) NOT NULL,
	"email" varchar(255) NOT NULL,
	"name" varchar(255),
	"avatar_url" text,
	"onboarding_step" "onboarding_step" DEFAULT '1' NOT NULL,
	"plan" "plan" DEFAULT 'free' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "users_firebase_uid_unique" UNIQUE("firebase_uid")
);
--> statement-breakpoint
CREATE TABLE "platform_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"platform" "social_platform" NOT NULL,
	"access_token_enc" text NOT NULL,
	"refresh_token_enc" text,
	"token_expires_at" timestamp,
	"org_urn" varchar(255),
	"account_name" varchar(255),
	"account_id" varchar(255),
	"connection_health" "connection_health" DEFAULT 'healthy',
	"last_health_check" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "platform_connections_user_platform_unique" UNIQUE("user_id","platform")
);
--> statement-breakpoint
CREATE TABLE "job_errors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"job_type" varchar(50) NOT NULL,
	"job_id" varchar(255) NOT NULL,
	"error_category" "error_category" NOT NULL,
	"error_message" text NOT NULL,
	"context" jsonb,
	"stack" text,
	"resolved" boolean DEFAULT false NOT NULL,
	"resolved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fallback_grounding_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" varchar(50) NOT NULL,
	"data" jsonb NOT NULL,
	"fetched_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"telegram_chat_id" varchar(100),
	"telegram_enabled" boolean DEFAULT true,
	"notify_daily_digest" boolean DEFAULT true,
	"notify_publish_success" boolean DEFAULT true,
	"notify_publish_failure" boolean DEFAULT true,
	"notify_token_expiry" boolean DEFAULT true,
	"notify_weekly_report" boolean DEFAULT true,
	"notify_connection_health" boolean DEFAULT true,
	"digest_time" varchar(5) DEFAULT '08:00',
	"timezone" varchar(50) DEFAULT 'UTC',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "notification_preferences_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"topic_id" uuid,
	"platform" "social_platform" NOT NULL,
	"caption" text NOT NULL,
	"hashtags" jsonb,
	"image_prompt" text,
	"image_url" text,
	"image_urls" jsonb,
	"status" "post_status" DEFAULT 'draft' NOT NULL,
	"scheduled_at" timestamp,
	"published_at" timestamp,
	"external_id" varchar(255),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "publish_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"platform" "social_platform" NOT NULL,
	"attempted_at" timestamp DEFAULT now() NOT NULL,
	"success" boolean NOT NULL,
	"external_id" varchar(255),
	"error_message" text,
	"retry_count" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "raw_topics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"source_llm" varchar(20) NOT NULL,
	"provider" "ai_provider" NOT NULL,
	"model" varchar(100) NOT NULL,
	"title" varchar(500) NOT NULL,
	"angle" text,
	"reasoning" text,
	"source_urls" jsonb,
	"x_post_urls" jsonb,
	"x_engagement" jsonb,
	"consensus_count" integer DEFAULT 1,
	"consensus_tier" "consensus_tier",
	"controversy_level" integer,
	"suggested_platform" varchar(20),
	"discovery_run_id" uuid,
	"fetched_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "recommendation_matrix" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"niche" varchar(100) NOT NULL,
	"slot_a_provider" "ai_provider" NOT NULL,
	"slot_a_model" varchar(100) NOT NULL,
	"slot_b_provider" "ai_provider" NOT NULL,
	"slot_b_model" varchar(100) NOT NULL,
	"slot_c_provider" "ai_provider" NOT NULL,
	"slot_c_model" varchar(100) NOT NULL,
	"slot_d_provider" "ai_provider" NOT NULL,
	"slot_d_model" varchar(100) NOT NULL,
	"sub_agent_provider" "ai_provider" NOT NULL,
	"sub_agent_model" varchar(100) NOT NULL,
	"caption_provider" "ai_provider" NOT NULL,
	"caption_model" varchar(100) NOT NULL,
	"image_provider" "ai_provider" NOT NULL,
	"image_model" varchar(100) NOT NULL,
	"reasoning" text NOT NULL,
	"est_cost_low" numeric(6, 2) NOT NULL,
	"est_cost_high" numeric(6, 2) NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "recommendation_matrix_niche_unique" UNIQUE("niche")
);
--> statement-breakpoint
CREATE TABLE "scored_topics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"raw_topic_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"sentiment_score" numeric(4, 2),
	"sentiment_risk_flag" boolean DEFAULT false,
	"audience_fit_score" numeric(3, 1),
	"audience_personas" jsonb,
	"seo_score" numeric(3, 1),
	"seo_hashtags" jsonb,
	"seo_keywords" jsonb,
	"competitor_gap_score" numeric(3, 1),
	"competitor_diff_angle" text,
	"cmf_score" numeric(3, 1),
	"cmf_linked_service" varchar(255),
	"cmf_cta_natural" boolean,
	"engagement_pred_likes" integer,
	"engagement_pred_comments" integer,
	"engagement_pred_confidence" numeric(3, 2),
	"pillar_boost" numeric(3, 2) DEFAULT '1.00',
	"consensus_multiplier" numeric(4, 2) DEFAULT '1.00',
	"final_score" numeric(6, 3),
	"sub_agent_outputs" jsonb,
	"status" varchar(20) DEFAULT 'pending',
	"scored_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "scoring_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid,
	"topic_id" uuid,
	"user_id" uuid NOT NULL,
	"predicted_score" numeric(6, 3),
	"actual_engagement" numeric(6, 3),
	"score_delta" numeric(6, 3),
	"weights_snapshot" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "scoring_weights" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"dimension" varchar(50) NOT NULL,
	"weight" numeric(4, 3) NOT NULL,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "scoring_weights_user_dimension_unique" UNIQUE("user_id","dimension")
);
--> statement-breakpoint
CREATE TABLE "topic_performance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"platform" "social_platform" NOT NULL,
	"impressions" integer DEFAULT 0,
	"likes" integer DEFAULT 0,
	"comments" integer DEFAULT 0,
	"shares" integer DEFAULT 0,
	"engagement_score" numeric(8, 4),
	"checkpoint" varchar(10) NOT NULL,
	"measured_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "user_niche_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"niche" varchar(100) NOT NULL,
	"pillars" jsonb NOT NULL,
	"audience" text NOT NULL,
	"tone" varchar(50) NOT NULL,
	"competitors" jsonb,
	"anti_topics" jsonb,
	"example_posts" jsonb,
	"brand_kit" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "user_niche_profiles_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "user_ai_keys" ADD CONSTRAINT "user_ai_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_model_config" ADD CONSTRAINT "user_model_config_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_connections" ADD CONSTRAINT "platform_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_errors" ADD CONSTRAINT "job_errors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_topic_id_scored_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."scored_topics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publish_log" ADD CONSTRAINT "publish_log_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw_topics" ADD CONSTRAINT "raw_topics_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scored_topics" ADD CONSTRAINT "scored_topics_raw_topic_id_raw_topics_id_fk" FOREIGN KEY ("raw_topic_id") REFERENCES "public"."raw_topics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scored_topics" ADD CONSTRAINT "scored_topics_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scoring_feedback" ADD CONSTRAINT "scoring_feedback_topic_id_scored_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."scored_topics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scoring_feedback" ADD CONSTRAINT "scoring_feedback_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scoring_weights" ADD CONSTRAINT "scoring_weights_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_performance" ADD CONSTRAINT "topic_performance_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_niche_profiles" ADD CONSTRAINT "user_niche_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_job_errors_user_created" ON "job_errors" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_job_errors_category" ON "job_errors" USING btree ("error_category");