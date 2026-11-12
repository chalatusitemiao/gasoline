import "server-only";

import { and, count, desc, eq, gte, ilike, lt, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { drivers, fuelChanges, fuelDeletions, fuelRecords, vehicles } from "@/lib/db/fuel-schema";
import {
  fuelDateSchema, fuelRecordInputSchema, plateKey, type FuelDeletion, type FuelFieldChange,
  type FuelPage, type FuelRecord, type FuelRecordDetail, type FuelRecordExportRow, type FuelRecordsPage,
} from "@/lib/fuel";
import { todayInBusinessZone } from "@/lib/fuel-calendar";
import { ApiError } from "@/lib/server-api";
import { getSystemSettings } from "@/lib/system-settings";
import { FuelDecimal, manualAmounts, recalculateVehicles } from "./calculations";
import {
  keywordSchema, pageSchema, parse, readFuel, searchPattern, writeFuel,
  type FuelActor, type FuelReadDb, type FuelTx,
} from "./shared";

const exportSelection = {
  plate: vehicles.plate,
  driverId: fuelRecords.driverId,
  driverName: drivers.name,
  date: fuelRecords.date,
  fuelType: fuelRecords.fuelType,
  liters: fuelRecords.liters,
  unitPrice: fuelRecords.unitPrice,
  amount: fuelRecords.amount,
  odometer: fuelRecords.odometer,
  distance: fuelRecords.distance,
  consumption: fuelRecords.consumption,
  baseline: fuelRecords.baseline,
  anomalyAssessment: fuelRecords.anomalyAssessment,
  anomalyReason: fuelRecords.anomalyReason,
  notes: fuelRecords.notes,
  createdBy: fuelRecords.createdBy,
};

const selection = {
  ...exportSelection,
  id: fuelRecords.id,
  vehicleId: fuelRecords.vehicleId,
  isAnomaly: fuelRecords.isAnomaly,
  source: fuelRecords.source,
  createdAt: fuelRecords.createdAt,
  updatedAt: fuelRecords.updatedAt,
  updatedBy: fuelRecords.updatedBy,
};
const recordOrder = [desc(fuelRecords.date), desc(fuelRecords.sequence)] as const;

type RecordRow = Omit<FuelRecord, "createdAt" | "updatedAt"> & { createdAt: Date; updatedAt: Date };
type RecordInput = z.output<typeof fuelRecordInputSchema>;

function formatRecord(row: RecordRow): FuelRecord {
  return { ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}

function selectRecords(db: FuelReadDb) {
  return db.select(selection).from(fuelRecords)
    .innerJoin(vehicles, eq(fuelRecords.vehicleId, vehicles.id))
    .innerJoin(drivers, eq(fuelRecords.driverId, drivers.id));
}

async function findRecord(db: FuelReadDb, id: string) {
  const [row] = await selectRecords(db).where(eq(fuelRecords.id, id)).limit(1);
  if (!row) throw new ApiError(404, "加油记录不存在");
  return row;
}

function validateRefuelDate(date: string, today: string) {
  if (date > today) throw new ApiError(400, "加油日期不能晚于今天");
}

const dateFilter = z.preprocess((value) => value === "" ? undefined : value, fuelDateSchema.optional());
const idFilter = z.preprocess((value) => value === "" ? undefined : value, z.uuid().optional());
const recordFilters = z.object({
  from: dateFilter,
  to: dateFilter,
  vehicleId: idFilter,
  driverId: idFilter,
  keyword: keywordSchema,
  anomaliesOnly: z.enum(["true", "false", "1", "0"]).optional(),
});
const recordPageFilters = pageSchema.extend(recordFilters.shape);

function recordWhere({ from, to, vehicleId, driverId, keyword, anomaliesOnly }: z.output<typeof recordFilters>) {
  if (from && to && from > to) throw new ApiError(400, "开始日期不能晚于结束日期");
  const pattern = searchPattern(keyword);
  const normalizedPlate = plateKey(keyword);
  return and(
    from ? gte(fuelRecords.date, from) : undefined,
    to ? lte(fuelRecords.date, to) : undefined,
    vehicleId ? eq(fuelRecords.vehicleId, vehicleId) : undefined,
    driverId ? eq(fuelRecords.driverId, driverId) : undefined,
    anomaliesOnly === "true" || anomaliesOnly === "1" ? eq(fuelRecords.isAnomaly, true) : undefined,
    keyword ? or(
      normalizedPlate ? ilike(vehicles.plateKey, searchPattern(normalizedPlate)) : undefined,
      ilike(drivers.name, pattern),
      ilike(fuelRecords.notes, pattern),
    ) : undefined,
  );
}

export async function listRecords(query: unknown): Promise<FuelRecordsPage> {
  const { page, pageSize, ...filters } = parse(recordPageFilters, query);
  const where = recordWhere(filters);
  return readFuel(async (db) => {
    const [summary] = await db.select({
      recordCount: count(),
      totalLiters: sql<string>`coalesce(sum(${fuelRecords.liters}), 0)::text`,
      totalAmount: sql<string>`coalesce(sum(${fuelRecords.amount}), 0)::text`,
      totalDistance: sql<string>`coalesce(sum(greatest(${fuelRecords.distance}, 0)), 0)::text`,
      intervalLiters: sql<string>`coalesce(sum(${fuelRecords.liters}) filter (where ${fuelRecords.distance} > 0), 0)::text`,
      anomalyCount: count(sql`case when ${fuelRecords.isAnomaly} then 1 end`),
    }).from(fuelRecords)
      .innerJoin(vehicles, eq(fuelRecords.vehicleId, vehicles.id))
      .innerJoin(drivers, eq(fuelRecords.driverId, drivers.id)).where(where);

    const items = await selectRecords(db).where(where)
      .orderBy(...recordOrder)
      .limit(pageSize).offset((page - 1) * pageSize);
    const { intervalLiters, ...totals } = summary;
    const distance = new FuelDecimal(totals.totalDistance);
    const averageConsumption = distance.gt(0)
      ? new FuelDecimal(intervalLiters).times(100).div(distance)
      : null;
    return {
      items: items.map(formatRecord), total: totals.recordCount, page, pageSize,
      summary: {
        ...totals,
        averageConsumption: averageConsumption?.toFixed(6) ?? null,
        exactAverageConsumption: averageConsumption?.toFixed() ?? null,
      },
    };
  });
}

export async function exportRecords(query: unknown): Promise<FuelRecordExportRow[]> {
  const where = recordWhere(parse(recordFilters, query));
  return readFuel(async (db) => db.select(exportSelection).from(fuelRecords)
    .innerJoin(vehicles, eq(fuelRecords.vehicleId, vehicles.id))
    .innerJoin(drivers, eq(fuelRecords.driverId, drivers.id))
    .where(where).orderBy(...recordOrder));
}

export async function recordDetail(id: string): Promise<FuelRecordDetail> {
  return readFuel(async (db) => {
    const record = await findRecord(db, id);
    const changes = await db.select({
      id: fuelChanges.id,
      changedBy: fuelChanges.changedBy,
      changedAt: fuelChanges.changedAt,
      reason: fuelChanges.reason,
      changes: fuelChanges.changes,
    }).from(fuelChanges).where(eq(fuelChanges.recordId, id))
      .orderBy(desc(fuelChanges.changedAt), desc(fuelChanges.id));
    return {
      record: formatRecord(record),
      changes: changes.map((change) => ({ ...change, changedAt: change.changedAt.toISOString() })),
    };
  });
}

export function fuelActorFields(actor: FuelActor) {
  return { createdById: actor.id, createdBy: actor.name, updatedById: actor.id, updatedBy: actor.name };
}

async function getAssignments(db: FuelTx, input: RecordInput, previousDriverId?: string) {
  const [vehicle] = await db.select({ plate: vehicles.plate }).from(vehicles)
    .where(eq(vehicles.id, input.vehicleId)).limit(1);
  if (!vehicle) throw new ApiError(400, "所选车辆不存在");

  const [driver] = await db.select({ name: drivers.name, isActive: drivers.isActive }).from(drivers)
    .where(eq(drivers.id, input.driverId)).limit(1);
  if (!driver || (!driver.isActive && input.driverId !== previousDriverId)) {
    throw new ApiError(400, "请选择在用司机");
  }
  return { vehicle, driver };
}

export async function createRecord(input: RecordInput, actor: FuelActor) {
  const settings = await getSystemSettings();
  validateRefuelDate(input.date, todayInBusinessZone(settings.timeZone));
  return writeFuel(async (tx) => {
    await getAssignments(tx, input);
    const [record] = await tx.insert(fuelRecords).values({
      ...input,
      ...manualAmounts(input.liters, input.unitPrice, input.odometer),
      ...fuelActorFields(actor),
      source: "manual",
    }).returning({ id: fuelRecords.id });
    await recalculateVehicles(tx, [input.vehicleId], settings);
    return formatRecord(await findRecord(tx, record.id));
  });
}

export async function updateRecord(id: string, input: RecordInput & { reason: string }, actor: FuelActor) {
  const { reason, ...fields } = input;
  const settings = await getSystemSettings();
  validateRefuelDate(fields.date, todayInBusinessZone(settings.timeZone));
  return writeFuel(async (tx) => {
    const previous = await findRecord(tx, id);
    const { vehicle, driver } = await getAssignments(tx, fields, previous.driverId);
    const next = manualAmounts(fields.liters, fields.unitPrice, fields.odometer);
    const samePricing = next.liters === previous.liters && next.unitPrice === previous.unitPrice;
    const amount = samePricing ? previous.amount : next.amount;
    const source = samePricing ? previous.source : "manual";
    const changes: FuelFieldChange[] = [];

    function changed(field: string, before: string, after: string) {
      if (before !== after) changes.push({ field, before, after });
    }

    changed("date", previous.date, fields.date);
    if (previous.vehicleId !== fields.vehicleId) {
      changes.push({
        field: "vehicleId", before: previous.plate, after: vehicle.plate,
        beforeId: previous.vehicleId, afterId: fields.vehicleId,
      });
    }
    if (previous.driverId !== fields.driverId) {
      changes.push({
        field: "driverId", before: previous.driverName, after: driver.name,
        beforeId: previous.driverId, afterId: fields.driverId,
      });
    }
    changed("fuelType", previous.fuelType, fields.fuelType);
    changed("liters", previous.liters, next.liters);
    changed("unitPrice", previous.unitPrice, next.unitPrice);
    changed("amount", previous.amount, amount);
    changed("odometer", previous.odometer, next.odometer);
    changed("notes", previous.notes, fields.notes);
    changed("source", previous.source, source);
    if (!changes.length) return formatRecord(previous);

    const now = new Date();
    await tx.update(fuelRecords).set({
      ...fields,
      ...next,
      amount,
      source,
      updatedAt: now,
      updatedBy: actor.name,
      updatedById: actor.id,
    }).where(eq(fuelRecords.id, id));
    await tx.insert(fuelChanges).values({
      recordId: id,
      changedById: actor.id,
      changedBy: actor.name,
      changedAt: now,
      reason,
      changes,
    });

    await recalculateVehicles(tx, [...new Set([previous.vehicleId, fields.vehicleId])], settings);
    return formatRecord(await findRecord(tx, id));
  });
}

function deletionCutoff(timeZone: string) {
  return sql<Date>`((current_timestamp at time zone ${timeZone}) - interval '12 months') at time zone ${timeZone}`;
}

export async function deleteRecord(id: string, reason: string, actor: FuelActor) {
  const settings = await getSystemSettings();
  return writeFuel(async (tx) => {
    const row = await findRecord(tx, id);
    const [metadata] = await tx.select({
      sequence: fuelRecords.sequence,
      createdById: fuelRecords.createdById,
      updatedById: fuelRecords.updatedById,
    }).from(fuelRecords).where(eq(fuelRecords.id, id)).limit(1);
    await tx.insert(fuelDeletions).values({
      recordId: id,
      plate: row.plate,
      deletedById: actor.id,
      deletedBy: actor.name,
      reason,
      snapshot: { ...formatRecord(row), ...metadata },
    });
    await tx.delete(fuelRecords).where(eq(fuelRecords.id, id));
    await tx.delete(fuelDeletions).where(lt(fuelDeletions.deletedAt, deletionCutoff(settings.timeZone)));
    await recalculateVehicles(tx, [row.vehicleId], settings);
    return { id };
  });
}

export async function listDeletions(query: unknown): Promise<FuelPage<FuelDeletion>> {
  const { page, pageSize } = parse(pageSchema, query);
  const { timeZone } = await getSystemSettings();
  const cutoff = deletionCutoff(timeZone);
  const db = await getDb();
  await db.delete(fuelDeletions).where(lt(fuelDeletions.deletedAt, cutoff));
  return readFuel(async (db) => {
    const where = gte(fuelDeletions.deletedAt, cutoff);
    const [summary] = await db.select({ total: count() }).from(fuelDeletions).where(where);
    const rows = await db.select({
      id: fuelDeletions.id,
      recordId: fuelDeletions.recordId,
      plate: fuelDeletions.plate,
      deletedBy: fuelDeletions.deletedBy,
      reason: fuelDeletions.reason,
      snapshot: fuelDeletions.snapshot,
      deletedAt: fuelDeletions.deletedAt,
    }).from(fuelDeletions).where(where).orderBy(desc(fuelDeletions.deletedAt), desc(fuelDeletions.id))
      .limit(pageSize).offset((page - 1) * pageSize);
    const items = rows.map((row) => ({
      ...row,
      deletedAt: row.deletedAt.toISOString(),
      snapshot: { ...row.snapshot, anomalyAssessment: row.snapshot.anomalyAssessment ?? null },
    }));
    return { items, total: summary.total, page, pageSize };
  });
}

export async function recentRecords(vehicleId: string, query: unknown) {
  const { through, excludeId } = parse(z.object({ through: dateFilter, excludeId: idFilter }), query);
  const { timeZone } = await getSystemSettings();
  const today = todayInBusinessZone(timeZone);
  if (through) validateRefuelDate(through, today);
  return readFuel(async (db) => {
    const [vehicle] = await db.select({ id: vehicles.id }).from(vehicles).where(eq(vehicles.id, vehicleId)).limit(1);
    if (!vehicle) throw new ApiError(404, "车辆不存在");

    let before = lte(fuelRecords.date, through ?? today);
    if (excludeId) {
      const [target] = await db.select({ sequence: fuelRecords.sequence, date: fuelRecords.date })
        .from(fuelRecords).where(eq(fuelRecords.id, excludeId)).limit(1);
      if (!target) throw new ApiError(404, "加油记录不存在");
      const date = through ?? target.date;
      before = sql`(${fuelRecords.date}, ${fuelRecords.sequence}) < (${date}::date, ${target.sequence}::bigint)
        and ${fuelRecords.id} <> ${excludeId}::uuid`;
    }

    const rows = await selectRecords(db).where(and(eq(fuelRecords.vehicleId, vehicleId), before))
      .orderBy(...recordOrder).limit(3);
    const items = rows.map(formatRecord);
    return { items, latest: items[0] ?? null };
  });
}
