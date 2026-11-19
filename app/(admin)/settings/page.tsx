import type { Metadata } from "next";
import { AdminPage } from "@/components/admin-page";
import { CompanySettingsPanel } from "@/components/system-settings-form";
import { requirePageSession } from "@/lib/auth";

export const metadata: Metadata = { title: "公司配置" };

export default async function SettingsPage() {
  await requirePageSession("settings:manage");
  return <AdminPage title="公司配置"><CompanySettingsPanel /></AdminPage>;
}
