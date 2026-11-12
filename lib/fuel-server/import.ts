import "server-only";

import { inArray } from "drizzle-orm";
import { z } from "zod";
import { drivers, fuelRecords, vehicles } from "@/lib/db/fuel-schema";
import {
  FUEL_IMPORT_LIMIT, fuelAmountSchema, fuelDateSchema, fuelLitersSchema, fuelOdometerSchema, fuelTypeSchema,
  fuelUnitPriceSchema, plateKey, vehicleInputSchema,
} from "@/lib/fuel";
import { todayInBusinessZone } from "@/lib/fuel-calendar";
import { getSystemSettings } from "@/lib/system-settings";
import { FuelDecimal, recalculateVehicles } from "./calculations";
import { displayPlate, driverNameKey } from "./catalog";
import { fuelActorFields } from "./records";
import { writeFuel, type FuelActor } from "./shared";

export const fuelImportSchema = z.object({
  rows: z.array(z.unknown()).min(1, "导入文件没有数据行").max(FUEL_IMPORT_LIMIT),
  fuelType: fuelTypeSchema.default("diesel"),
  date1904: z.boolean().default(false),
});

const rawRow = z.object({
  rowNumber: z.number().int().positive(),
  plate: z.string().max(40),
  date: z.string().max(40),
  liters: z.string().max(40),
  amount: z.string().max(40),
  odometer: z.string().max(40),
  driver: z.string().trim().min(1).max(80).refine((value) => !value.includes("\u0000")),
});

function excelDate(value: string, date1904: boolean) {
  const text = value.trim().normalize("NFKC");
  if (/^\d{8}$/.test(text)) return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6)}`;
  const parts = /^(\d{4})(?:[-/.]|年)(\d{1,2})(?:[-/.]|月)(\d{1,2})日?$/.exec(text);
  if (parts) return `${parts[1]}-${parts[2].padStart(2, "0")}-${parts[3].padStart(2, "0")}`;

  const serial = /^(\d{1,7})(?:\.\d+)?$/.exec(text);
  if (!serial) return text;
  // The fractional part is a time of day. Take the integer digits without rounding up.
  const day = Number(serial[1]);
  if (date1904 ? day > 2_957_003 : day === 0 || day === 60 || day > 2_958_465) return text;
  const epoch = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, day < 60 ? 31 : 30);
  return new Date(epoch + day * 86_400_000).toISOString().slice(0, 10);
}

function numberText(value: string) {
  const text = value.trim().normalize("NFKC");
  return /^\d{1,3}(,\d{3})+(\.\d+)?$/.test(text) ? text.replaceAll(",", "") : text;
}

type ImportIssue = { rowNumber: number; message: string };
type ParsedRow = {
  rowNumber: number;
  plate: string;
  plateKey: string;
  driver: string;
  driverKey: string;
  date: string;
  liters: string;
  amount: string;
  unitPrice: string;
  odometer: string;
};

function parseRow(value: unknown, rowNumber: number, today: string, date1904: boolean): ParsedRow | ImportIssue {
  const raw = rawRow.safeParse(value);
  if (!raw.success) {
    const originalRow = rawRow.pick({ rowNumber: true }).safeParse(value);
    const fields: Record<string, string> = {
      rowNumber: "行号", plate: "车牌", date: "日期", liters: "油量",
      amount: "金额", odometer: "里程", driver: "司机",
    };
    const field = fields[String(raw.error.issues[0]?.path[0])] ?? "行数据";
    return {
      rowNumber: originalRow.success ? originalRow.data.rowNumber : rowNumber,
      message: `${field}为空或格式不正确`,
    };
  }

  const row = raw.data;
  const plate = vehicleInputSchema.shape.plate.safeParse(row.plate);
  if (!plate.success) return { rowNumber: row.rowNumber, message: "车牌格式不正确" };

  const date = fuelDateSchema.safeParse(excelDate(row.date, date1904));
  if (!date.success || date.data > today) return { rowNumber: row.rowNumber, message: "加油日期无效或晚于今天" };

  const liters = fuelLitersSchema.safeParse(numberText(row.liters));
  const amount = fuelAmountSchema.safeParse(numberText(row.amount));
  const odometer = fuelOdometerSchema.safeParse(numberText(row.odometer));
  if (!liters.success) return { rowNumber: row.rowNumber, message: "油量须大于 0，最多 7 位整数、3 位小数" };
  if (!amount.success) return { rowNumber: row.rowNumber, message: "金额须大于 0，最多 16 位整数、2 位小数" };
  if (!odometer.success) return { rowNumber: row.rowNumber, message: "里程须大于 0，最多 10 位整数、2 位小数" };

  const volume = new FuelDecimal(liters.data);
  const paid = new FuelDecimal(amount.data);
  const unitPrice = paid.div(volume).toFixed(6);
  if (!fuelUnitPriceSchema.safeParse(unitPrice).success) {
    return { rowNumber: row.rowNumber, message: "按金额和油量反算的单价超出可录入范围" };
  }
  return {
    rowNumber: row.rowNumber,
    plate: displayPlate(plate.data),
    plateKey: plateKey(plate.data),
    driver: row.driver,
    driverKey: driverNameKey(row.driver),
    date: date.data,
    liters: volume.toFixed(3),
    amount: paid.toFixed(2),
    unitPrice,
    odometer: new FuelDecimal(odometer.data).toFixed(2),
  };
}

export async function importFuel(input: z.output<typeof fuelImportSchema>, actor: FuelActor) {
  const settings = await getSystemSettings();
  const today = todayInBusinessZone(settings.timeZone);
  const issues: ImportIssue[] = [];
  const valid: ParsedRow[] = [];
  input.rows.forEach((value, index) => {
    const parsed = parseRow(value, index + 2, today, input.date1904);
    if ("message" in parsed) issues.push(parsed);
    else valid.push(parsed);
  });
  if (!valid.length) return { imported: 0, issues };

  return writeFuel(async (tx) => {
    const nameKeys = [...new Set(valid.map((row) => row.driverKey))];
    const existingDrivers = await tx.select({ id: drivers.id, nameKey: drivers.nameKey })
      .from(drivers).where(inArray(drivers.nameKey, nameKeys));
    const driverIds = new Map<string, string | null>();
    for (const driver of existingDrivers) {
      driverIds.set(driver.nameKey, driverIds.has(driver.nameKey) ? null : driver.id);
    }

    const rows = valid.filter((row) => {
      if (driverIds.get(row.driverKey) !== null) return true;
      issues.push({ rowNumber: row.rowNumber, message: "存在同名司机，无法确认对应档案" });
      return false;
    });
    if (!rows.length) return { imported: 0, issues: issues.sort((a, b) => a.rowNumber - b.rowNumber) };

    const plateKeys = [...new Set(rows.map((row) => row.plateKey))];
    const vehicleFields = { id: vehicles.id, key: vehicles.plateKey, fuelType: vehicles.fuelType };
    const existingVehicles = await tx.select(vehicleFields).from(vehicles).where(inArray(vehicles.plateKey, plateKeys));
    const vehicleMap = new Map(existingVehicles.map((vehicle) => [vehicle.key, vehicle]));
    const newVehicles = new Map<string, typeof vehicles.$inferInsert>();
    const newDrivers = new Map<string, typeof drivers.$inferInsert>();
    for (const row of rows) {
      if (!vehicleMap.has(row.plateKey) && !newVehicles.has(row.plateKey)) {
        newVehicles.set(row.plateKey, { plate: row.plate, plateKey: row.plateKey, fuelType: input.fuelType });
      }
      if (!driverIds.has(row.driverKey) && !newDrivers.has(row.driverKey)) {
        newDrivers.set(row.driverKey, { name: row.driver, nameKey: row.driverKey });
      }
    }

    if (newVehicles.size) {
      const created = await tx.insert(vehicles).values([...newVehicles.values()]).returning(vehicleFields);
      for (const vehicle of created) vehicleMap.set(vehicle.key, vehicle);
    }
    if (newDrivers.size) {
      const created = await tx.insert(drivers).values([...newDrivers.values()])
        .returning({ id: drivers.id, nameKey: drivers.nameKey });
      for (const driver of created) driverIds.set(driver.nameKey, driver.id);
    }

    const affected = new Set<string>();
    const inserts = rows.map((row): typeof fuelRecords.$inferInsert => {
      const vehicle = vehicleMap.get(row.plateKey);
      const driverId = driverIds.get(row.driverKey);
      if (!vehicle || !driverId) throw new Error("导入关联档案写入失败");
      affected.add(vehicle.id);
      return {
        vehicleId: vehicle.id,
        driverId,
        fuelType: vehicle.fuelType,
        date: row.date,
        liters: row.liters,
        unitPrice: row.unitPrice,
        amount: row.amount,
        odometer: row.odometer,
        ...fuelActorFields(actor),
        source: "import",
      };
    });
    await tx.insert(fuelRecords).values(inserts);
    await recalculateVehicles(tx, [...affected], settings);

    return { imported: inserts.length, issues: issues.sort((a, b) => a.rowNumber - b.rowNumber) };
  });
}
