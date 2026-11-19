CREATE TABLE "fleet_projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"name_key" text NOT NULL,
	"manager" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fleet_projects_company_name_unique" UNIQUE("company_id","name_key"),
	CONSTRAINT "fleet_projects_company_id_unique" UNIQUE("company_id","id")
);
--> statement-breakpoint
CREATE TABLE "part_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"record_id" uuid NOT NULL,
	"changed_by_id" text NOT NULL,
	"changed_by" text NOT NULL,
	"reason" text NOT NULL,
	"changes" jsonb NOT NULL,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "part_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"record_id" uuid NOT NULL,
	"mime_type" text NOT NULL,
	"data" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "part_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"project_id" uuid,
	"date" date NOT NULL,
	"name" text NOT NULL,
	"quantity" numeric(10, 3) NOT NULL,
	"unit_price" numeric(11, 2) NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"purchase_area" text DEFAULT '' NOT NULL,
	"created_by_id" text NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_by_id" text,
	"deleted_by" text,
	"deleted_at" timestamp with time zone,
	"deletion_reason" text,
	"deletion_snapshot" jsonb,
	CONSTRAINT "part_records_company_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "part_records_amount_check" CHECK ("part_records"."quantity" > 0 and "part_records"."unit_price" >= 0 and "part_records"."amount" = round("part_records"."quantity" * "part_records"."unit_price", 2)),
	CONSTRAINT "part_records_deletion_check" CHECK (("part_records"."deleted_at" is null and "part_records"."deleted_by_id" is null and "part_records"."deleted_by" is null and "part_records"."deletion_reason" is null and "part_records"."deletion_snapshot" is null)
    or ("part_records"."deleted_at" is not null and "part_records"."deleted_by_id" is not null and "part_records"."deleted_by" is not null and "part_records"."deletion_reason" is not null and "part_records"."deletion_snapshot" is not null))
);
--> statement-breakpoint
ALTER TABLE "drivers" ADD COLUMN "project_id" uuid;--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN "project_id" uuid;--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN "purchase_date" date;--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN "purchase_price" numeric(18, 2);--> statement-breakpoint
ALTER TABLE "fleet_projects" ADD CONSTRAINT "fleet_projects_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "part_changes" ADD CONSTRAINT "part_changes_company_record_fk" FOREIGN KEY ("company_id","record_id") REFERENCES "public"."part_records"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "part_photos" ADD CONSTRAINT "part_photos_company_record_fk" FOREIGN KEY ("company_id","record_id") REFERENCES "public"."part_records"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "part_records" ADD CONSTRAINT "part_records_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "part_records" ADD CONSTRAINT "part_records_company_vehicle_fk" FOREIGN KEY ("company_id","vehicle_id") REFERENCES "public"."vehicles"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "part_records" ADD CONSTRAINT "part_records_company_project_fk" FOREIGN KEY ("company_id","project_id") REFERENCES "public"."fleet_projects"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "part_changes_company_record_at_idx" ON "part_changes" USING btree ("company_id","record_id","changed_at");--> statement-breakpoint
CREATE INDEX "part_photos_company_record_idx" ON "part_photos" USING btree ("company_id","record_id");--> statement-breakpoint
CREATE INDEX "part_records_company_date_idx" ON "part_records" USING btree ("company_id","date") WHERE "part_records"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "part_records_company_vehicle_date_idx" ON "part_records" USING btree ("company_id","vehicle_id","date");--> statement-breakpoint
CREATE INDEX "part_records_company_project_date_idx" ON "part_records" USING btree ("company_id","project_id","date") WHERE "part_records"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "part_records_company_deleted_at_idx" ON "part_records" USING btree ("company_id","deleted_at") WHERE "part_records"."deleted_at" is not null;--> statement-breakpoint
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_company_project_fk" FOREIGN KEY ("company_id","project_id") REFERENCES "public"."fleet_projects"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_company_project_fk" FOREIGN KEY ("company_id","project_id") REFERENCES "public"."fleet_projects"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "drivers_company_project_idx" ON "drivers" USING btree ("company_id","project_id");--> statement-breakpoint
CREATE INDEX "vehicles_company_project_idx" ON "vehicles" USING btree ("company_id","project_id");--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_purchase_price_check" CHECK ("vehicles"."purchase_price" >= 0);