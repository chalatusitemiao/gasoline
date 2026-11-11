"use client";

import { DownloadOutlined } from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import { App, Button, DatePicker, Select } from "antd";
import dayjs from "dayjs";
import { useState } from "react";
import { AdminPage } from "@/components/admin-page";
import { apiFetch } from "@/lib/api-client";
import { monthsInRange, type AnalyticsView, type FuelAnalytics } from "@/lib/fuel-analytics";
import { downloadSheet } from "@/lib/spreadsheet-client";
import { ConsumptionRanking, CostShare, MetricRanking, MetricTrend } from "./report-charts";
import { reportRows } from "./report-export";
import { CostVehicleTable, DriverTable, VehicleMonthTable } from "./report-tables";
import { FuelCalculationNote, MetricCards, ReportPending, formatNumber } from "./report-ui";
import { monthlyMetricTrend, rankDrivers } from "./report-values";
import styles from "./reports.module.css";

type ReportView = Exclude<AnalyticsView, "dashboard">;

const titles: Record<ReportView, string> = {
  vehicles: "单车月报",
  drivers: "司机考核",
  costs: "成本表",
};

function VehicleTrend({ report, months }: { report: FuelAnalytics; months: readonly string[] }) {
  const [vehicleId, setVehicleId] = useState("");
  const vehicle = report.vehicles.find((item) => item.vehicleId === vehicleId);
  const options = [
    { label: "全部车辆", value: "" },
    ...report.vehicles.map(({ plate, vehicleId }) => ({ label: plate, value: vehicleId })),
  ];

  return (
    <MetricTrend
      title="月度加油量与百公里油耗"
      months={months}
      values={vehicle?.months ?? report.months}
      metric="liters"
      compareMetric="consumption"
      actions={report.vehicles.length > 0 ? (
        <Select<string>
          aria-label="选择趋势图车辆"
          size="small"
          showSearch
          optionFilterProp="label"
          value={vehicle?.vehicleId ?? ""}
          options={options}
          onChange={setVehicleId}
          style={{ width: 132 }}
        />
      ) : undefined}
    />
  );
}

function VehicleReport({ report }: { report: FuelAnalytics }) {
  const { total, vehicles } = report;
  const months = monthsInRange(report.from, report.to);
  const trend = monthlyMetricTrend(report.months, months);

  return (
    <>
      <MetricCards metrics={[
        { label: "加油量", value: total.liters, unit: "L", trend: trend("liters") },
        { label: "油费", value: total.amount, unit: "元", monetary: true, trend: trend("amount") },
        { label: "百公里油耗", value: total.consumption, unit: "L/100km", trend: trend("consumption"), tone: "teal" },
        { label: "行驶里程", value: total.distance, unit: "km", trend: trend("distance") },
        { label: "异常记录", value: total.anomalies, unit: "条", trend: trend("anomalies"), tone: "amber" },
      ]} />
      <div className={styles.analysisGrid}>
        <VehicleTrend report={report} months={months} />
        <CostShare vehicles={vehicles} metric="liters" />
      </div>
      <div className={styles.twoCharts}>
        <ConsumptionRanking
          title="车辆百公里油耗对比"
          rows={vehicles.map(({ plate, consumption }) => ({ label: plate, consumption }))}
          fleet={total.consumption}
        />
        <MetricRanking
          title="车辆行驶里程前 10"
          rows={vehicles.filter(({ distance }) => distance > 0).map(({ plate, distance }) => ({ label: plate, value: distance }))}
          metric="distance"
          limit={10}
        />
      </div>
      <VehicleMonthTable report={report} />
    </>
  );
}

function DriverReport({ report }: { report: FuelAnalytics }) {
  const { drivers, total } = report;
  const ranked = rankDrivers(report).filter((driver) => driver.consumption !== null);
  const lowest = ranked[0];
  const highest = ranked.at(-1);
  const trend = monthlyMetricTrend(report.months, monthsInRange(report.from, report.to));

  return (
    <>
      <MetricCards metrics={[
        { label: "均值", value: total.consumption, unit: "L/100km", trend: trend("consumption"), tone: "teal" },
        { label: "参与司机", value: drivers.length, unit: "人" },
        {
          label: "最低油耗司机",
          value: lowest?.name ?? null,
          detail: lowest ? `${formatNumber(lowest.consumption)} L/100km` : undefined,
        },
        {
          label: "最高油耗司机",
          value: highest?.name ?? null,
          detail: highest ? `${formatNumber(highest.consumption)} L/100km` : undefined,
        },
        { label: "异常记录", value: total.anomalies, unit: "条", trend: trend("anomalies"), tone: "amber" },
      ]} />
      <ConsumptionRanking
        title="司机百公里油耗对比"
        rows={ranked.map(({ name, consumption }) => ({ label: name, consumption }))}
        fleet={total.consumption}
      />
      <div className={styles.twoCharts}>
        <MetricRanking
          title="司机行驶里程前 10"
          rows={drivers.filter(({ distance }) => distance > 0).map(({ name, distance }) => ({ label: name, value: distance }))}
          metric="distance"
          limit={10}
        />
        <MetricRanking
          title="司机异常记录数前 10"
          rows={drivers.filter(({ anomalies }) => anomalies > 0).map(({ name, anomalies }) => ({ label: name, value: anomalies }))}
          metric="anomalies"
          limit={10}
        />
      </div>
      <DriverTable report={report} />
    </>
  );
}

function CostReport({ report }: { report: FuelAnalytics }) {
  const { total, vehicles } = report;
  const months = monthsInRange(report.from, report.to);
  const trend = monthlyMetricTrend(report.months, months);

  return (
    <>
      <MetricCards metrics={[
        { label: "油费合计", value: total.amount, unit: "元", monetary: true, trend: trend("amount") },
        { label: "每公里油费", value: total.amountPerKm, unit: "元/km", monetary: true, trend: trend("amountPerKm"), tone: "teal" },
        { label: "平均油价", value: total.averagePrice, unit: "元/L", monetary: true, trend: trend("averagePrice") },
        { label: "总油量", value: total.liters, unit: "L", trend: trend("liters") },
        { label: "百公里油耗", value: total.consumption, unit: "L/100km", trend: trend("consumption"), tone: "teal" },
      ]} />
      <div className={styles.analysisGrid}>
        <MetricTrend
          title="月度油费与每公里油费"
          months={months}
          values={report.months}
          metric="amount"
          compareMetric="amountPerKm"
        />
        <CostShare vehicles={vehicles} />
      </div>
      <div className={styles.twoCharts}>
        <MetricRanking
          title="车辆每公里油费前 10"
          rows={vehicles.map(({ plate, amountPerKm }) => ({ label: plate, value: amountPerKm }))}
          metric="amountPerKm"
          limit={10}
        />
        <MetricRanking
          title="车辆平均油价前 10"
          rows={vehicles.map(({ plate, averagePrice }) => ({ label: plate, value: averagePrice }))}
          metric="averagePrice"
          limit={10}
        />
      </div>
      <CostVehicleTable report={report} />
    </>
  );
}

export function MonthlyReport({ view, initialMonth }: { view: ReportView; initialMonth: string }) {
  const { message } = App.useApp();
  const [range, setRange] = useState({ from: initialMonth, to: initialMonth });
  const [exporting, setExporting] = useState(false);
  const title = titles[view];
  const currentMonth = dayjs(`${initialMonth}-01`);
  const query = useQuery({
    queryKey: ["fuel", "analytics", view, range.from, range.to],
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({ view, from: range.from, to: range.to });
      return apiFetch<FuelAnalytics>(`/api/fuel/analytics?${params}`, { signal });
    },
  });
  const report = query.data;

  async function exportReport() {
    if (!report) return;

    setExporting(true);
    try {
      const filename = `${title}-${report.from}至${report.to}.xlsx`;
      await downloadSheet(filename, title, reportRows(view, report));
    } catch {
      message.error("导出失败，请重试。");
    } finally {
      setExporting(false);
    }
  }

  return (
    <AdminPage
      className={styles.report}
      title={title}
      actions={(
        <>
          <div className={styles.monthFilter}>
            <label htmlFor="report-from-month">月份区间</label>
            <DatePicker.RangePicker
              className={styles.range}
              id={{ start: "report-from-month", end: "report-to-month" }}
              picker="month"
              format="YYYY-MM"
              allowClear={false}
              placeholder={["开始月份", "结束月份"]}
              presets={[
                { label: "本月", value: [currentMonth, currentMonth] },
                { label: "近 3 个月", value: [currentMonth.subtract(2, "month"), currentMonth] },
                { label: "近 6 个月", value: [currentMonth.subtract(5, "month"), currentMonth] },
                { label: "今年至今", value: [currentMonth.startOf("year"), currentMonth] },
              ]}
              value={[dayjs(`${range.from}-01`), dayjs(`${range.to}-01`)]}
              onChange={(_, months) => {
                if (months[0] && months[1]) setRange({ from: months[0], to: months[1] });
              }}
            />
          </div>
          <Button
            icon={<DownloadOutlined />}
            disabled={!report}
            loading={exporting}
            onClick={() => { void exportReport(); }}
          >
            导出 Excel
          </Button>
        </>
      )}
    >
      {!report ? <ReportPending failed={query.isError} onRetry={() => { void query.refetch(); }} /> : (
        <>
          {view === "vehicles" ? <VehicleReport report={report} /> : null}
          {view === "drivers" ? <DriverReport report={report} /> : null}
          {view === "costs" ? <CostReport report={report} /> : null}
          <FuelCalculationNote showCosts={view === "costs"} />
        </>
      )}
    </AdminPage>
  );
}
