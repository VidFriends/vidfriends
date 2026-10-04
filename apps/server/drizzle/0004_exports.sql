CREATE TABLE "exports" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"include_media" boolean NOT NULL,
	"state" text DEFAULT 'queued' NOT NULL,
	"object_key" text,
	"bytes" bigint,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ready_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	CONSTRAINT "exports_state_check" CHECK ("exports"."state" in ('queued','building','ready','failed','expired'))
);
--> statement-breakpoint
ALTER TABLE "exports" ADD CONSTRAINT "exports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "exports_user_created_idx" ON "exports" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "exports_one_active_per_user" ON "exports" USING btree ("user_id") WHERE "exports"."state" in ('queued','building');