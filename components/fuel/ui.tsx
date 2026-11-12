"use client";

import { Alert, Button, Tag, type TablePaginationConfig } from "antd";
import Decimal from "decimal.js";
import type { ReactNode } from "react";
import { AdminPage } from "@/components/admin-page";
import type { FuelRecord } from "@/lib/fuel";
import styles from "./ui.module.css";

export const FULL_TANK_NOTE = "油耗按每次加满计算，部分加油会使单笔油耗失真。";
export const FUEL_OPTIONS = [
  { label: "柴油", value: "diesel" },
  { label: "汽油", value: "gasoline" },
];

const stampFormats = new Map<string, Intl.DateTimeFormat>();

function decimalText(value: string | number | null | undefined, digits: number, pad: boolean) {
  if (value == null || value === "") return "—";
  const [whole, fraction = ""] = new Decimal(value).toFixed(digits, Decimal.ROUND_HALF_UP).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const decimals = pad ? fraction : fraction.replace(/0+$/, "");
  return decimals ? `${grouped}.${decimals}` : grouped;
}

export function numberText(value: string | number | null | undefined, digits = 2) {
  return decimalText(value, digits, false);
}

export function moneyText(value: string | number | null | undefined) {
  return decimalText(value, 2, true);
}

export function stampText(value: string | null | undefined, timeZone = "Asia/Shanghai") {
  if (!value) return "—";
  let format = stampFormats.get(timeZone);
  if (!format) {
    format = new Intl.DateTimeFormat("zh-CN", {
      timeZone,
      dateStyle: "medium",
      timeStyle: "short",
      hourCycle: "h23",
    });
    stampFormats.set(timeZone, format);
  }
  return format.format(new Date(value));
}

export function fuelText(value: string | null | undefined) {
  return FUEL_OPTIONS.find((option) => option.value === value)?.label ?? "—";
}

type AnomalyContext = Pick<FuelRecord, "distance" | "baseline">;

export function anomalyText(reason: string | null, context?: AnomalyContext) {
  if (reason === "odometer_not_increased") return "里程未增";
  if (reason === "consumption_high") return "油耗异常";
  if (context?.distance === null) return "无区间";
  if (context?.baseline === null) return "样本不足";
  return "正常";
}

export function AnomalyTag({ reason, context }: { reason: string | null; context?: AnomalyContext }) {
  return <Tag color={reason ? "error" : "default"}>{anomalyText(reason, context)}</Tag>;
}

export function FuelPage({
  title,
  actions,
  children,
}: {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <AdminPage title={title} actions={actions}>
      {children}
    </AdminPage>
  );
}

export function QueryError({ error, retry }: { error: Error; retry?: () => void }) {
  return (
    <Alert
      className={styles.alert}
      type="error"
      showIcon
      message={error.message || "请求失败，请稍后重试。"}
      action={retry && <Button size="small" type="link" onClick={retry}>重试</Button>}
    />
  );
}

export type Pagination = { page: number; pageSize: number };

export function tablePagination(
  pagination: Pagination,
  total: number,
  change: (pagination: Pagination) => void,
): TablePaginationConfig {
  return {
    current: pagination.page,
    pageSize: pagination.pageSize,
    total,
    showSizeChanger: true,
    pageSizeOptions: [20, 50, 100],
    showTotal: (count) => `共 ${count} 条`,
    onChange: (page, pageSize) => change({
      page: pageSize === pagination.pageSize ? page : 1,
      pageSize,
    }),
  };
}
