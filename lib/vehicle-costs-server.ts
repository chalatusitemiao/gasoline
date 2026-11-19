import "server-only";

import Decimal from "decimal.js";
import { and, asc, count, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { requireCompanyId } from "@/lib/company-context";
import { fleetProjects, vehicles } from "@/lib/db/fuel-schema";
import { partRecords } from "@/lib/db/parts-schema";
import { monthsInRange, shiftMonth } from "@/lib/fuel-analytics";
import { readFuel } from "@/lib/fuel-server/shared";
import { PART_PROJECT_UNASSIGNED, partMonthSchema } from "@/lib/parts";
import { ApiError } from "@/lib/server-api";
import type { PartCostReport, VehicleCostReportData } from "@/lib/vehicle-costs";

const CostDecimal = Decimal.clone({ precision: 40 });
const projectFilter = z.union([z.uuid(), z.literal(PART_PROJECT_UNASSIGNED)]);

export const partCostQuery = z.discriminatedUnion("scope", [
  z.object({ scope: z.literal("vehicle"), vehicleId: z.uuid() }),
  z.object({ scope: z.literal("project"), projectId: projectFilter, month: partMonthSchema.optional() }),
]);

export const vehicleCostQuery = z.object({
  vehicleId: z.uuid().optional(),
  projectId: projectFilter.optional(),
});

export async function getPartCosts(query: z.output<typeof partCostQuery>, currentMonth: string): Promise<PartCostReport> {
  const companyId = await requireCompanyId();
  return readFuel(async (db) => {
    const recordMonth = sql<string>`to_char(${partRecords.date}, 'YYYY-MM')`;
    const amount = sql<string>`sum(${partRecords.amount})::text`;
    const active = and(eq(partRecords.companyId, companyId), isNull(partRecords.deletedAt));

    if (query.scope === "vehicle") {
      const [vehicle] = await db.select({ id: vehicles.id }).from(vehicles)
        .where(and(eq(vehicles.id, query.vehicleId), eq(vehicles.companyId, companyId))).limit(1);
      if (!vehicle) throw new ApiError(404, "车辆不存在");

      const rows = await db.select({ month: recordMonth, amount }).from(partRecords)
        .where(and(active, eq(partRecords.vehicleId, vehicle.id))).groupBy(recordMonth);
      const monthly = new Map(rows.map((row) => [row.month, row.amount]));
      const totalAmount = rows.reduce((total, row) => total.plus(row.amount), new CostDecimal(0)).toFixed(2);
      return {
        scope: "vehicle", vehicleId: vehicle.id, month: currentMonth, totalAmount,
        monthAmount: monthly.get(currentMonth) ?? "0.00",
        months: monthsInRange(shiftMonth(currentMonth, -11), currentMonth)
          .map((month) => ({ month, amount: monthly.get(month) ?? "0.00" })),
      };
    }

    const { projectId, month = currentMonth } = query;
    if (projectId !== PART_PROJECT_UNASSIGNED) {
      const [project] = await db.select({ id: fleetProjects.id }).from(fleetProjects)
        .where(and(eq(fleetProjects.id, projectId), eq(fleetProjects.companyId, companyId))).limit(1);
      if (!project) throw new ApiError(404, "项目不存在");
    }

    const rows = await db.select({
      vehicleId: vehicles.id, plate: vehicles.plate, amount, count: count(),
    }).from(partRecords).innerJoin(vehicles, and(eq(vehicles.id, partRecords.vehicleId), eq(vehicles.companyId, companyId)))
      .where(and(active,
        projectId === PART_PROJECT_UNASSIGNED ? isNull(partRecords.projectId) : eq(partRecords.projectId, projectId),
        sql`${partRecords.date} >= ${month + "-01"}::date AND ${partRecords.date} < ${month + "-01"}::date + interval '1 month'`,
      )).groupBy(vehicles.id, vehicles.plate, vehicles.plateKey)
      .orderBy(sql`sum(${partRecords.amount}) desc`, asc(vehicles.plateKey));

    return {
      scope: "project", projectId, month, vehicles: rows,
      totalAmount: rows.reduce((total, row) => total.plus(row.amount), new CostDecimal(0)).toFixed(2),
    };
  });
}

export async function getVehicleCosts(query: z.output<typeof vehicleCostQuery>): Promise<VehicleCostReportData> {
  const companyId = await requireCompanyId();
  return readFuel(async (db) => {
    const rows = await db.select({
      id: vehicles.id, plate: vehicles.plate, projectName: fleetProjects.name,
      purchaseDate: vehicles.purchaseDate, purchasePrice: vehicles.purchasePrice,
      partsAmount: sql<string>`coalesce(sum(${partRecords.amount}), 0)::text`,
    }).from(vehicles)
      .leftJoin(fleetProjects, and(eq(fleetProjects.id, vehicles.projectId), eq(fleetProjects.companyId, companyId)))
      .leftJoin(partRecords, and(eq(partRecords.vehicleId, vehicles.id),
        eq(partRecords.companyId, companyId), isNull(partRecords.deletedAt)))
      .where(and(eq(vehicles.companyId, companyId),
        query.vehicleId ? eq(vehicles.id, query.vehicleId) : undefined,
        query.projectId === PART_PROJECT_UNASSIGNED ? isNull(vehicles.projectId)
          : query.projectId ? eq(vehicles.projectId, query.projectId) : undefined,
      )).groupBy(vehicles.id, vehicles.plate, vehicles.plateKey, vehicles.purchaseDate, vehicles.purchasePrice, fleetProjects.name)
      .orderBy(asc(vehicles.plateKey));

    let totalPurchasePrice = new CostDecimal(0);
    let totalPartsAmount = new CostDecimal(0);
    let missingPurchasePriceCount = 0;
    const items = rows.map((row) => {
      const purchase = new CostDecimal(row.purchasePrice ?? 0);
      const parts = new CostDecimal(row.partsAmount);
      totalPurchasePrice = totalPurchasePrice.plus(purchase);
      totalPartsAmount = totalPartsAmount.plus(parts);
      if (row.purchasePrice === null) missingPurchasePriceCount++;
      return { ...row, partsAmount: parts.toFixed(2), knownAmount: purchase.plus(parts).toFixed(2) };
    });

    return {
      items, missingPurchasePriceCount,
      totalPurchasePrice: totalPurchasePrice.toFixed(2),
      totalPartsAmount: totalPartsAmount.toFixed(2),
      totalKnownAmount: totalPurchasePrice.plus(totalPartsAmount).toFixed(2),
    };
  });
}
