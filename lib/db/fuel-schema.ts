import {
  bigserial, boolean, date, index, jsonb, numeric, pgTable, text, timestamp, uuid,
} from "drizzle-orm/pg-core";
import type { FuelAnomaly, FuelAnomalyAssessment, FuelDeletionSnapshot, FuelFieldChange, FuelRecord, FuelType } from "../fuel";

export const vehicles = pgTable("vehicles", {
  id: uuid("id").defaultRandom().primaryKey(),
  plate: text("plate").notNull(),
  plateKey: text("plate_key").notNull().unique(),
  fuelType: text("fuel_type").$type<FuelType>().notNull(),
  notes: text("notes").default("").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const drivers = pgTable("drivers", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  nameKey: text("name_key").notNull(),
  phone: text("phone").default("").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  notes: text("notes").default("").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index("drivers_name_key_idx").on(table.nameKey)]);

export const fuelRecords = pgTable("fuel_records", {
  id: uuid("id").defaultRandom().primaryKey(),
  sequence: bigserial("sequence", { mode: "number" }).notNull().unique(),
  vehicleId: uuid("vehicle_id").notNull().references(() => vehicles.id),
  driverId: uuid("driver_id").notNull().references(() => drivers.id),
  date: date("date", { mode: "string" }).notNull(),
  fuelType: text("fuel_type").$type<FuelType>().notNull(),
  liters: numeric("liters", { precision: 10, scale: 3 }).notNull(),
  unitPrice: numeric("unit_price", { precision: 12, scale: 6 }).notNull(),
  amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
  odometer: numeric("odometer", { precision: 12, scale: 2 }).notNull(),
  distance: numeric("distance", { precision: 12, scale: 2 }),
  consumption: numeric("consumption", { precision: 20, scale: 6 }),
  baseline: numeric("baseline", { precision: 20, scale: 6 }),
  anomalyAssessment: jsonb("anomaly_assessment").$type<FuelAnomalyAssessment>(),
  isAnomaly: boolean("is_anomaly").default(false).notNull(),
  anomalyReason: text("anomaly_reason").$type<FuelAnomaly>(),
  notes: text("notes").default("").notNull(),
  source: text("source").$type<FuelRecord["source"]>().notNull(),
  createdById: text("created_by_id").notNull(),
  createdBy: text("created_by").notNull(),
  updatedById: text("updated_by_id").notNull(),
  updatedBy: text("updated_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("fuel_records_vehicle_order_idx").on(table.vehicleId, table.date, table.sequence),
  index("fuel_records_driver_idx").on(table.driverId),
  index("fuel_records_date_order_idx").on(table.date, table.sequence),
]);

export const fuelChanges = pgTable("fuel_changes", {
  id: uuid("id").defaultRandom().primaryKey(),
  recordId: uuid("record_id").notNull().references(() => fuelRecords.id, { onDelete: "cascade" }),
  changedById: text("changed_by_id").notNull(),
  changedBy: text("changed_by").notNull(),
  reason: text("reason").notNull(),
  changes: jsonb("changes").$type<FuelFieldChange[]>().notNull(),
  changedAt: timestamp("changed_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index("fuel_changes_record_at_idx").on(table.recordId, table.changedAt)]);

export const fuelDeletions = pgTable("fuel_deletions", {
  id: uuid("id").defaultRandom().primaryKey(),
  recordId: uuid("record_id").notNull(),
  plate: text("plate").notNull(),
  deletedById: text("deleted_by_id").notNull(),
  deletedBy: text("deleted_by").notNull(),
  reason: text("reason").default("").notNull(),
  snapshot: jsonb("snapshot").$type<FuelDeletionSnapshot>().notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index("fuel_deletions_at_idx").on(table.deletedAt)]);
