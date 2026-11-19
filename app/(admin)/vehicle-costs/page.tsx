import type { Metadata } from "next";
import { VehicleCostReport } from "@/components/reports/vehicle-cost-report";
import { requirePageSession } from "@/lib/auth";

export const metadata: Metadata = { title: "车辆成本" };

export default async function Page() {
  await requirePageSession("reports:vehicle-costs");
  return <VehicleCostReport />;
}
