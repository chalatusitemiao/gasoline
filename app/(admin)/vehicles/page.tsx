import type { Metadata } from "next";
import { ArchiveManager } from "@/components/fuel/archive-manager";
import { requirePageSession } from "@/lib/auth";
import { VehicleImport } from "./vehicle-import";

export const metadata: Metadata = { title: "车辆档案" };

export default async function VehiclesPage() {
  await requirePageSession();
  return <ArchiveManager kind="vehicles" extraAction={<VehicleImport />} />;
}
