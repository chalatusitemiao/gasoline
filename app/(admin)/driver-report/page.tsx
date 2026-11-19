import type { Metadata } from "next";
import { MonthlyReport } from "@/components/reports/monthly-report";
import { requirePageSession } from "@/lib/auth";
import { monthInBusinessZone } from "@/lib/fuel-calendar";
import { getCompanyBusinessSettings } from "@/lib/company-settings";

export const metadata: Metadata = { title: "司机考核" };

export default async function DriverReportPage() {
  const session = await requirePageSession("reports:view");
  const { timeZone } = await getCompanyBusinessSettings(session.user.companyId!);
  return <MonthlyReport view="drivers" initialMonth={monthInBusinessZone(timeZone)} />;
}
