import type { Metadata } from "next";
import { MonthlyReport } from "@/components/reports/monthly-report";
import { requirePageSession } from "@/lib/auth";
import { monthInBusinessZone } from "@/lib/fuel-calendar";
import { getSystemSettings } from "@/lib/system-settings";

export const metadata: Metadata = { title: "司机考核" };

export default async function DriverReportPage() {
  await requirePageSession();
  const { timeZone } = await getSystemSettings();
  return <MonthlyReport view="drivers" initialMonth={monthInBusinessZone(timeZone)} />;
}
