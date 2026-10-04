CREATE TABLE "collection_items" (
	"collection_id" uuid NOT NULL,
	"share_id" uuid NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "collection_items_collection_id_share_id_pk" PRIMARY KEY("collection_id","share_id")
);
--> statement-breakpoint
CREATE TABLE "collections" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "collections_name_length" CHECK (char_length("collections"."name") between 1 and 60)
);
--> statement-breakpoint
ALTER TABLE "collection_items" ADD CONSTRAINT "collection_items_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_items" ADD CONSTRAINT "collection_items_share_id_shares_id_fk" FOREIGN KEY ("share_id") REFERENCES "public"."shares"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collections" ADD CONSTRAINT "collections_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "collection_items_order_idx" ON "collection_items" USING btree ("collection_id","added_at" DESC NULLS LAST,"share_id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "collection_items_share_idx" ON "collection_items" USING btree ("share_id");--> statement-breakpoint
CREATE UNIQUE INDEX "collections_owner_name_key" ON "collections" USING btree ("owner_id",lower("name"));