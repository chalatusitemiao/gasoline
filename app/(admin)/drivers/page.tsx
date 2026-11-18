import type { Metadata } from "next";
import { ArchiveManager } from "@/components/fuel/archive-manager";
import { requirePageSession } from "@/lib/auth";

export const metadata: Metadata = { title: "司机档案" };

export default async function DriversPage() {
  await requirePageSession("archives:view");
  return <ArchiveManager kind="drivers" />;
}
