import type { Metadata } from "next";
import { MonthlyReport } from "@/components/reports/monthly-report";
import { requirePageSession } from "@/lib/auth";
import { monthInBusinessZone } from "@/lib/fuel-calendar";
import { getCompanyBusinessSettings } from "@/lib/company-settings";

export const metadata: Metadata = { title: "加油成本表" };

export default async function CostsPage() {
  const session = await requirePageSession("reports:view");
  const { timeZone } = await getCompanyBusinessSettings(session.user.companyId!);
  return <MonthlyReport view="costs" initialMonth={monthInBusinessZone(timeZone)} />;
}
