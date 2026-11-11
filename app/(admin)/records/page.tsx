import type { Metadata } from "next";
import { requirePageSession } from "@/lib/auth";
import { todayInBusinessZone } from "@/lib/fuel-calendar";
import { getSystemSettings } from "@/lib/system-settings";
import { RecordsTable } from "./records-table";

export const metadata: Metadata = { title: "加油记录" };

export default async function RecordsPage({
  searchParams,
}: {
  searchParams: Promise<{ anomaliesOnly?: string | string[] }>;
}) {
  await requirePageSession();
  const [{ anomaliesOnly }, { timeZone }] = await Promise.all([searchParams, getSystemSettings()]);
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
