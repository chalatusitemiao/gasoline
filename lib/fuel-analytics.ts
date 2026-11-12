import type { FuelAnomaly } from "./fuel";

export type AnalyticsView = "dashboard" | "vehicles" | "drivers" | "costs";

type NumericFuelMetrics = {
  count: number;
  liters: number;
  amount: number;
  distance: number;
  anomalies: number;
  consumption: number | null;
  amountPerKm: number | null;
  averagePrice: number | null;
};

export type FuelMetricKey = keyof NumericFuelMetrics;

export type FuelMetrics = NumericFuelMetrics & {
  exactTotals?: {
    liters: string;
    amount: string;
    distance: string;
    intervalLiters: string;
  };
};

export type MonthMetrics = FuelMetrics & { month: string };

export type VehicleMetrics = FuelMetrics & {
  vehicleId: string;
  plate: string;
  months: MonthMetrics[];
};

export type DriverMetrics = FuelMetrics & {
  driverId: string;
  name: string;
  usualVehicles: string[];
};

export type RecentAnomaly = {
  id: string;
  date: string;
  plate: string;
  driverId: string;
  driver: string;
  odometer: string;
  distance: string | null;
  consumption: string | null;
  reason: FuelAnomaly | null;
};

export type FuelAnalytics = {
  from: string;
  to: string;
  currentMonth: string;
  total: FuelMetrics;
  months: MonthMetrics[];
  vehicles: VehicleMetrics[];
  drivers: DriverMetrics[];
  recentAnomalies: RecentAnomaly[];
};

export function shiftMonth(month: string, offset: number) {
  const [year, monthNumber] = month.split("-").map(Number);
  const monthIndex = year * 12 + monthNumber - 1 + offset;
  return `${Math.floor(monthIndex / 12).toString().padStart(4, "0")}-${(monthIndex % 12 + 1).toString().padStart(2, "0")}`;
}

export function monthsInRange(from: string, to: string) {
  const months: string[] = [];
  let month = from;
  while (month <= to) {
    months.push(month);
    if (month === to) break;
    month = shiftMonth(month, 1);
  }
  return months;
}

