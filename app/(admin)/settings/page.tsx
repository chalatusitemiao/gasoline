import type { Metadata } from "next";
import { AdminPage } from "@/components/admin-page";
import { SystemSettingsPanel } from "@/components/system-settings-form";

export const metadata: Metadata = { title: "系统配置" };

export default function SettingsPage() {
  return (
    <AdminPage title="系统配置">
      <SystemSettingsPanel />
    </AdminPage>
  );
}
