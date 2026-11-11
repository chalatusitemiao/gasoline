CREATE TABLE "vehicles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "plate" text NOT NULL,
  "plate_key" text NOT NULL,
  "fuel_type" text NOT NULL,
  "notes" text DEFAULT '' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "vehicles_plate_key_unique" UNIQUE("plate_key")
);
--> statement-breakpoint
CREATE TABLE "drivers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "name_key" text NOT NULL,
  "phone" text DEFAULT '' NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "notes" text DEFAULT '' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fuel_records" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "sequence" bigserial NOT NULL,
  "vehicle_id" uuid NOT NULL,
  "driver_id" uuid NOT NULL,
  "date" date NOT NULL,
  "fuel_type" text NOT NULL,
  "liters" numeric(10, 3) NOT NULL,
  "unit_price" numeric(12, 6) NOT NULL,
  "amount" numeric(18, 2) NOT NULL,
  "odometer" numeric(12, 2) NOT NULL,
  "distance" numeric(12, 2),
  "consumption" numeric(20, 6),
  "baseline" numeric(20, 6),
  "is_anomaly" boolean DEFAULT false NOT NULL,
  "anomaly_reason" text,
  "notes" text DEFAULT '' NOT NULL,
  "source" text NOT NULL,
  "created_by_id" text NOT NULL,
  "created_by" text NOT NULL,
  "updated_by_id" text NOT NULL,
  "updated_by" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "fuel_records_sequence_unique" UNIQUE("sequence"),
  CONSTRAINT "fuel_records_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id"),
  CONSTRAINT "fuel_records_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id")
);
--> statement-breakpoint
CREATE TABLE "fuel_changes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "record_id" uuid NOT NULL,
  "changed_by_id" text NOT NULL,
  "changed_by" text NOT NULL,
  "reason" text NOT NULL,
  "changes" jsonb NOT NULL,
  "changed_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "fuel_changes_record_id_fuel_records_id_fk" FOREIGN KEY ("record_id") REFERENCES "public"."fuel_records"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE "fuel_deletions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "record_id" uuid NOT NULL,
  "plate" text NOT NULL,
  "deleted_by_id" text NOT NULL,
  "deleted_by" text NOT NULL,
  "reason" text DEFAULT '' NOT NULL,
  "snapshot" jsonb NOT NULL,
  "deleted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "drivers_name_key_idx" ON "drivers" USING btree ("name_key");
--> statement-breakpoint
CREATE INDEX "fuel_records_vehicle_order_idx" ON "fuel_records" USING btree ("vehicle_id", "date", "sequence");
--> statement-breakpoint
CREATE INDEX "fuel_records_driver_idx" ON "fuel_records" USING btree ("driver_id");
--> statement-breakpoint
CREATE INDEX "fuel_records_date_order_idx" ON "fuel_records" USING btree ("date", "sequence");
--> statement-breakpoint
CREATE INDEX "fuel_changes_record_at_idx" ON "fuel_changes" USING btree ("record_id", "changed_at");
--> statement-breakpoint
CREATE INDEX "fuel_deletions_at_idx" ON "fuel_deletions" USING btree ("deleted_at");
