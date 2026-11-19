"use client";

import { AppLink, useAppNavigation } from "@/components/app-navigation";
import { AdminPage } from "@/components/admin-page";
import { PartForm } from "./part-form";
import styles from "./parts.module.css";

export function PartsEntry({ initialDate }: { initialDate: string }) {
  const { permissions = [] } = useAppNavigation();
  return (
    <AdminPage
      title="录入车辆配件"
      actions={permissions.includes("parts:view") && (
        <AppLink className={styles.navLink} href="/parts/records">查看配件记录</AppLink>
      )}
    >
      <PartForm today={initialDate} />
    </AdminPage>
  );
}
