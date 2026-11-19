import type { Metadata } from "next";
import { PartsRecords } from "@/components/parts/parts-records";
import { requirePageSession } from "@/lib/auth";
import { getCompanyBusinessSettings } from "@/lib/company-settings";
import { todayInBusinessZone } from "@/lib/fuel-calendar";

export const metadata: Metadata = { title: "配件记录" };

export default async function PartRecordsPage() {
  const session = await requirePageSession("parts:view");
  const { timeZone } = await getCompanyBusinessSettings(session.user.companyId!);
  const today = todayInBusinessZone(timeZone);
  return <PartsRecords initialMonth={today.slice(0, 7)} today={today} timeZone={timeZone} />;
}
