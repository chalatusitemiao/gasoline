import type { DriverMetrics, FuelAnalytics, FuelMetrics, MonthMetrics, VehicleMetrics } from "@/lib/fuel-analytics";

export type RankedDriver = DriverMetrics & { rank: number | null; deviation: number | null };

export function metricValue(metrics: FuelMetrics | undefined, key: keyof FuelMetrics) {
  if (metrics) return metrics[key];
  if (key === "consumption" || key === "amountPerKm" || key === "averagePrice") return null;
  return 0;
}

export function monthlyMetricTrend(values: readonly MonthMetrics[], months: readonly string[]) {
  const byMonth = new Map(values.map((row) => [row.month, row]));

  return (key: keyof FuelMetrics) => {
    if (months.length < 2 || byMonth.size === 0) return undefined;
    return months.map((month) => ({ month, value: metricValue(byMonth.get(month), key) }));
  };
}

export function rankDrivers(report: FuelAnalytics): RankedDriver[] {
  const fleet = report.total.consumption;
  return [...report.drivers]
    .sort((first, second) =>
      (first.consumption ?? Infinity) - (second.consumption ?? Infinity)
      || first.name.localeCompare(second.name, "zh-CN")
      || first.driverId.localeCompare(second.driverId),
    )
    .map((driver, index) => ({
      ...driver,
      rank: driver.consumption == null ? null : index + 1,
      deviation: driver.consumption == null || !fleet ? null : (driver.consumption / fleet - 1) * 100,
    }));
}

export function rankVehicles(report: FuelAnalytics) {
  return [...report.vehicles]
    .sort((first, second) => second.amount - first.amount || first.plate.localeCompare(second.plate))
    .map((vehicle) => ({
      ...vehicle,
      share: report.total.amount > 0 ? vehicle.amount / report.total.amount * 100 : null,
    }));
}

export function vehicleMonthIndex(vehicles: VehicleMetrics[]) {
  return new Map(vehicles.map((vehicle) => [
    vehicle.vehicleId,
    new Map(vehicle.months.map((month) => [month.month, month])),
  ]));
}
