import type { Metadata } from "next";
import { AdminPage } from "@/components/admin-page";
import { SystemSettingsPanel } from "@/components/system-settings-form";
import { requirePageSession } from "@/lib/auth";

export const metadata: Metadata = { title: "配置管理" };

export default async function SettingsPage() {
  const session = await requirePageSession();
  await requirePageSession(session.user.role === "super_admin" ? "platform:settings" : "settings:manage");
  return <AdminPage title={session.user.role === "super_admin" ? "平台配置" : "公司配置"}><SystemSettingsPanel /></AdminPage>;
}
