import { AdminPage } from "@/components/admin-page";
import { Reference } from "./reference";
import styles from "./docs.module.css";

export function ApiDocs() {
  return (
    <AdminPage title="接口文档">
      <div className={styles.reference}>
        <Reference />
      </div>
    </AdminPage>
  );
}
