CREATE TABLE "uploads" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"object_key" text NOT NULL,
	"declared_bytes" bigint NOT NULL,
	"content_type" text NOT NULL,
	"multipart_id" text,
	"state" text DEFAULT 'pending' NOT NULL,
	"video_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uploads_state_check" CHECK ("uploads"."state" in ('pending','completed','aborted'))
);
--> statement-breakpoint
CREATE TABLE "video_additions" (
	"video_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "video_additions_video_id_user_id_pk" PRIMARY KEY("video_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "videos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"added_by" uuid,
	"source_kind" text NOT NULL,
	"source_url" text,
	"normalized_url" text,
	"platform" text,
	"sha256" "bytea",
	"state" text NOT NULL,
	"failure_reason" text,
	"title" text DEFAULT '' NOT NULL,
	"author_handle" text,
	"duration_ms" integer,
	"width" integer,
	"height" integer,
	"media_key" text,
	"thumb_key" text,
	"media_bytes" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ready_at" timestamp with time zone,
	"expired_at" timestamp with time zone,
	CONSTRAINT "videos_source_kind_check" CHECK ("videos"."source_kind" in ('link','upload')),
	CONSTRAINT "videos_state_check" CHECK ("videos"."state" in ('queued','fetching','processing','ready','link_only','failed','expired')),
	CONSTRAINT "videos_title_length" CHECK (char_length("videos"."title") <= 200)
);
--> statement-breakpoint
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_additions" ADD CONSTRAINT "video_additions_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_additions" ADD CONSTRAINT "video_additions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_added_by_users_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "uploads_user_idx" ON "uploads" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "video_additions_user_idx" ON "video_additions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "videos_normalized_url_key" ON "videos" USING btree ("normalized_url") WHERE "videos"."normalized_url" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "videos_sha256_key" ON "videos" USING btree ("sha256") WHERE "videos"."sha256" is not null;--> statement-breakpoint
CREATE INDEX "videos_added_by_idx" ON "videos" USING btree ("added_by");--> statement-breakpoint
CREATE INDEX "videos_state_idx" ON "videos" USING btree ("state");