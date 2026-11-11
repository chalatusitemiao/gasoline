"use client";

import { Alert, Button, Skeleton } from "antd";
import styles from "./reports.module.css";

const numberFormat = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 });
const moneyFormat = new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function formatNumber(value: number | null | undefined, monetary = false) {
  return value == null || !Number.isFinite(value) ? "—" : (monetary ? moneyFormat : numberFormat).format(value);
}

export function signedPercent(value: number) {
  const shown = Math.abs(value) < 0.005 ? 0 : value;
  return `${shown > 0 ? "+" : ""}${formatNumber(shown)}%`;
}

export type Metric = {
  label: string;
  value: number | string | null;
  unit?: string;
  monetary?: boolean;
  comparison?: number | null;
  detail?: string;
};

export function MetricCards({ metrics }: { metrics: Metric[] }) {
  return (
    <dl className={styles.metrics}>
      {metrics.map(({ label, value, unit, monetary, comparison, detail }) => (
        <div key={label} className={styles.metric}>
          <dt>{label}</dt>
          <dd className={styles.metricValue}>
            <span>{typeof value === "string" ? value : formatNumber(value, monetary)}</span>
            {unit && value !== null ? <small>{unit}</small> : null}
          </dd>
          {comparison !== undefined ? (
            <dd className={styles.metricDetail}>
              环比上月 <strong>{comparison == null ? "—" : signedPercent(comparison)}</strong>
            </dd>
          ) : detail ? <dd className={styles.metricDetail}>{detail}</dd> : null}
        </div>
      ))}
    </dl>
  );
}

export function ReportPending({ failed, onRetry }: { failed: boolean; onRetry: () => void }) {
  return failed ? (
    <Alert
      type="error"
      showIcon
      message="报表加载失败"
      action={<Button size="small" onClick={onRetry}>重试</Button>}
    />
  ) : (
    <div className={`${styles.panel} ${styles.loading}`} role="status" aria-label="正在加载报表">
      <Skeleton active paragraph={{ rows: 5 }} />
    </div>
  );
}

export function FuelCalculationNote({ showCosts = false }: { showCosts?: boolean }) {
  return (
    <aside className={styles.note} aria-label="计算口径">
      <strong>油耗口径</strong>
      <span>油耗按有效区间的总加油量 ÷ 总里程 × 100 计算。车辆首条和里程未增加的记录不计入油耗。</span>
      <span>单笔计算以每次加满油箱为前提。部分加油会使单笔油耗偏高或偏低。记录完整时，单车的月度或年度耗油量与同期总加油量的差值取决于期初、期末油箱余量，最多相差一箱油。</span>
      {showCosts ? <span>元/公里按实付油费除以有效行驶里程计算，平均油价按实付油费除以总加油量计算。</span> : null}
    </aside>
  );
}
