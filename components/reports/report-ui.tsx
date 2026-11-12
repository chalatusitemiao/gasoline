"use client";

import { Alert, Button, Skeleton } from "antd";
import { roundReportValue } from "./report-values";
import styles from "./reports.module.css";

const numberFormat = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 });
const litersFormat = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 3 });
const moneyFormat = new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function formatNumber(value: number | null | undefined, monetary = false, digits: 2 | 3 = 2) {
  const formatter = monetary ? moneyFormat : digits === 3 ? litersFormat : numberFormat;
  return value == null || !Number.isFinite(value) ? "—" : formatter.format(value);
}

export function signedPercent(value: number) {
  const shown = roundReportValue(value) ?? 0;
  return `${shown > 0 ? "+" : ""}${formatNumber(shown)}%`;
}

type MetricTrendPoint = { month: string; value: number | null; displayValue: number | null };

export type Metric = {
  label: string;
  value: number | string | null;
  unit?: string;
  monetary?: boolean;
  digits?: 2 | 3;
  comparison?: number | null;
  detail?: string;
  trend?: readonly MetricTrendPoint[];
  tone?: "blue" | "teal" | "amber";
};

function MetricSparkline({ label, unit, monetary, digits, trend }: Pick<Metric, "label" | "unit" | "monetary" | "digits"> & {
  trend: readonly MetricTrendPoint[];
}) {
  if (trend.length < 2) return null;

  const observations: { index: number; month: string; value: number; displayValue: number }[] = [];
  let minimum = Infinity;
  let maximum = -Infinity;

  trend.forEach(({ month, value, displayValue }, index) => {
    if (value === null || !Number.isFinite(value)) return;
    observations.push({ index, month, value, displayValue: displayValue ?? value });
    minimum = Math.min(minimum, value);
    maximum = Math.max(maximum, value);
  });

  if (observations.length < 2) return null;

  const segments: { index: number; x: number; y: number }[][] = [];
  let lastIndex = -2;
  for (const { index, value } of observations) {
    if (index !== lastIndex + 1) segments.push([]);
    const x = 3 + (index / (trend.length - 1)) * 174;
    const y = maximum === minimum ? 17 : 31 - ((value - minimum) / (maximum - minimum)) * 27;
    segments[segments.length - 1].push({ index, x: Number(x.toFixed(2)), y: Number(y.toFixed(2)) });
    lastIndex = index;
  }

  const first = observations[0];
  const last = observations[observations.length - 1];
  const format = (value: number) => unit ? `${formatNumber(value, monetary, digits)} ${unit}` : formatNumber(value, monetary, digits);
  const missing = trend.length - observations.length;
  const description = `${label}趋势，${first.month} ${format(first.displayValue)}，${last.month} ${format(last.displayValue)}${missing ? `，${missing} 个月暂无数据` : ""}`;

  return (
    <dd className={styles.metricTrend}>
      <svg viewBox="0 0 180 36" preserveAspectRatio="none" role="img" aria-label={description}>
        <title>{description}</title>
        {segments.map((segment) => {
          const start = segment[0];
          if (segment.length === 1) {
            return (
              <path
                key={start.index}
                d={`M ${start.x} ${start.y} h 0.1`}
                fill="none"
                stroke="currentColor"
                strokeWidth="4"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            );
          }

          const end = segment[segment.length - 1];
          const line = `M ${segment.map(({ x, y }) => `${x} ${y}`).join(" L ")}`;
          return (
            <g key={start.index}>
              <path d={`${line} L ${end.x} 36 H ${start.x} Z`} fill="currentColor" opacity="0.12" />
              <path
                d={line}
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            </g>
          );
        })}
      </svg>
    </dd>
  );
}

export function MetricCards({ metrics }: { metrics: readonly Metric[] }) {
  return (
    <dl className={styles.metrics}>
      {metrics.map(({ label, value, unit, monetary, digits, comparison, detail, trend, tone = "blue" }) => (
        <div key={label} className={styles.metric} data-tone={tone}>
          <dt>{label}</dt>
          <dd className={styles.metricValue}>
            <span>{typeof value === "string" ? value : formatNumber(value, monetary, digits)}</span>
            {unit && value !== null ? <small>{unit}</small> : null}
          </dd>
          {trend ? <MetricSparkline label={label} unit={unit} monetary={monetary} digits={digits} trend={trend} /> : null}
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
