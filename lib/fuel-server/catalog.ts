import "server-only";

import { and, asc, count, eq, getTableName, ilike, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import { requireCompanyId } from "@/lib/company-context";
import { getDb } from "@/lib/db";
import { drivers, fuelRecords, vehicles } from "@/lib/db/fuel-schema";
import {
  driverInputSchema, FUEL_IMPORT_LIMIT, fuelTypeSchema, plateKey, vehicleInputSchema,
  type Driver, type FuelOptions, type FuelPage, type Vehicle,
} from "@/lib/fuel";
import { ApiError } from "@/lib/server-api";
import { keywordSchema, pageSchema, parse, readFuel, searchPattern, writeFuel } from "./shared";

export function driverNameKey(name: string) {
  return name.trim().normalize("NFKC").toLowerCase().replace(/\s+/g, " ");
}

export function displayPlate(plate: string) {
  return plate.trim().normalize("NFKC").toUpperCase();
}

function dates<T extends { createdAt: Date; updatedAt: Date }>(row: T) {
  return { ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}

const vehicleFields = {
  id: vehicles.id,
  plate: vehicles.plate,
  fuelType: vehicles.fuelType,
  notes: vehicles.notes,
  createdAt: vehicles.createdAt,
  updatedAt: vehicles.updatedAt,
};
const driverFields = {
  id: drivers.id,
  name: drivers.name,
  phone: drivers.phone,
  isActive: drivers.isActive,
  notes: drivers.notes,
  createdAt: drivers.createdAt,
  updatedAt: drivers.updatedAt,
};

const catalogFilter = pageSchema.extend({ keyword: keywordSchema });
const driverFilter = catalogFilter.extend({
  isActive: z.enum(["true", "false", "1", "0"]).optional(),
});
const vehicleFilter = catalogFilter.extend({
  fuelType: fuelTypeSchema.optional(),
});

// Drizzle unqualifies top-level selected columns in a single-table query.
// Preserve the outer references inside the correlated statistics subqueries.
const outerVehicleId = sql`${sql.identifier(getTableName(vehicles))}.${sql.identifier(vehicles.id.name)}`;
const outerDriverId = sql`${sql.identifier(getTableName(drivers))}.${sql.identifier(drivers.id.name)}`;

export async function listVehicles(query: unknown): Promise<FuelPage<Vehicle>> {
  const companyId = await requireCompanyId();
  const { keyword, fuelType, page, pageSize } = parse(vehicleFilter, query);
  const search = plateKey(keyword);
  const where = and(
    eq(vehicles.companyId, companyId),
    keyword ? or(
      search ? ilike(vehicles.plateKey, searchPattern(search)) : undefined,
      ilike(vehicles.notes, searchPattern(keyword)),
    ) : undefined,
    fuelType ? eq(vehicles.fuelType, fuelType) : undefined,
  );

  return readFuel(async (db) => {
    const [summary] = await db.select({ total: count() }).from(vehicles).where(where);
    const rows = await db.select({
      ...vehicleFields,
      refuelCount: sql<number>`(select count(*)::integer from ${fuelRecords}
        where ${fuelRecords.vehicleId} = ${outerVehicleId} and ${fuelRecords.companyId} = ${companyId})`,
      lastDate: sql<string | null>`(select ${fuelRecords.date}::text from ${fuelRecords}
        where ${fuelRecords.vehicleId} = ${outerVehicleId} and ${fuelRecords.companyId} = ${companyId}
        order by ${fuelRecords.date} desc, ${fuelRecords.sequence} desc limit 1)`,
      lastOdometer: sql<string | null>`(select ${fuelRecords.odometer}::text from ${fuelRecords}
        where ${fuelRecords.vehicleId} = ${outerVehicleId} and ${fuelRecords.companyId} = ${companyId}
        order by ${fuelRecords.date} desc, ${fuelRecords.sequence} desc limit 1)`,
    }).from(vehicles).where(where).orderBy(asc(vehicles.plateKey), asc(vehicles.id))
      .limit(pageSize).offset((page - 1) * pageSize);
    return { items: rows.map(dates), total: summary.total, page, pageSize };
  });
}

export async function listDrivers(query: unknown): Promise<FuelPage<Driver>> {
  const companyId = await requireCompanyId();
  const { keyword, isActive, page, pageSize } = parse(driverFilter, query);
  const pattern = searchPattern(keyword);
  const where = and(
    eq(drivers.companyId, companyId),
    keyword ? or(
      ilike(drivers.name, pattern),
      ilike(drivers.phone, pattern),
      ilike(drivers.notes, pattern),
      ilike(sql`${drivers.id}::text`, pattern),
    ) : undefined,
    isActive === undefined ? undefined : eq(drivers.isActive, isActive === "true" || isActive === "1"),
  );

  return readFuel(async (db) => {
    const [summary] = await db.select({ total: count() }).from(drivers).where(where);
    const rows = await db.select({
      ...driverFields,
      refuelCount: sql<number>`(select count(*)::integer from ${fuelRecords}
        where ${fuelRecords.driverId} = ${outerDriverId} and ${fuelRecords.companyId} = ${companyId})`,
    }).from(drivers).where(where).orderBy(asc(drivers.nameKey), asc(drivers.id))
      .limit(pageSize).offset((page - 1) * pageSize);
    return { items: rows.map(dates), total: summary.total, page, pageSize };
  });
}

export async function getFuelOptions(): Promise<FuelOptions> {
  const companyId = await requireCompanyId();
  return readFuel(async (db) => {
    const vehicleRows = await db.select(vehicleFields).from(vehicles)
      .where(eq(vehicles.companyId, companyId)).orderBy(asc(vehicles.plateKey));
    const driverRows = await db.select(driverFields).from(drivers)
      .where(eq(drivers.companyId, companyId)).orderBy(asc(drivers.nameKey), asc(drivers.id));
    return { vehicles: vehicleRows.map(dates), drivers: driverRows.map(dates) };
  });
}

export async function getVehicle(id: string): Promise<Vehicle> {
  const companyId = await requireCompanyId();
  const db = await getDb();
  const [row] = await db.select(vehicleFields).from(vehicles)
    .where(and(eq(vehicles.companyId, companyId), eq(vehicles.id, id))).limit(1);
  if (!row) throw new ApiError(404, "车辆不存在");
  return dates(row);
}

export async function getDriver(id: string): Promise<Driver> {
  const companyId = await requireCompanyId();
  const db = await getDb();
  const [row] = await db.select(driverFields).from(drivers)
    .where(and(eq(drivers.companyId, companyId), eq(drivers.id, id))).limit(1);
  if (!row) throw new ApiError(404, "司机不存在");
  return dates(row);
}

export async function saveVehicle(input: z.output<typeof vehicleInputSchema>, id?: string) {
  const companyId = await requireCompanyId();
  return writeFuel(async (db) => {
    if (id) {
      const [current] = await db.select({ id: vehicles.id }).from(vehicles)
        .where(and(eq(vehicles.companyId, companyId), eq(vehicles.id, id))).limit(1);
      if (!current) throw new ApiError(404, "车辆不存在");
    }
    const key = plateKey(input.plate);
    const [existing] = await db.select({ id: vehicles.id }).from(vehicles)
      .where(and(eq(vehicles.companyId, companyId), eq(vehicles.plateKey, key))).limit(1);
    if (existing && existing.id !== id) throw new ApiError(409, "该车牌已存在");

    const values = { ...input, companyId, plate: displayPlate(input.plate), plateKey: key };
    const [saved] = id
      ? await db.update(vehicles).set({ ...values, updatedAt: new Date() })
        .where(and(eq(vehicles.companyId, companyId), eq(vehicles.id, id))).returning(vehicleFields)
      : await db.insert(vehicles).values(values).returning(vehicleFields);
    if (!saved) throw new ApiError(404, "车辆不存在");
    return dates(saved);
  });
}

export async function saveDriver(input: z.output<typeof driverInputSchema>, id?: string) {
  const companyId = await requireCompanyId();
  return writeFuel(async (db) => {
    const nameKey = driverNameKey(input.name);
    const values = { ...input, companyId, nameKey };
    const [saved] = id
      ? await db.update(drivers).set({ ...values, updatedAt: new Date() })
        .where(and(eq(drivers.companyId, companyId), eq(drivers.id, id))).returning(driverFields)
      : await db.insert(drivers).values(values).returning(driverFields);
    if (!saved) throw new ApiError(404, "司机不存在");
    return dates(saved);
  });
}

export async function deleteVehicle(id: string) {
  const companyId = await requireCompanyId();
  return writeFuel(async (db) => {
    const [linked] = await db.select({ id: fuelRecords.id }).from(fuelRecords)
      .where(and(eq(fuelRecords.companyId, companyId), eq(fuelRecords.vehicleId, id))).limit(1);
    if (linked) throw new ApiError(409, "该车辆有关联加油记录，无法删除");
    const [removed] = await db.delete(vehicles)
      .where(and(eq(vehicles.companyId, companyId), eq(vehicles.id, id))).returning({ id: vehicles.id });
    if (!removed) throw new ApiError(404, "车辆不存在");
    return removed;
  });
}

export async function deleteDriver(id: string) {
  const companyId = await requireCompanyId();
  return writeFuel(async (db) => {
    const [linked] = await db.select({ id: fuelRecords.id }).from(fuelRecords)
      .where(and(eq(fuelRecords.companyId, companyId), eq(fuelRecords.driverId, id))).limit(1);
    if (linked) throw new ApiError(409, "该司机有关联加油记录，可停用");
    const [removed] = await db.delete(drivers)
      .where(and(eq(drivers.companyId, companyId), eq(drivers.id, id))).returning({ id: drivers.id });
    if (!removed) throw new ApiError(404, "司机不存在");
    return removed;
  });
}

export const vehicleImportSchema = z.object({
  plates: z.array(z.string()).min(1).max(FUEL_IMPORT_LIMIT),
  fuelType: fuelTypeSchema,
  notes: vehicleInputSchema.shape.notes,
});

export async function importVehicles(input: z.output<typeof vehicleImportSchema>) {
  const companyId = await requireCompanyId();
  return writeFuel(async (db) => {
    const rows = input.plates.map((plate) => ({
      raw: plate,
      parsed: vehicleInputSchema.safeParse({ plate, fuelType: input.fuelType, notes: input.notes }),
    }));
    const keys = [...new Set(rows.flatMap(({ parsed }) => parsed.success ? [plateKey(parsed.data.plate)] : []))];
    const current = keys.length
      ? await db.select({ key: vehicles.plateKey }).from(vehicles)
        .where(and(eq(vehicles.companyId, companyId), inArray(vehicles.plateKey, keys)))
      : [];
    const known = new Set(current.map(({ key }) => key));
    const added: string[] = [];
    const existing: string[] = [];
    const invalid: string[] = [];
    const inserts: (typeof vehicles.$inferInsert)[] = [];

    for (const { raw, parsed } of rows) {
      if (!parsed.success) {
        invalid.push(raw);
        continue;
      }
      const plate = displayPlate(parsed.data.plate);
      const key = plateKey(plate);
      if (known.has(key)) {
        existing.push(plate);
        continue;
      }
      known.add(key);
      added.push(plate);
      inserts.push({ ...parsed.data, companyId, plate, plateKey: key });
    }

    if (inserts.length) await db.insert(vehicles).values(inserts);
    return { added, existing, invalid };
  });
}
