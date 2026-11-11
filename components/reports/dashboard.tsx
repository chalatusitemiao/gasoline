"use client";

import { ProTable, type ProColumns } from "@ant-design/pro-components";
import { useQuery } from "@tanstack/react-query";
import { Tag } from "antd";
import Link from "next/link";
import { AdminPage } from "@/components/admin-page";
import { apiFetch } from "@/lib/api-client";
import { shiftMonth, type FuelAnalytics, type RecentAnomaly } from "@/lib/fuel-analytics";
import { ConsumptionRanking, DualTrend } from "./report-charts";
import { FuelCalculationNote, MetricCards, ReportPending, formatNumber } from "./report-ui";
import styles from "./reports.module.css";

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
  { title: "司机", dataIndex: "driver", ellipsis: true },
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
      return <Tag color="red">待核实</Tag>;
    },
  },
];

export function Dashboard() {
  const query = useQuery({
    queryKey: ["fuel", "analytics", "dashboard"],
    queryFn: ({ signal }) => apiFetch<FuelAnalytics>("/api/fuel/analytics?view=dashboard", { signal }),
  });
  const report = query.data;
  const current = report?.months.find((item) => item.month === report.currentMonth);
  const previous = report?.months.find((item) => item.month === shiftMonth(report.currentMonth, -1));

  return (
    <AdminPage
      title="经营看板"
      className={styles.report}
      actions={report ? <time className={styles.period} dateTime={report.currentMonth}>{report.currentMonth}</time> : undefined}
    >
      {!report ? <ReportPending failed={query.isError} onRetry={() => { void query.refetch(); }} /> : (
        <>
          <MetricCards metrics={[
            { label: "本月加油量", value: current?.liters ?? 0, unit: "L", comparison: monthOverMonth(current?.liters ?? 0, previous?.liters) },
            { label: "本月油费", value: current?.amount ?? 0, unit: "元", monetary: true, comparison: monthOverMonth(current?.amount ?? 0, previous?.amount) },
            { label: "百公里油耗", value: current?.consumption ?? null, unit: "L/100km", comparison: monthOverMonth(current?.consumption, previous?.consumption) },
            { label: "异常记录数", value: current?.anomalies ?? 0, unit: "条" },
            { label: "本月行驶里程", value: current?.distance ?? 0, unit: "km" },
          ]} />
          <DualTrend report={report} recent />
          <div className={styles.twoCharts}>
            <ConsumptionRanking
              title="本月单车油耗排行"
              rows={report.vehicles.map(({ plate, consumption }) => ({ label: plate, consumption }))}
              fleet={current?.consumption}
            />
            <ConsumptionRanking
              title="本月司机油耗排行"
              rows={report.drivers.map(({ name, consumption }) => ({ label: name, consumption }))}
            />
          </div>
          <ProTable<RecentAnomaly>
            className={styles.table}
            headerTitle="待核实异常"
            toolBarRender={() => [
              <Link key="records" className={styles.tableLink} href="/records?anomaliesOnly=true">
                查看异常记录
              </Link>,
            ]}
            columns={anomalyColumns}
            rowKey="id"
            dataSource={report.recentAnomalies}
            pagination={false}
            search={false}
            options={false}
            size="middle"
            scroll={{ x: 820 }}
            locale={{ emptyText: "暂无待核实的异常" }}
          />
          <FuelCalculationNote />
        </>
      )}
    </AdminPage>
  );
}
