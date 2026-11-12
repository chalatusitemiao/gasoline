import Decimal from "decimal.js";
import type { DriverMetrics, FuelAnalytics, FuelMetricKey, FuelMetrics, MonthMetrics, VehicleMetrics } from "@/lib/fuel-analytics";

export type RankedDriver = DriverMetrics & { rank: number | null; deviation: number | null };

export const ReportDecimal = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export function roundReportValue(value: Decimal.Value | null | undefined, digits = 2) {
  if (value == null) return null;
  const decimal = new ReportDecimal(value);
  if (!decimal.isFinite()) return null;
  const rounded = decimal.toDecimalPlaces(digits).toNumber();
  return rounded === 0 ? 0 : rounded;
}

export function metricValue(metrics: FuelMetrics | undefined, key: FuelMetricKey) {
  if (metrics) return metrics[key];
  if (key === "consumption" || key === "amountPerKm" || key === "averagePrice") return null;
  return 0;
}

export function roundedMetricValue(metrics: FuelMetrics | undefined, key: FuelMetricKey) {
  const value = metricValue(metrics, key);
  const totals = metrics?.exactTotals;
  const digits = key === "liters" ? 3 : 2;
  if (value == null || !totals) return roundReportValue(value, digits);

  switch (key) {
    case "consumption":
      return roundReportValue(new ReportDecimal(totals.intervalLiters).times(100).div(totals.distance));
    case "amountPerKm":
      return roundReportValue(new ReportDecimal(totals.amount).div(totals.distance));
    case "averagePrice":
      return roundReportValue(new ReportDecimal(totals.amount).div(totals.liters));
    case "amount":
    case "liters":
    case "distance":
      return roundReportValue(totals[key], digits);
    default:
      return value;
  }
}

export function exceedsFleetConsumption(vehicle: FuelMetrics, fleet?: FuelMetrics) {
  if (vehicle.consumption == null || fleet?.consumption == null) return false;
  const vehicleTotals = vehicle.exactTotals;
  const fleetTotals = fleet.exactTotals;
  if (!vehicleTotals || !fleetTotals) {
    return new ReportDecimal(vehicle.consumption).gt(new ReportDecimal(fleet.consumption).times("1.2"));
  }

  return new ReportDecimal(vehicleTotals.intervalLiters).times(fleetTotals.distance)
    .gt(new ReportDecimal(fleetTotals.intervalLiters).times(vehicleTotals.distance).times("1.2"));
}

export function sharePercent(value: Decimal.Value, total: Decimal.Value) {
  const denominator = new ReportDecimal(total);
  return denominator.gt(0) ? roundReportValue(new ReportDecimal(value).times(100).div(denominator)) : null;
}

function driverDeviation(driver: DriverMetrics, fleet: FuelMetrics) {
  if (driver.consumption == null || !fleet.consumption) return null;
  const driverTotals = driver.exactTotals;
  const fleetTotals = fleet.exactTotals;
  const numerator = driverTotals && fleetTotals
    ? new ReportDecimal(driverTotals.intervalLiters).times(fleetTotals.distance)
    : new ReportDecimal(driver.consumption);
  const denominator = driverTotals && fleetTotals
    ? new ReportDecimal(fleetTotals.intervalLiters).times(driverTotals.distance)
    : new ReportDecimal(fleet.consumption);
  return roundReportValue(numerator.minus(denominator).times(100).div(denominator));
}

export function monthlyMetricTrend(values: readonly MonthMetrics[], months: readonly string[]) {
  const byMonth = new Map(values.map((row) => [row.month, row]));

  return (key: FuelMetricKey) => {
    if (months.length < 2 || byMonth.size === 0) return undefined;
    return months.map((month) => {
      const metrics = byMonth.get(month);
      return { month, value: metricValue(metrics, key), displayValue: roundedMetricValue(metrics, key) };
    });
  };
}

export function rankDrivers(report: FuelAnalytics): RankedDriver[] {
  return [...report.drivers]
    .sort((first, second) =>
      (first.consumption ?? Infinity) - (second.consumption ?? Infinity)
      || first.name.localeCompare(second.name, "zh-CN")
      || first.driverId.localeCompare(second.driverId),
    )
    .map((driver, index) => ({
      ...driver,
      rank: driver.consumption == null ? null : index + 1,
      deviation: driverDeviation(driver, report.total),
    }));
}

export function rankVehicles(report: FuelAnalytics) {
  return [...report.vehicles]
    .sort((first, second) => second.amount - first.amount || first.plate.localeCompare(second.plate))
    .map((vehicle) => ({
      ...vehicle,
      share: sharePercent(vehicle.exactTotals?.amount ?? vehicle.amount, report.total.exactTotals?.amount ?? report.total.amount),
    }));
}

export function vehicleMonthIndex(vehicles: VehicleMetrics[]) {
  return new Map(vehicles.map((vehicle) => [
    vehicle.vehicleId,
    new Map(vehicle.months.map((month) => [month.month, month])),
  ]));
}
