import type { Metadata } from "next";
import { AdminPage } from "@/components/admin-page";
import { requirePageSession } from "@/lib/auth";
import { Reference } from "./reference";
import styles from "./docs.module.css";

export const metadata: Metadata = { title: "接口文档" };

export default async function DocsPage() {
  await requirePageSession();
  return (
    <AdminPage title="接口文档">
      <div className={styles.reference}>
        <Reference />
      </div>
    </AdminPage>
  );
}
