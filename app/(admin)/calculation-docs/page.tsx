import type { Metadata } from "next";
import { AdminPage } from "@/components/admin-page";
import { requirePageSession } from "@/lib/auth";
import AdminCalculationContent from "./admin-calculation-content";
import RecordCalculationContent from "./record-calculation-content";
import ReportCalculationContent from "./report-calculation-content";
import styles from "./calculation-docs.module.css";

export const metadata: Metadata = { title: "计算文档" };

const sections = [
  { id: "record-basis", title: "台账基础计算" },
  { id: "refuel", title: "录入加油" },
  { id: "records", title: "加油记录" },
  { id: "report-basis", title: "报表通用口径" },
  { id: "dashboard", title: "经营看板" },
  { id: "vehicle-report", title: "单车月报" },
  { id: "driver-report", title: "司机考核" },
  { id: "costs", title: "成本表" },
  { id: "import", title: "数据导入" },
  { id: "vehicles", title: "车辆档案" },
  { id: "drivers", title: "司机档案" },
  { id: "settings", title: "系统配置" },
];

export default async function CalculationDocsPage() {
  await requirePageSession();

  return (
    <AdminPage title="计算文档">
      <div className={styles.layout}>
        <nav className={styles.contents} aria-labelledby="calculation-contents-title">
          <h2 id="calculation-contents-title">目录</h2>
          <ul>
            {sections.map(({ id, title }) => (
              <li key={id}><a href={`#${id}`}>{title}</a></li>
            ))}
          </ul>
        </nav>
        <article className={styles.document} aria-label="计算口径和页面逻辑">
          <RecordCalculationContent />
          <ReportCalculationContent />
          <AdminCalculationContent />
        </article>
      </div>
    </AdminPage>
  );
}
