"use client";

import { Empty } from "antd";
import type { BarSeriesOption, LineSeriesOption } from "echarts";
import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import type { FuelMetricKey, FuelMetrics, MonthMetrics, VehicleMetrics } from "@/lib/fuel-analytics";
import { formatNumber } from "./report-ui";
import { metricValue, ReportDecimal, roundedMetricValue, sharePercent } from "./report-values";
import styles from "./reports.module.css";

const Chart = dynamic(() => import("./chart"), {
  ssr: false,
  loading: () => <div className={styles.chartPlaceholder} role="status">正在加载图表</div>,
});

const blue = "#1677ff";
const teal = "#08979c";
const amber = "#d48806";
const shareColors = [blue, teal, "#597ef7", "#389e0d", "#d48806", "#722ed1", "#8c9bab"];
const chartHeight = 280;
const axisLabel = { color: "#595959", fontSize: 12 };
const axisLine = { lineStyle: { color: "#d9d9d9" } };
const splitLine = { lineStyle: { color: "#edf0f5" } };
const tooltipStyle = {
  backgroundColor: "#ffffff",
  borderColor: "#e8e8e8",
  borderWidth: 1,
  textStyle: { color: "#262626", fontSize: 13 },
  renderMode: "richText" as const,
  confine: true,
};

const compactFormat = new Intl.NumberFormat("zh-CN", { notation: "compact", maximumFractionDigits: 2 });

type MetricDefinition = {
  name: string;
  unit: string;
  color: string;
  rate?: boolean;
  monetary?: boolean;
  integer?: boolean;
  digits?: 2 | 3;
};

const metricDefinitions: Record<FuelMetricKey, MetricDefinition> = {
  liters: { name: "加油量", unit: "L", color: blue, digits: 3 },
  amount: { name: "油费", unit: "元", color: blue, monetary: true },
  consumption: { name: "百公里油耗", unit: "L/100km", color: teal, rate: true },
  distance: { name: "行驶里程", unit: "km", color: blue },
  count: { name: "加油次数", unit: "次", color: blue, integer: true },
  anomalies: { name: "异常记录", unit: "条", color: amber, integer: true },
  amountPerKm: { name: "每公里油费", unit: "元/km", color: teal, rate: true, monetary: true },
  averagePrice: { name: "平均油价", unit: "元/L", color: teal, rate: true, monetary: true },
};

function formatChartValue(value: unknown, metric: MetricDefinition) {
  return typeof value === "number" && Number.isFinite(value)
    ? `${formatNumber(value, metric.monetary, metric.digits)} ${metric.unit}`
    : "—";
}

function ChartPanel({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className={styles.panel} aria-label={title}>
      <div className={styles.panelHeading}>
        <h2 className={styles.panelTitle}>{title}</h2>
        {actions ? <div className={styles.panelActions}>{actions}</div> : null}
      </div>
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

function trendAxis(metric: MetricDefinition, secondary = false) {
  return {
    type: "value" as const,
    name: metric.unit,
    min: 0,
    minInterval: metric.integer ? 1 : undefined,
    nameTextStyle: axisLabel,
    axisLabel: { ...axisLabel, hideOverlap: true, formatter: (value: number) => compactFormat.format(value) },
    splitLine: secondary ? { show: false } : splitLine,
  };
}

function trendSeries(
  key: FuelMetricKey,
  months: readonly (MonthMetrics | undefined)[],
  line: boolean,
  secondary = false,
): BarSeriesOption | LineSeriesOption {
  const metric = metricDefinitions[key];
  const data = months.map((month) => metricValue(month, key));
  const color = secondary ? teal : metric.color;
  const tooltip = {
    valueFormatter: (_value: unknown, index: number) => formatChartValue(roundedMetricValue(months[index], key), metric),
  };

  if (line) {
    return {
      name: metric.name,
      type: "line",
      yAxisIndex: secondary ? 1 : 0,
      data,
      symbol: "circle",
      symbolSize: 6,
      showSymbol: data.length <= 18 || data.some((value, index) =>
        value !== null && data[index - 1] == null && data[index + 1] == null
      ),
      lineStyle: { color, width: 2 },
      itemStyle: { color },
      areaStyle: secondary ? undefined : { color, opacity: 0.09 },
      tooltip,
    };
  }

  return {
    name: metric.name,
    type: "bar",
    data,
    barMaxWidth: 36,
    itemStyle: { color, borderRadius: [4, 4, 0, 0] },
    tooltip,
  };
}

export function MetricTrend({
  title,
  months,
  values,
  metric,
  compareMetric,
  actions,
}: {
  title: string;
  months: readonly string[];
  values: readonly MonthMetrics[];
  metric: FuelMetricKey;
  compareMetric?: FuelMetricKey;
  actions?: ReactNode;
}) {
  const primary = metricDefinitions[metric];
  const secondary = compareMetric ? metricDefinitions[compareMetric] : null;
  const monthIndex = new Map(values.map((value) => [value.month, value]));
  const activeMonths = months.map((month) => monthIndex.get(month));
  const hasData = activeMonths.some((row) =>
    row && row.count > 0 && (row[metric] !== null || (compareMetric && row[compareMetric] !== null))
  );
  const chartLabel = [title, primary.name, secondary?.name]
    .filter((name, index) => name && (index === 0 || !title.includes(name)))
    .join("，");
  const series = [trendSeries(metric, activeMonths, !!primary.rate || metric === "anomalies")];
  if (compareMetric) series.push(trendSeries(compareMetric, activeMonths, true, true));

  return (
    <ChartPanel title={title} actions={actions}>
      {hasData ? (
        <Chart
          label={chartLabel}
          height={chartHeight}
          option={{
            tooltip: { ...tooltipStyle, trigger: "axis", axisPointer: { type: "shadow" } },
            legend: secondary
              ? { top: 0, itemGap: 16, textStyle: axisLabel, selectedMode: false }
              : undefined,
            grid: { top: secondary ? 62 : 36, left: 57, right: secondary ? 58 : 18, bottom: 36 },
            xAxis: {
              type: "category",
              data: months.map((month) => month.replace("-", ".")),
              axisLabel: { ...axisLabel, hideOverlap: true },
              axisLine,
              axisTick: { show: false },
            },
            yAxis: secondary ? [trendAxis(primary), trendAxis(secondary, true)] : trendAxis(primary),
            series,
          }}
        />
      ) : <EmptyChart />}
    </ChartPanel>
  );
}

type RankingRow = { label: string; metrics: FuelMetrics };
type RankedValue = { label: string; value: number; displayValue: number | null };

function RankingChart({
  title,
  rows,
  metric,
  fleet,
  actions,
  labelWidth = 79,
}: {
  title: string;
  rows: readonly RankedValue[];
  metric: MetricDefinition;
  fleet?: FuelMetrics;
  actions?: ReactNode;
  labelWidth?: number;
}) {
  const height = Math.max(chartHeight, rows.length * 30 + 64);

  return (
    <ChartPanel title={title} actions={actions}>
      {rows.length === 0 ? <EmptyChart /> : (
        <div
          className={styles.chartScroll}
          tabIndex={height > 392 ? 0 : undefined}
          aria-label={height > 392 ? `${title}，可滚动查看` : undefined}
        >
          <Chart
            label={title}
            height={height}
            option={{
              tooltip: { ...tooltipStyle, trigger: "axis", axisPointer: { type: "shadow" } },
              grid: { top: 45, left: labelWidth + 16, right: 54, bottom: 15 },
              xAxis: {
                ...trendAxis(metric),
                position: "top",
                nameLocation: "center",
                nameGap: 28,
              },
              yAxis: {
                type: "category",
                inverse: true,
                data: rows.map((row) => row.label),
                axisLabel: { ...axisLabel, width: labelWidth, overflow: "truncate", interval: 0 },
                axisLine,
                axisTick: { show: false },
              },
              series: [{
                type: "bar",
                name: metric.name,
                barMaxWidth: 14,
                data: rows.map((row) => row.value),
                itemStyle: { color: metric.color, borderRadius: [0, 4, 4, 0] },
                label: {
                  show: true,
                  position: "right",
                  color: axisLabel.color,
                  fontSize: 11,
                  formatter: ({ dataIndex }) => {
                    const row = rows[dataIndex];
                    return row ? compactFormat.format(row.displayValue ?? row.value) : "";
                  },
                },
                tooltip: { valueFormatter: (value: unknown, index: number) => formatChartValue(rows[index]?.displayValue ?? value, metric) },
                markLine: fleet?.consumption == null ? undefined : {
                  symbol: ["none", "none"],
                  data: [{ xAxis: fleet.consumption }],
                  label: { formatter: `均值 ${formatNumber(roundedMetricValue(fleet, "consumption"))}`, position: "insideEndTop", color: teal },
                  lineStyle: { type: "dashed", color: teal, width: 1.5 },
                },
              }],
            }}
          />
        </div>
      )}
    </ChartPanel>
  );
}

function rankRows(rows: readonly RankingRow[], metric: FuelMetricKey, direction: "asc" | "desc"): RankedValue[] {
  return rows
    .flatMap(({ label, metrics }) => {
      const value = metrics[metric];
      return value !== null && Number.isFinite(value) ? [{ label, value, displayValue: roundedMetricValue(metrics, metric) }] : [];
    })
    .sort((first, second) => (direction === "asc" ? first.value - second.value : second.value - first.value)
      || first.label.localeCompare(second.label, "zh-CN"));
}

export function MetricRanking({
  title,
  rows,
  metric,
  limit,
  actions,
  labelWidth,
}: {
  title: string;
  rows: readonly RankingRow[];
  metric: FuelMetricKey;
  limit?: number;
  actions?: ReactNode;
  labelWidth?: number;
}) {
  const ranked = rankRows(rows, metric, "desc");

  return (
    <RankingChart
      title={title}
      rows={limit === undefined ? ranked : ranked.slice(0, limit)}
      metric={metricDefinitions[metric]}
      actions={actions}
      labelWidth={labelWidth}
    />
  );
}

export function ConsumptionRanking({
  title,
  rows,
  fleet,
  labelWidth,
}: {
  title: string;
  rows: readonly RankingRow[];
  fleet?: FuelMetrics;
  labelWidth?: number;
}) {
  const ranked = rankRows(rows, "consumption", "asc");
  return <RankingChart title={title} rows={ranked} metric={metricDefinitions.consumption} fleet={fleet} labelWidth={labelWidth} />;
}

export function CostShare({
  vehicles,
  metric = "amount",
  title = metric === "amount" ? "单车油费占比" : "单车加油量占比",
  actions,
}: {
  vehicles: readonly VehicleMetrics[];
  metric?: "amount" | "liters";
  title?: string;
  actions?: ReactNode;
}) {
  const definition = metricDefinitions[metric];
  const positive = vehicles
    .filter((vehicle) => vehicle[metric] > 0)
    .map((vehicle) => ({ label: vehicle.plate, value: new ReportDecimal(vehicle.exactTotals?.[metric] ?? vehicle[metric]) }))
    .sort((first, second) => second.value.comparedTo(first.value) || first.label.localeCompare(second.label, "zh-CN"));
  const total = positive.reduce((sum, row) => sum.plus(row.value), new ReportDecimal(0));
  const maxNamedVehicles = shareColors.length - 1;
  const grouped = positive.length <= shareColors.length ? positive : [
    ...positive.slice(0, maxNamedVehicles),
    {
      label: "其他车辆",
      value: positive.slice(maxNamedVehicles).reduce((sum, row) => sum.plus(row.value), new ReportDecimal(0)),
    },
  ];
  const slices = grouped.map(({ label, value }) => ({ label, value: value.toNumber(), percent: sharePercent(value, total) }));
  const totalValue = total.toNumber();

  return (
    <ChartPanel title={title} actions={actions}>
      {slices.length === 0 ? <EmptyChart /> : (
        <div className={styles.shareLayout}>
          <Chart
            label={`${title}，合计 ${formatChartValue(totalValue, definition)}`}
            height={200}
            option={{
              color: shareColors,
              title: {
                text: `${compactFormat.format(totalValue)} ${definition.unit}`,
                subtext: `${definition.name}合计`,
                left: "center",
                top: "center",
                textStyle: { color: "#1f1f1f", fontSize: 17, fontWeight: 600 },
                subtextStyle: { color: "#595959", fontSize: 12 },
                itemGap: 4,
              },
              tooltip: {
                ...tooltipStyle,
                trigger: "item",
                formatter: (params) => {
                  const item = Array.isArray(params) ? params[0] : params;
                  const slice = item && slices[item.dataIndex];
                  if (!slice) return "";
                  return `${slice.label}\n${formatChartValue(slice.value, definition)} · ${formatNumber(slice.percent)}%`;
                },
              },
              series: [{
                type: "pie",
                name: title,
                radius: ["55%", "78%"],
                data: slices.map((row) => ({ name: row.label, value: row.value })),
                label: { show: false },
                itemStyle: { borderColor: "#ffffff", borderWidth: 2, borderRadius: 3 },
                emphasis: { scaleSize: 4 },
              }],
            }}
          />
          <ul className={styles.shareLegend} aria-label={`${title}明细`}>
            {slices.map(({ label, value, percent }, index) => (
              <li className={styles.shareItem} key={label}>
                <span className={styles.shareKey}>
                  <span className={styles.shareSwatch} style={{ backgroundColor: shareColors[index] }} aria-hidden="true" />
                  <span title={label}>{label}</span>
                </span>
                <span className={styles.shareAmount}>{formatChartValue(value, definition)}</span>
                <span className={styles.sharePercent}>{formatNumber(percent)}%</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </ChartPanel>
  );
}
