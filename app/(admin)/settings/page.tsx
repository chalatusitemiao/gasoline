import type { Metadata } from "next";
import { AdminPage } from "@/components/admin-page";
import { SystemSettingsPanel } from "@/components/system-settings-form";
import { requirePageSession } from "@/lib/auth";

export const metadata: Metadata = { title: "系统配置" };

export default async function SettingsPage() {
  await requirePageSession("settings:manage");
  return (
    <AdminPage title="系统配置">
      <SystemSettingsPanel />
    </AdminPage>
  );
}
