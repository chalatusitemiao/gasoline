import { boolean, doublePrecision, index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const DEFAULT_COMPANY_ID = "00000000-0000-4000-8000-000000000001";

export const companies = pgTable("companies", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  contactName: text("contact_name").default("").notNull(),
  contactPhone: text("contact_phone").default("").notNull(),
  notes: text("notes").default("").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index("companies_created_at_idx").on(table.createdAt, table.id)]);

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
