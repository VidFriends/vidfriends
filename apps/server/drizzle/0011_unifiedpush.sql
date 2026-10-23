ALTER TABLE "push_targets" DROP CONSTRAINT "push_targets_kind_check";--> statement-breakpoint
DROP INDEX "push_targets_device_endpoint_key";--> statement-breakpoint
CREATE UNIQUE INDEX "push_targets_device_endpoint_key" ON "push_targets" USING btree ("endpoint") WHERE "push_targets"."kind" in ('webpush','expo','unifiedpush');--> statement-breakpoint
ALTER TABLE "push_targets" ADD CONSTRAINT "push_targets_kind_check" CHECK ("push_targets"."kind" in ('webpush','expo','ntfy','gotify','unifiedpush'));