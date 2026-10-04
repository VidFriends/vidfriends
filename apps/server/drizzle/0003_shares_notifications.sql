CREATE TABLE "instance_secrets" (
	"key" text PRIMARY KEY NOT NULL,
	"ciphertext" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_prefs" (
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"channel" text NOT NULL,
	"enabled" boolean NOT NULL,
	CONSTRAINT "notification_prefs_user_id_type_channel_pk" PRIMARY KEY("user_id","type","channel"),
	CONSTRAINT "notification_prefs_channel_check" CHECK ("notification_prefs"."channel" in ('push'))
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"actor_id" uuid,
	"share_id" uuid,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"read_at" timestamp with time zone,
	"pushed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notifications_type_check" CHECK ("notifications"."type" in ('share_received','reaction_received','reply_received','friend_request_received','friend_request_accepted','share_watched'))
);
--> statement-breakpoint
CREATE TABLE "push_targets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text,
	"auth" text,
	"private_previews" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_success_at" timestamp with time zone,
	CONSTRAINT "push_targets_kind_check" CHECK ("push_targets"."kind" in ('webpush','expo'))
);
--> statement-breakpoint
CREATE TABLE "replies" (
	"id" uuid PRIMARY KEY NOT NULL,
	"share_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"body" text NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "replies_body_length" CHECK (char_length("replies"."body") between 1 and 1000)
);
--> statement-breakpoint
CREATE TABLE "send_requests" (
	"sender_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"response" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "send_requests_sender_id_idempotency_key_pk" PRIMARY KEY("sender_id","idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "shares" (
	"id" uuid PRIMARY KEY NOT NULL,
	"video_id" uuid NOT NULL,
	"sender_id" uuid NOT NULL,
	"recipient_id" uuid NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"delivered_at" timestamp with time zone,
	"watched_at" timestamp with time zone,
	"progress_ms" integer DEFAULT 0 NOT NULL,
	"saved" boolean DEFAULT false NOT NULL,
	"saved_at" timestamp with time zone,
	"hidden" boolean DEFAULT false NOT NULL,
	"reaction" text,
	"reaction_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shares_not_self" CHECK ("shares"."sender_id" <> "shares"."recipient_id"),
	CONSTRAINT "shares_note_length" CHECK (char_length("shares"."note") <= 500),
	CONSTRAINT "shares_reaction_check" CHECK ("shares"."reaction" is null or "shares"."reaction" in ('👍','❤️','😂','😮','😢','🔥'))
);
--> statement-breakpoint
ALTER TABLE "notification_prefs" ADD CONSTRAINT "notification_prefs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_share_id_shares_id_fk" FOREIGN KEY ("share_id") REFERENCES "public"."shares"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_targets" ADD CONSTRAINT "push_targets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "replies" ADD CONSTRAINT "replies_share_id_shares_id_fk" FOREIGN KEY ("share_id") REFERENCES "public"."shares"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "replies" ADD CONSTRAINT "replies_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "send_requests" ADD CONSTRAINT "send_requests_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shares" ADD CONSTRAINT "shares_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shares" ADD CONSTRAINT "shares_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shares" ADD CONSTRAINT "shares_recipient_id_users_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id","read_at" NULLS FIRST,"created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "notifications_share_idx" ON "notifications" USING btree ("share_id");--> statement-breakpoint
CREATE UNIQUE INDEX "push_targets_endpoint_key" ON "push_targets" USING btree ("endpoint");--> statement-breakpoint
CREATE INDEX "push_targets_user_idx" ON "push_targets" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "replies_share_idx" ON "replies" USING btree ("share_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "shares_sender_recipient_video_key" ON "shares" USING btree ("sender_id","recipient_id","video_id");--> statement-breakpoint
CREATE INDEX "shares_feed_idx" ON "shares" USING btree ("recipient_id","watched_at" NULLS FIRST,"delivered_at","id") WHERE "shares"."hidden" = false and "shares"."delivered_at" is not null;--> statement-breakpoint
CREATE INDEX "shares_sender_idx" ON "shares" USING btree ("sender_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "shares_video_idx" ON "shares" USING btree ("video_id");--> statement-breakpoint
CREATE INDEX "shares_recipient_saved_idx" ON "shares" USING btree ("recipient_id","saved_at" DESC NULLS LAST) WHERE "shares"."saved";