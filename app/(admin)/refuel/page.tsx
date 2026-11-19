import type { Metadata } from "next";
import { requirePageSession } from "@/lib/auth";
import { todayInBusinessZone } from "@/lib/fuel-calendar";
import { getCompanyBusinessSettings } from "@/lib/company-settings";
import { FuelEditor } from "@/components/fuel/fuel-editor";
import { FuelPage } from "@/components/fuel/ui";

export const metadata: Metadata = { title: "录入加油" };

export default async function RefuelPage() {
  const session = await requirePageSession("records:create");
  const { timeZone } = await getCompanyBusinessSettings(session.user.companyId!);

  return (
    <FuelPage title="录入加油">
      <FuelEditor today={todayInBusinessZone(timeZone)} />
    </FuelPage>
  );
}
