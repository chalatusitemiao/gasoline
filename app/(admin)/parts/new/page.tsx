import type { Metadata } from "next";
import { PartsEntry } from "@/components/parts/parts-entry";
import { requirePageSession } from "@/lib/auth";
import { getCompanyBusinessSettings } from "@/lib/company-settings";
import { todayInBusinessZone } from "@/lib/fuel-calendar";

export const metadata: Metadata = { title: "录入车辆配件" };

export default async function PartEntryPage() {
  const session = await requirePageSession("parts:create");
  const { timeZone } = await getCompanyBusinessSettings(session.user.companyId!);
  return <PartsEntry initialDate={todayInBusinessZone(timeZone)} />;
}
