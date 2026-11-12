"use client";

import { ProTable, type ProColumns } from "@ant-design/pro-components";
import { useQuery } from "@tanstack/react-query";
import { Segmented, Tag } from "antd";
import { useState } from "react";
import { AdminPage } from "@/components/admin-page";
import { AppLink } from "@/components/app-navigation";
import { apiFetch } from "@/lib/api-client";
import { driverLabel } from "@/lib/fuel";
import { monthsInRange, shiftMonth, type FuelAnalytics, type FuelMetricKey, type MonthMetrics, type RecentAnomaly } from "@/lib/fuel-analytics";
import { ConsumptionRanking, CostShare, MetricTrend } from "./report-charts";
import { FuelCalculationNote, MetricCards, ReportPending, formatNumber, type Metric } from "./report-ui";
import { metricValue, monthlyMetricTrend, roundedMetricValue } from "./report-values";
import styles from "./reports.module.css";

const summaryMetrics: readonly (Pick<Metric, "label" | "unit" | "monetary" | "digits" | "tone"> & {
  key: FuelMetricKey;
})[] = [
  { key: "amount", label: "本月油费", unit: "元", monetary: true },
  { key: "liters", label: "本月加油量", unit: "L", digits: 3 },
  { key: "consumption", label: "百公里油耗", unit: "L/100km", tone: "teal" },
  { key: "distance", label: "本月行驶里程", unit: "km", tone: "teal" },
  { key: "anomalies", label: "本月异常记录", unit: "条", tone: "amber" },
];

type TrendMetric = "liters" | "amount" | "distance" | "anomalies";

const trendOptions: { label: string; value: TrendMetric }[] = [
  { label: "加油", value: "liters" },
  { label: "油费", value: "amount" },
  { label: "里程", value: "distance" },
  { label: "异常", value: "anomalies" },
];

const trendComparisons: Partial<Record<TrendMetric, FuelMetricKey>> = {
  liters: "consumption",
  amount: "amountPerKm",
};

function monthOverMonth(current: number | null | undefined, previous: number | null | undefined) {
  if (current == null || previous == null || previous === 0) return null;
  return (current / previous - 1) * 100;
}

function decimal(value: string | null) {
  return value === null ? null : Number(value);
}

const anomalyColumns: ProColumns<RecentAnomaly>[] = [
  { title: "加油日期", dataIndex: "date", width: 124 },
  { title: "车牌号", dataIndex: "plate", width: 122 },
  { title: "司机", width: 180, ellipsis: true, render: (_, row) => <span title={row.driverId}>{driverLabel(row.driver, row.driverId)}</span> },
  {
    title: "里程表（km）",
    align: "right",
    width: 122,
    render: (_, row) => formatNumber(decimal(row.odometer)),
  },
  {
    title: "区间里程（km）",
    align: "right",
    width: 136,
    render: (_, row) => formatNumber(decimal(row.distance)),
  },
  {
    title: "油耗（L/100km）",
    align: "right",
    width: 140,
    render: (_, row) => formatNumber(decimal(row.consumption)),
  },
  {
    title: "异常",
    width: 110,
    render: (_, row) => {
      if (row.reason === "odometer_not_increased") return <Tag color="orange">里程未增</Tag>;
      if (row.reason === "consumption_high") return <Tag color="red">油耗异常</Tag>;
      return <Tag color="red">异常</Tag>;
    },
  },
];

function DashboardTrend({ months, values }: { months: string[]; values: MonthMetrics[] }) {
  const [trendMetric, setTrendMetric] = useState<TrendMetric>("liters");

  return (
    <MetricTrend
      title="近 6 个月经营趋势"
      months={months}
      values={values}
      metric={trendMetric}
      compareMetric={trendComparisons[trendMetric]}
      actions={(
        <Segmented<TrendMetric>
          aria-label="经营趋势指标"
          size="small"
          options={trendOptions}
          value={trendMetric}
          onChange={setTrendMetric}
        />
      )}
    />
  );
}

function DashboardAnalysis({ report }: { report: FuelAnalytics }) {
  const months = monthsInRange(report.from, report.to);
  const trend = monthlyMetricTrend(report.months, months);
  const previousMonth = shiftMonth(report.currentMonth, -1);
  const current = report.months.find((row) => row.month === report.currentMonth);
  const previous = report.months.find((row) => row.month === previousMonth);

  return (
    <>
      <MetricCards metrics={summaryMetrics.map(({ key, ...metric }) => {
        return {
          ...metric,
          value: roundedMetricValue(current, key),
          comparison: monthOverMonth(metricValue(current, key), previous?.[key]),
          trend: trend(key),
        };
      })} />
      <div className={styles.analysisGrid}>
        <DashboardTrend months={months} values={report.months} />
        <CostShare title="本月车辆油费占比" vehicles={report.vehicles} />
      </div>
      <div className={styles.twoCharts}>
        <ConsumptionRanking
          title="本月单车油耗排行"
          rows={report.vehicles.map((vehicle) => ({ label: vehicle.plate, metrics: vehicle }))}
          fleet={current}
        />
        <ConsumptionRanking
          title="本月司机油耗排行"
          rows={report.drivers.map((driver) => ({ label: driverLabel(driver.name, driver.driverId), metrics: driver }))}
          labelWidth={126}
          fleet={current}
        />
      </div>
      <ProTable<RecentAnomaly>
        className={styles.table}
        headerTitle="最近异常记录"
        toolBarRender={() => [
          <AppLink key="records" className={styles.tableLink} href="/records?anomaliesOnly=true">
            查看异常记录
          </AppLink>,
        ]}
        columns={anomalyColumns}
        rowKey="id"
        dataSource={report.recentAnomalies}
        pagination={false}
        search={false}
        options={false}
        size="middle"
        scroll={{ x: 900 }}
        locale={{ emptyText: "暂无异常记录" }}
      />
      <FuelCalculationNote showCosts />
    </>
  );
}

export function Dashboard() {
  const query = useQuery({
    queryKey: ["fuel", "analytics", "dashboard"],
    queryFn: ({ signal }) => apiFetch<FuelAnalytics>("/api/fuel/analytics?view=dashboard", { signal }),
  });
  const report = query.data;

  return (
    <AdminPage
      title="经营看板"
      className={styles.report}
      actions={report ? (
        <span className={styles.period}>
          统计月份 <time dateTime={report.currentMonth}>{report.currentMonth}</time>
        </span>
      ) : undefined}
    >
      {report ? <DashboardAnalysis report={report} /> : (
        <ReportPending failed={query.isError} onRetry={() => { void query.refetch(); }} />
      )}
    </AdminPage>
  );
}
