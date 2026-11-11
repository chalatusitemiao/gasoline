"use client";

import { Empty } from "antd";
import type { BarSeriesOption, LineSeriesOption } from "echarts";
import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import type { FuelMetrics, MonthMetrics, VehicleMetrics } from "@/lib/fuel-analytics";
import { formatNumber } from "./report-ui";
import { metricValue } from "./report-values";
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

type MetricKey = keyof FuelMetrics;
type MetricDefinition = {
  name: string;
  unit: string;
  color: string;
  rate?: boolean;
  monetary?: boolean;
  integer?: boolean;
};

const metricDefinitions: Record<MetricKey, MetricDefinition> = {
  liters: { name: "加油量", unit: "L", color: blue },
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
    ? `${formatNumber(value, metric.monetary)} ${metric.unit}`
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
  metric: MetricDefinition,
  data: (number | null)[],
  line: boolean,
  secondary = false,
): BarSeriesOption | LineSeriesOption {
  const color = secondary ? teal : metric.color;
  const tooltip = { valueFormatter: (value: unknown) => formatChartValue(value, metric) };

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
  metric: MetricKey;
  compareMetric?: MetricKey;
  actions?: ReactNode;
}) {
  const primary = metricDefinitions[metric];
  const secondary = compareMetric ? metricDefinitions[compareMetric] : null;
  const monthIndex = new Map(values.map((value) => [value.month, value]));
  const activeMonths = months.map((month) => monthIndex.get(month));
  const primaryData = activeMonths.map((row) => metricValue(row, metric));
  const secondaryData = compareMetric
    ? activeMonths.map((row) => metricValue(row, compareMetric))
    : [];
  const hasData = activeMonths.some((row) =>
    row && row.count > 0 && (row[metric] !== null || (compareMetric && row[compareMetric] !== null))
  );
  const chartLabel = [title, primary.name, secondary?.name]
    .filter((name, index) => name && (index === 0 || !title.includes(name)))
    .join("，");
  const series = [trendSeries(primary, primaryData, !!primary.rate || metric === "anomalies")];
  if (secondary) series.push(trendSeries(secondary, secondaryData, true, true));

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

type RankingRow = { label: string; value: number | null };

function RankingChart({
  title,
  rows,
  metric,
  fleet,
  actions,
}: {
  title: string;
  rows: readonly { label: string; value: number }[];
  metric: MetricDefinition;
  fleet?: number | null;
  actions?: ReactNode;
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
              grid: { top: 45, left: 95, right: 54, bottom: 15 },
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
                axisLabel: { ...axisLabel, width: 79, overflow: "truncate", interval: 0 },
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
                  formatter: ({ value }) => typeof value === "number" ? compactFormat.format(value) : "",
                },
                tooltip: { valueFormatter: (value: unknown) => formatChartValue(value, metric) },
                markLine: fleet == null ? undefined : {
                  symbol: ["none", "none"],
                  data: [{ xAxis: fleet }],
                  label: { formatter: `均值 ${formatNumber(fleet)}`, position: "insideEndTop", color: teal },
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

function rankRows(rows: readonly RankingRow[], direction: "asc" | "desc") {
  return rows
    .filter((row): row is { label: string; value: number } => row.value !== null && Number.isFinite(row.value))
    .sort((first, second) => (direction === "asc" ? first.value - second.value : second.value - first.value)
      || first.label.localeCompare(second.label, "zh-CN"));
}

export function MetricRanking({
  title,
  rows,
  metric,
  limit,
  actions,
}: {
  title: string;
  rows: readonly RankingRow[];
  metric: MetricKey;
  limit?: number;
  actions?: ReactNode;
}) {
  const ranked = rankRows(rows, "desc");

  return (
    <RankingChart
      title={title}
      rows={limit === undefined ? ranked : ranked.slice(0, limit)}
      metric={metricDefinitions[metric]}
      actions={actions}
    />
  );
}

export function ConsumptionRanking({
  title,
  rows,
  fleet,
}: {
  title: string;
  rows: readonly (Pick<FuelMetrics, "consumption"> & { label: string })[];
  fleet?: number | null;
}) {
  const ranked = rankRows(rows.map(({ label, consumption }) => ({ label, value: consumption })), "asc");
  return <RankingChart title={title} rows={ranked} metric={metricDefinitions.consumption} fleet={fleet} />;
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
  const ranked = rankRows(vehicles.map((vehicle) => ({ label: vehicle.plate, value: vehicle[metric] })), "desc");
  const positive = ranked.filter((row) => row.value > 0);
  const total = positive.reduce((sum, row) => sum + row.value, 0);
  const maxNamedVehicles = shareColors.length - 1;
  const slices = positive.length <= shareColors.length ? positive : [
    ...positive.slice(0, maxNamedVehicles),
    {
      label: "其他车辆",
      value: positive.slice(maxNamedVehicles).reduce((sum, row) => sum + row.value, 0),
    },
  ];

  return (
    <ChartPanel title={title} actions={actions}>
      {slices.length === 0 ? <EmptyChart /> : (
        <div className={styles.shareLayout}>
          <Chart
            label={`${title}，合计 ${formatChartValue(total, definition)}`}
            height={200}
            option={{
              color: shareColors,
              title: {
                text: `${compactFormat.format(total)} ${definition.unit}`,
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
                  if (!item) return "";
                  return `${item.name}\n${formatChartValue(item.value, definition)} · ${formatNumber(item.percent)}%`;
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
            {slices.map(({ label, value }, index) => (
              <li className={styles.shareItem} key={label}>
                <span className={styles.shareKey}>
                  <span className={styles.shareSwatch} style={{ backgroundColor: shareColors[index] }} aria-hidden="true" />
                  <span title={label}>{label}</span>
                </span>
                <span className={styles.shareAmount}>{formatChartValue(value, definition)}</span>
                <span className={styles.sharePercent}>{formatNumber(value / total * 100)}%</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </ChartPanel>
  );
}
