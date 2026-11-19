import type { Metadata } from "next";
import { PartsCostReport } from "@/components/reports/parts-cost-report";
import { requirePageSession } from "@/lib/auth";
import { getCompanyBusinessSettings } from "@/lib/company-settings";
import { monthInBusinessZone } from "@/lib/fuel-calendar";

export const metadata: Metadata = { title: "配件成本" };

export default async function Page() {
  const session = await requirePageSession("reports:view");
  const { timeZone } = await getCompanyBusinessSettings(session.user.companyId!);
  return <PartsCostReport initialMonth={monthInBusinessZone(timeZone)} />;
}
