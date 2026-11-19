CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"contact_name" text DEFAULT '' NOT NULL,
	"contact_phone" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "companies_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "company_audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid,
	"actor_id" text NOT NULL,
	"actor_name" text NOT NULL,
	"action" text NOT NULL,
	"target_id" text NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_settings" (
	"company_id" uuid PRIMARY KEY NOT NULL,
	"time_zone" text DEFAULT 'Asia/Shanghai' NOT NULL,
	"baseline_samples" integer DEFAULT 5 NOT NULL,
	"anomaly_multiplier" double precision DEFAULT 1.3 NOT NULL,
	"revision" uuid DEFAULT gen_random_uuid() NOT NULL,
	"legacy_initialized" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "vehicles" DROP CONSTRAINT "vehicles_plate_key_unique";--> statement-breakpoint
DROP INDEX "drivers_name_key_idx";--> statement-breakpoint
DROP INDEX "fuel_changes_record_at_idx";--> statement-breakpoint
DROP INDEX "fuel_deletions_at_idx";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "company_id" uuid;--> statement-breakpoint
ALTER TABLE "drivers" ADD COLUMN "company_id" uuid;--> statement-breakpoint
ALTER TABLE "fuel_changes" ADD COLUMN "company_id" uuid;--> statement-breakpoint
ALTER TABLE "fuel_deletions" ADD COLUMN "company_id" uuid;--> statement-breakpoint
ALTER TABLE "fuel_records" ADD COLUMN "company_id" uuid;--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN "company_id" uuid;--> statement-breakpoint
INSERT INTO "companies" ("id", "code", "name") VALUES ('00000000-0000-4000-8000-000000000001', 'DEFAULT', '默认公司');
--> statement-breakpoint
INSERT INTO "company_settings" ("company_id", "legacy_initialized") VALUES ('00000000-0000-4000-8000-000000000001', false);
--> statement-breakpoint
UPDATE "users" SET "role" = 'super_admin', "company_id" = NULL, "is_active" = true WHERE "id" = 'gasoline-single-account';
--> statement-breakpoint
UPDATE "users" SET "company_id" = '00000000-0000-4000-8000-000000000001' WHERE "role" <> 'super_admin';
--> statement-breakpoint
UPDATE "drivers" SET "company_id" = '00000000-0000-4000-8000-000000000001';
--> statement-breakpoint
ALTER TABLE "drivers" ALTER COLUMN "company_id" SET NOT NULL;
--> statement-breakpoint
UPDATE "fuel_changes" SET "company_id" = '00000000-0000-4000-8000-000000000001';
--> statement-breakpoint
ALTER TABLE "fuel_changes" ALTER COLUMN "company_id" SET NOT NULL;
--> statement-breakpoint
UPDATE "fuel_deletions" SET "company_id" = '00000000-0000-4000-8000-000000000001';
--> statement-breakpoint
ALTER TABLE "fuel_deletions" ALTER COLUMN "company_id" SET NOT NULL;
--> statement-breakpoint
UPDATE "fuel_records" SET "company_id" = '00000000-0000-4000-8000-000000000001';
--> statement-breakpoint
ALTER TABLE "fuel_records" ALTER COLUMN "company_id" SET NOT NULL;
--> statement-breakpoint
UPDATE "vehicles" SET "company_id" = '00000000-0000-4000-8000-000000000001';
--> statement-breakpoint
ALTER TABLE "vehicles" ALTER COLUMN "company_id" SET NOT NULL;
--> statement-breakpoint
DELETE FROM "sessions";
--> statement-breakpoint
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_company_id_unique" UNIQUE("company_id","id");--> statement-breakpoint
ALTER TABLE "fuel_records" ADD CONSTRAINT "fuel_records_company_id_unique" UNIQUE("company_id","id");--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_company_id_unique" UNIQUE("company_id","id");--> statement-breakpoint
ALTER TABLE "company_audit_logs" ADD CONSTRAINT "company_audit_logs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_settings" ADD CONSTRAINT "company_settings_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "companies_created_at_idx" ON "companies" USING btree ("created_at","id");--> statement-breakpoint
CREATE INDEX "company_audit_logs_company_created_idx" ON "company_audit_logs" USING btree ("company_id","created_at");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fuel_changes" ADD CONSTRAINT "fuel_changes_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fuel_changes" ADD CONSTRAINT "fuel_changes_company_record_fk" FOREIGN KEY ("company_id","record_id") REFERENCES "public"."fuel_records"("company_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fuel_deletions" ADD CONSTRAINT "fuel_deletions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fuel_records" ADD CONSTRAINT "fuel_records_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fuel_records" ADD CONSTRAINT "fuel_records_company_vehicle_fk" FOREIGN KEY ("company_id","vehicle_id") REFERENCES "public"."vehicles"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fuel_records" ADD CONSTRAINT "fuel_records_company_driver_fk" FOREIGN KEY ("company_id","driver_id") REFERENCES "public"."drivers"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "users_company_role_idx" ON "users" USING btree ("company_id","role");--> statement-breakpoint
CREATE UNIQUE INDEX "users_single_super_admin_idx" ON "users" USING btree ("role") WHERE "users"."role" = 'super_admin';--> statement-breakpoint
CREATE INDEX "drivers_company_name_key_idx" ON "drivers" USING btree ("company_id","name_key");--> statement-breakpoint
CREATE INDEX "fuel_changes_company_record_at_idx" ON "fuel_changes" USING btree ("company_id","record_id","changed_at");--> statement-breakpoint
CREATE INDEX "fuel_deletions_company_at_idx" ON "fuel_deletions" USING btree ("company_id","deleted_at");--> statement-breakpoint
CREATE INDEX "fuel_records_company_date_idx" ON "fuel_records" USING btree ("company_id","date","sequence");--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_company_plate_unique" UNIQUE("company_id","plate_key");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_role_company_check" CHECK (("users"."role" = 'super_admin' and "users"."company_id" is null and "users"."is_active") or ("users"."role" in ('admin', 'operator', 'viewer') and "users"."company_id" is not null));
