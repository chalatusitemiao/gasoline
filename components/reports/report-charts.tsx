"use client";

import { Empty } from "antd";
import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import type { FuelAnalytics, FuelMetrics, VehicleMetrics } from "@/lib/fuel-analytics";
import { monthsInRange } from "@/lib/fuel-analytics";
import { formatNumber } from "./report-ui";
import styles from "./reports.module.css";

const Chart = dynamic(() => import("./chart"), {
  ssr: false,
  loading: () => <div className={styles.chartPlaceholder} role="status">正在加载图表</div>,
});

const colors = ["#1677ff", "#08979c", "#722ed1", "#389e0d", "#d48806", "#2f54eb", "#c41d7f"];
const axisLabel = { color: "#595959", fontSize: 12 };
const axisLine = { lineStyle: { color: "#d9d9d9" } };
const splitLine = { lineStyle: { color: "#f0f0f0" } };
const tooltipStyle = {
  backgroundColor: "#ffffff",
  borderColor: "#e8e8e8",
  borderWidth: 1,
  textStyle: { color: "#262626", fontSize: 13 },
};

function ChartPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={styles.panel} aria-label={title}>
      <h2 className={styles.panelTitle}>{title}</h2>
      {children}
    </section>
  );
}

function EmptyChart() {
  return (
    <div className={styles.chartEmpty}>
      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无统计数据" />
    </div>
  );
}

export function DualTrend({
  report,
  costs = false,
  recent = false,
}: {
  report: FuelAnalytics;
  costs?: boolean;
  recent?: boolean;
}) {
  const months = monthsInRange(report.from, report.to);
  const metrics = new Map(report.months.map((item) => [item.month, item]));
  const values = months.map((month) => metrics.get(month));
  const title = costs ? "月度油费与每公里油费"
    : recent ? "近 6 个月加油量与百公里油耗" : "月度加油量与百公里油耗";
  const volumeLabel = costs ? "油费" : "加油量";
  const rateLabel = costs ? "每公里油费" : "百公里油耗";
  const volumeUnit = costs ? "元" : "L";
  const rateUnit = costs ? "元/km" : "L/100km";

  return (
    <ChartPanel title={title}>
      {report.total.count === 0 ? <EmptyChart /> : (
        <Chart
          label={title}
          height={272}
          option={{
            color: [colors[0], colors[1]],
            aria: { enabled: true },
            tooltip: { ...tooltipStyle, trigger: "axis", renderMode: "richText", confine: true },
            legend: { top: 0, itemGap: 20, textStyle: axisLabel, data: [volumeLabel, rateLabel] },
            grid: { top: 54, left: 68, right: 62, bottom: 36 },
            xAxis: {
              type: "category",
              data: months.map((month) => month.replace("-", ".")),
              axisLabel: { ...axisLabel, hideOverlap: true },
              axisLine,
              axisTick: { show: false },
            },
            yAxis: [
              { type: "value", name: volumeUnit, min: 0, nameTextStyle: axisLabel, axisLabel, splitLine },
              {
                type: "value",
                name: rateUnit,
                min: 0,
                nameTextStyle: axisLabel,
                axisLabel,
                splitLine: { show: false },
              },
            ],
            series: [
              {
                name: volumeLabel,
                type: "bar",
                barMaxWidth: 36,
                data: values.map((value) => value?.[costs ? "amount" : "liters"] ?? 0),
                itemStyle: { borderRadius: [3, 3, 0, 0] },
                tooltip: { valueFormatter: (value) => `${formatNumber(Number(value))} ${volumeUnit}` },
              },
              {
                name: rateLabel,
                type: "line",
                yAxisIndex: 1,
                data: values.map((value) => value?.[costs ? "amountPerKm" : "consumption"] ?? null),
                symbol: "circle",
                symbolSize: 6,
                lineStyle: { width: 2 },
                tooltip: {
                  valueFormatter: (value) => value == null || value === "-"
                    ? "—" : `${formatNumber(Number(value))} ${rateUnit}`,
                },
              },
            ],
          }}
        />
      )}
    </ChartPanel>
  );
}

export function ConsumptionRanking({
  title,
  rows,
  fleet,
}: {
  title: string;
  rows: (Pick<FuelMetrics, "consumption"> & { label: string })[];
  fleet?: number | null;
}) {
  const ranked = rows
    .filter((row): row is { label: string; consumption: number } => row.consumption !== null)
    .sort((first, second) => first.consumption - second.consumption || first.label.localeCompare(second.label));

  return (
    <ChartPanel title={title}>
      {ranked.length === 0 ? <EmptyChart /> : (
        <div className={styles.chartScroll}>
          <Chart
            label={title}
            height={Math.max(232, ranked.length * 28 + 62)}
            option={{
              color: [colors[0]],
              aria: { enabled: true },
              tooltip: {
                ...tooltipStyle,
                trigger: "axis",
                axisPointer: { type: "shadow" },
                renderMode: "richText",
                confine: true,
              },
              grid: { top: 32, left: 102, right: 48, bottom: 43 },
              xAxis: {
                type: "value",
                name: "L/100km",
                nameTextStyle: axisLabel,
                nameGap: 27,
                min: 0,
                nameLocation: "center",
                axisLabel: { ...axisLabel, hideOverlap: true },
                splitLine,
              },
              yAxis: {
                type: "category",
                inverse: true,
                data: ranked.map((row) => row.label),
                axisLabel: { ...axisLabel, width: 88, overflow: "truncate", interval: 0 },
                axisLine,
                axisTick: { show: false },
              },
              series: [{
                type: "bar",
                name: "百公里油耗",
                barMaxWidth: 13,
                data: ranked.map((row) => row.consumption),
                itemStyle: { borderRadius: [0, 3, 3, 0] },
                tooltip: { valueFormatter: (value) => `${formatNumber(Number(value))} L/100km` },
                markLine: fleet == null ? undefined : {
                  symbol: ["none", "none"],
                  data: [{ xAxis: fleet }],
                  label: { formatter: `车队均值 ${formatNumber(fleet)}`, position: "insideEndTop", color: colors[1] },
                  lineStyle: { type: "dashed", color: colors[1], width: 1.5 },
                },
              }],
            }}
          />
        </div>
      )}
    </ChartPanel>
  );
}

export function CostShare({ vehicles }: { vehicles: VehicleMetrics[] }) {
  const title = "单车油费占比";
  const data = vehicles
    .filter((vehicle) => vehicle.amount > 0)
    .sort((first, second) => second.amount - first.amount)
    .map((vehicle) => ({ name: vehicle.plate, value: vehicle.amount }));

  return (
    <ChartPanel title={title}>
      {data.length === 0 ? <EmptyChart /> : (
        <Chart
          label={title}
          height={272}
          option={{
            color: colors,
            aria: { enabled: true },
            tooltip: {
              ...tooltipStyle,
              trigger: "item",
              renderMode: "richText",
              confine: true,
              formatter: "{b}\n{c} 元 · {d}%",
            },
            series: [{
              type: "pie",
              name: title,
              radius: ["42%", "72%"],
              data,
              label: { show: false },
              itemStyle: { borderColor: "#ffffff", borderWidth: 1.5 },
            }],
          }}
        />
      )}
    </ChartPanel>
  );
}
