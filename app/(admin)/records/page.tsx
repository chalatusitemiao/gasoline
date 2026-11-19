import type { Metadata } from "next";
import { requirePageSession } from "@/lib/auth";
import { todayInBusinessZone } from "@/lib/fuel-calendar";
import { getCompanyBusinessSettings } from "@/lib/company-settings";
import { RecordsTable } from "./records-table";

export const metadata: Metadata = { title: "加油记录" };

export default async function RecordsPage({
  searchParams,
}: {
  searchParams: Promise<{ anomaliesOnly?: string | string[] }>;
}) {
  const session = await requirePageSession("records:view");
  const [{ anomaliesOnly }, { timeZone }] = await Promise.all([searchParams, getCompanyBusinessSettings(session.user.companyId!)]);
  const showAnomalies = anomaliesOnly === "true";
  return (
    <RecordsTable
      key={String(showAnomalies)}
      today={todayInBusinessZone(timeZone)}
      timeZone={timeZone}
      anomaliesOnly={showAnomalies}
    />
  );
}
