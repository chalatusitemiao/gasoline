import type { Metadata } from "next";
import { MonthlyReport } from "@/components/reports/monthly-report";
import { requirePageSession } from "@/lib/auth";
import { monthInBusinessZone } from "@/lib/fuel-calendar";
import { getSystemSettings } from "@/lib/system-settings";

export const metadata: Metadata = { title: "单车月报" };

export default async function VehicleReportPage() {
  await requirePageSession();
  const { timeZone } = await getSystemSettings();
  return <MonthlyReport view="vehicles" initialMonth={monthInBusinessZone(timeZone)} />;
}
