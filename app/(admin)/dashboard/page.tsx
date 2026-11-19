import type { Metadata } from "next";
import { PlatformOverview } from "@/components/platform-overview";
import { Dashboard } from "@/components/reports/dashboard";
import { requirePageSession } from "@/lib/auth";

export const metadata: Metadata = { title: "经营看板" };

export default async function DashboardPage() {
  const session = await requirePageSession();
  if (session.user.role === "super_admin") return <PlatformOverview />;
  await requirePageSession("dashboard:view");
  return <Dashboard />;
}
