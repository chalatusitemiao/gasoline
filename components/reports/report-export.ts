import { monthsInRange, type AnalyticsView, type FuelAnalytics, type FuelMetrics } from "@/lib/fuel-analytics";
import { rankDrivers, rankVehicles, vehicleMonthIndex } from "./report-values";

type Cell = string | number | null;

function twoPlaces(value: number | null) {
  return value === null ? null : Number(value.toFixed(2));
}

function fuelCells(metrics?: FuelMetrics): Cell[] {
  if (!metrics || metrics.count === 0) return [null, null];
  return [metrics.liters, twoPlaces(metrics.consumption)];
}

export function reportRows(view: Exclude<AnalyticsView, "dashboard">, report: FuelAnalytics): Cell[][] {
  if (view === "vehicles") {
    const months = monthsInRange(report.from, report.to);
    const vehicles = [...report.vehicles].sort((first, second) => first.plate.localeCompare(second.plate));
    const vehicleMonths = vehicleMonthIndex(vehicles);
    const fleetMonths = new Map(report.months.map((value) => [value.month, value]));

    return [
      [
        "车牌号",
        ...months.flatMap((month) => [`${month} 油量（L）`, `${month} 油耗（L/100km）`]),
        "合计油量（L）",
        "合计油耗（L/100km）",
      ],
      ...vehicles.map((vehicle) => [
        vehicle.plate,
        ...months.flatMap((month) => fuelCells(vehicleMonths.get(vehicle.vehicleId)?.get(month))),
        ...fuelCells(vehicle),
      ]),
      [
        "合计",
        ...months.flatMap((month) => fuelCells(fleetMonths.get(month))),
        ...fuelCells(report.total),
      ],
    ];
  }

  if (view === "drivers") {
    return [
      ["排名", "司机", "加油次数", "总油量（L）", "总金额（元）", "总里程（km）", "油耗（L/100km）", "较均值（%）", "异常次数", "常用车辆"],
      ...rankDrivers(report).map((driver) => [
        driver.rank,
        driver.name,
        driver.count,
        driver.liters,
        driver.amount,
        driver.distance,
        twoPlaces(driver.consumption),
        twoPlaces(driver.deviation),
        driver.anomalies,
        driver.usualVehicles.join("、"),
      ]),
    ];
  }

  return [
    ["车牌号", "加油次数", "油量（L）", "金额（元）", "里程（km）", "油耗（L/100km）", "元/公里", "金额占比（%）"],
    ...rankVehicles(report).map((vehicle) => [
      vehicle.plate,
      vehicle.count,
      vehicle.liters,
      vehicle.amount,
      vehicle.distance,
      twoPlaces(vehicle.consumption),
      twoPlaces(vehicle.amountPerKm),
      twoPlaces(vehicle.share),
    ]),
    [
      "合计",
      report.total.count,
      report.total.liters,
      report.total.amount,
      report.total.distance,
      twoPlaces(report.total.consumption),
      twoPlaces(report.total.amountPerKm),
      report.total.amount > 0 ? 100 : null,
    ],
  ];
}
