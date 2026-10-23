CREATE TABLE "video_fingerprints" (
	"video_id" uuid PRIMARY KEY NOT NULL,
	"duration_ms" integer NOT NULL,
	"width" integer,
	"height" integer,
	"hashes" "bytea" NOT NULL,
	"mask" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "media_reused" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "video_fingerprints" ADD CONSTRAINT "video_fingerprints_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "video_fingerprints_duration_idx" ON "video_fingerprints" USING btree ("duration_ms");