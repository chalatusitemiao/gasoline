import { sql } from "drizzle-orm";
import { check, date, foreignKey, index, jsonb, numeric, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import type { PartFieldChange, PartPhotoMimeType, PartRecord } from "../parts";
import { companies } from "./company-schema";
import { fleetProjects, vehicles } from "./fuel-schema";

export const partRecords = pgTable("part_records", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyId: uuid("company_id").notNull().references(() => companies.id),
  vehicleId: uuid("vehicle_id").notNull(),
  projectId: uuid("project_id"),
  date: date("date", { mode: "string" }).notNull(),
  name: text("name").notNull(),
  quantity: numeric("quantity", { precision: 10, scale: 3 }).notNull(),
  unitPrice: numeric("unit_price", { precision: 11, scale: 2 }).notNull(),
  amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
  purchaseArea: text("purchase_area").default("").notNull(),
  createdById: text("created_by_id").notNull(),
  createdBy: text("created_by").notNull(),
  updatedBy: text("updated_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  deletedById: text("deleted_by_id"),
  deletedBy: text("deleted_by"),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  deletionReason: text("deletion_reason"),
  deletionSnapshot: jsonb("deletion_snapshot").$type<PartRecord>(),
}, (table) => [
  unique("part_records_company_id_unique").on(table.companyId, table.id),
  foreignKey({ name: "part_records_company_vehicle_fk", columns: [table.companyId, table.vehicleId], foreignColumns: [vehicles.companyId, vehicles.id] }),
  foreignKey({ name: "part_records_company_project_fk", columns: [table.companyId, table.projectId], foreignColumns: [fleetProjects.companyId, fleetProjects.id] }),
  check("part_records_amount_check", sql`${table.quantity} > 0 and ${table.unitPrice} >= 0 and ${table.amount} = round(${table.quantity} * ${table.unitPrice}, 2)`),
  check("part_records_deletion_check", sql`(${table.deletedAt} is null and ${table.deletedById} is null and ${table.deletedBy} is null and ${table.deletionReason} is null and ${table.deletionSnapshot} is null)
    or (${table.deletedAt} is not null and ${table.deletedById} is not null and ${table.deletedBy} is not null and ${table.deletionReason} is not null and ${table.deletionSnapshot} is not null)`),
  index("part_records_company_date_idx").on(table.companyId, table.date).where(sql`${table.deletedAt} is null`),
  index("part_records_company_vehicle_date_idx").on(table.companyId, table.vehicleId, table.date),
  index("part_records_company_project_date_idx").on(table.companyId, table.projectId, table.date).where(sql`${table.deletedAt} is null`),
  index("part_records_company_deleted_at_idx").on(table.companyId, table.deletedAt).where(sql`${table.deletedAt} is not null`),
]);

export const partPhotos = pgTable("part_photos", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyId: uuid("company_id").notNull(),
  recordId: uuid("record_id").notNull(),
  mimeType: text("mime_type").$type<PartPhotoMimeType>().notNull(),
  data: text("data").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  removedAt: timestamp("removed_at", { withTimezone: true }),
}, (table) => [
  foreignKey({ name: "part_photos_company_record_fk", columns: [table.companyId, table.recordId], foreignColumns: [partRecords.companyId, partRecords.id] }),
  index("part_photos_company_record_idx").on(table.companyId, table.recordId),
]);

export const partChanges = pgTable("part_changes", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyId: uuid("company_id").notNull(),
  recordId: uuid("record_id").notNull(),
  changedById: text("changed_by_id").notNull(),
  changedBy: text("changed_by").notNull(),
  reason: text("reason").notNull(),
  changes: jsonb("changes").$type<PartFieldChange[]>().notNull(),
  changedAt: timestamp("changed_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  foreignKey({ name: "part_changes_company_record_fk", columns: [table.companyId, table.recordId], foreignColumns: [partRecords.companyId, partRecords.id] }),
  index("part_changes_company_record_at_idx").on(table.companyId, table.recordId, table.changedAt),
]);
