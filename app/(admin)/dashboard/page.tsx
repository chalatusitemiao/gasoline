import type { Metadata } from "next";
import { Dashboard } from "@/components/reports/dashboard";
import { requirePageSession } from "@/lib/auth";

export const metadata: Metadata = { title: "经营看板" };

export default async function DashboardPage() {
  await requirePageSession();
  return <Dashboard />;
}
