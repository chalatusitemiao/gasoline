import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BrandMark } from "@/components/brand-mark";
import { SystemSettingsForm } from "@/components/system-settings-form";
import styles from "@/components/system-settings.module.css";
import { getSystemSettings, isSystemConfigured } from "@/lib/system-settings";

export const metadata: Metadata = { title: "初始化系统" };
export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const settings = await getSystemSettings();
  if (isSystemConfigured(settings)) redirect("/login");

  return (
    <main className={styles.setup} aria-labelledby="setup-title">
      <header className={styles.setupHeading}>
        <BrandMark size={44} />
        <h1 id="setup-title">初始化油量监控</h1>
      </header>
      <SystemSettingsForm databaseUrlConfigured={Boolean(settings.databaseUrl)} />
    </main>
  );
}
