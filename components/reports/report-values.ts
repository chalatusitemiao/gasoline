import type { DriverMetrics, FuelAnalytics, VehicleMetrics } from "@/lib/fuel-analytics";

export type RankedDriver = DriverMetrics & { rank: number | null; deviation: number | null };

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
