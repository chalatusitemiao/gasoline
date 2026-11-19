CREATE TABLE "company_renewals" (
	"id" uuid PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"months" integer NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"recorded_by" text NOT NULL,
	CONSTRAINT "company_renewals_amount_check" CHECK ("company_renewals"."amount" > 0),
	CONSTRAINT "company_renewals_months_check" CHECK ("company_renewals"."months" between 1 and 120),
	CONSTRAINT "company_renewals_period_check" CHECK ("company_renewals"."ends_at" > "company_renewals"."starts_at")
);
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "billing_required" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "companies" ALTER COLUMN "billing_required" SET DEFAULT true;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "paid_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "company_renewals" ADD CONSTRAINT "company_renewals_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "company_renewals_company_recorded_idx" ON "company_renewals" USING btree ("company_id","recorded_at","id");
