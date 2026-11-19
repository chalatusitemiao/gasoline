import { sql } from "drizzle-orm";
import { boolean, check, doublePrecision, index, integer, jsonb, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const DEFAULT_COMPANY_ID = "00000000-0000-4000-8000-000000000001";

export const companies = pgTable("companies", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  contactName: text("contact_name").default("").notNull(),
  contactPhone: text("contact_phone").default("").notNull(),
  notes: text("notes").default("").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  billingRequired: boolean("billing_required").default(true).notNull(),
  paidUntil: timestamp("paid_until", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index("companies_created_at_idx").on(table.createdAt, table.id)]);

export const companyRenewals = pgTable("company_renewals", {
  id: uuid("id").primaryKey(),
  companyId: uuid("company_id").notNull().references(() => companies.id),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  months: integer("months").notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
  recordedBy: text("recorded_by").notNull(),
}, (table) => [
  index("company_renewals_company_recorded_idx").on(table.companyId, table.recordedAt, table.id),
  check("company_renewals_amount_check", sql`${table.amount} > 0`),
  check("company_renewals_months_check", sql`${table.months} between 1 and 120`),
  check("company_renewals_period_check", sql`${table.endsAt} > ${table.startsAt}`),
]);

export const companySettings = pgTable("company_settings", {
  companyId: uuid("company_id").primaryKey().references(() => companies.id),
  timeZone: text("time_zone").default("Asia/Shanghai").notNull(),
  baselineSamples: integer("baseline_samples").default(5).notNull(),
  anomalyMultiplier: doublePrecision("anomaly_multiplier").default(1.3).notNull(),
  revision: uuid("revision").defaultRandom().notNull(),
  legacyInitialized: boolean("legacy_initialized").default(true).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const companyAuditLogs = pgTable("company_audit_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyId: uuid("company_id").references(() => companies.id),
  actorId: text("actor_id").notNull(),
  actorName: text("actor_name").notNull(),
  action: text("action").notNull(),
  targetId: text("target_id").notNull(),
  details: jsonb("details").$type<Record<string, unknown>>().default({}).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index("company_audit_logs_company_created_idx").on(table.companyId, table.createdAt)]);
