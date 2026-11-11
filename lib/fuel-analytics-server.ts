import "server-only";

import Decimal from "decimal.js";
import { and, desc, eq, gte, gt, lt, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { drivers, fuelRecords, vehicles } from "@/lib/db/fuel-schema";
import {
  shiftMonth,
  type AnalyticsView,
  type FuelAnalytics,
  type FuelMetrics,
  type VehicleMetrics,
} from "@/lib/fuel-analytics";

const monthKey = sql<string>`to_char(${fuelRecords.date}, 'YYYY-MM')`;
const hasInterval = gt(fuelRecords.distance, "0");
const rawMetrics = {
  count: sql<number>`count(*)::integer`,
  liters: sql<string>`coalesce(sum(${fuelRecords.liters}), 0)`,
  amount: sql<string>`coalesce(sum(${fuelRecords.amount}), 0)`,
  distance: sql<string>`coalesce(sum(${fuelRecords.distance}) filter (where ${hasInterval}), 0)`,
  intervalLiters: sql<string>`coalesce(sum(${fuelRecords.liters}) filter (where ${hasInterval}), 0)`,
  anomalies: sql<number>`(count(*) filter (where ${fuelRecords.isAnomaly}))::integer`,
};

type RawMetrics = {
  count: number;
  liters: string;
  amount: string;
  distance: string;
  intervalLiters: string;
  anomalies: number;
};

function summarize(rows: readonly RawMetrics[]): FuelMetrics {
  let count = 0;
  let anomalies = 0;
  let liters = new Decimal(0);
  let amount = new Decimal(0);
  let distance = new Decimal(0);
  let intervalLiters = new Decimal(0);

  for (const row of rows) {
    count += row.count;
    anomalies += row.anomalies;
    liters = liters.plus(row.liters);
    amount = amount.plus(row.amount);
    distance = distance.plus(row.distance);
    intervalLiters = intervalLiters.plus(row.intervalLiters);
  }

  return {
    count,
    anomalies,
    liters: liters.toNumber(),
    amount: amount.toNumber(),
    distance: distance.toNumber(),
    consumption: distance.isZero() ? null : intervalLiters.times(100).div(distance).toNumber(),
    amountPerKm: distance.isZero() ? null : amount.div(distance).toNumber(),
    averagePrice: liters.isZero() ? null : amount.div(liters).toNumber(),
  };
}

function groupBy<T>(rows: readonly T[], key: (row: T) => string) {
  const groups = new Map<string, T[]>();

  for (const row of rows) {
    const value = key(row);
    const group = groups.get(value);
    if (group) group.push(row);
    else groups.set(value, [row]);
  }
  return groups;
}

export async function getFuelAnalytics(
  view: AnalyticsView,
  from: string,
  to: string,
  currentMonth: string,
): Promise<FuelAnalytics> {
  const dateRange = (first: string, last: string) =>
    and(gte(fuelRecords.date, `${first}-01`), lt(fuelRecords.date, `${shiftMonth(last, 1)}-01`));
  const isDashboard = view === "dashboard";
  const rankingFrom = isDashboard ? currentMonth : from;

  const db = await getDb();
  return db.transaction(async (tx) => {
    const vehicleMonthRows = await tx
      .select({ vehicleId: vehicles.id, plate: vehicles.plate, month: monthKey, ...rawMetrics })
      .from(fuelRecords)
      .innerJoin(vehicles, eq(vehicles.id, fuelRecords.vehicleId))
      .where(dateRange(from, to))
      .groupBy(vehicles.id, vehicles.plate, monthKey)
      .orderBy(vehicles.plate, monthKey);

    const driverVehicleRows = isDashboard || view === "drivers"
      ? await tx
        .select({ driverId: drivers.id, name: drivers.name, plate: vehicles.plate, ...rawMetrics })
        .from(fuelRecords)
        .innerJoin(drivers, eq(drivers.id, fuelRecords.driverId))
        .innerJoin(vehicles, eq(vehicles.id, fuelRecords.vehicleId))
        .where(dateRange(rankingFrom, to))
        .groupBy(drivers.id, drivers.name, vehicles.id, vehicles.plate)
      : [];

    const rankingRows = isDashboard
      ? vehicleMonthRows.filter((row) => row.month === currentMonth)
      : vehicleMonthRows;
    const vehicleGroups = groupBy(rankingRows, (row) => row.vehicleId);
    const activeVehicles = view === "drivers" ? [] : Array.from(vehicleGroups, ([vehicleId, rows]): VehicleMetrics => ({
      vehicleId,
      plate: rows[0].plate,
      ...summarize(rows),
      months: view === "vehicles"
        ? rows.map((row) => ({ month: row.month, ...summarize([row]) }))
        : [],
    }));

    if (view === "vehicles") {
      const roster = await tx.select({ id: vehicles.id, plate: vehicles.plate }).from(vehicles);
      for (const vehicle of roster) {
        if (vehicleGroups.has(vehicle.id)) continue;
        activeVehicles.push({
          vehicleId: vehicle.id,
          plate: vehicle.plate,
          ...summarize([]),
          months: [],
        });
      }
    }

    const recentAnomalies = isDashboard
      ? await tx
        .select({
          id: fuelRecords.id,
          date: fuelRecords.date,
          plate: vehicles.plate,
          driver: drivers.name,
          odometer: fuelRecords.odometer,
          distance: fuelRecords.distance,
          consumption: fuelRecords.consumption,
          reason: fuelRecords.anomalyReason,
        })
        .from(fuelRecords)
        .innerJoin(vehicles, eq(vehicles.id, fuelRecords.vehicleId))
        .innerJoin(drivers, eq(drivers.id, fuelRecords.driverId))
        .where(eq(fuelRecords.isAnomaly, true))
        .orderBy(desc(fuelRecords.date), desc(fuelRecords.sequence))
        .limit(8)
      : [];

    return {
      from,
      to,
      currentMonth,
      total: summarize(vehicleMonthRows),
      months: Array.from(groupBy(vehicleMonthRows, (row) => row.month), ([month, rows]) => ({
        month,
        ...summarize(rows),
      })).sort((first, second) => first.month.localeCompare(second.month)),
      vehicles: activeVehicles,
      drivers: Array.from(groupBy(driverVehicleRows, (row) => row.driverId), ([driverId, rows]) => ({
        driverId,
        name: rows[0].name,
        ...summarize(rows),
        usualVehicles: [...rows]
          .sort((first, second) => second.count - first.count || first.plate.localeCompare(second.plate))
          .slice(0, 3)
          .map((row) => row.plate),
      })),
      recentAnomalies,
    };
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}
