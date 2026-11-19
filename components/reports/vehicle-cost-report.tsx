"use client";

import { DownloadOutlined } from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import { App, Button, Empty, Select, Table, Tag } from "antd";
import Decimal from "decimal.js";
import { useState } from "react";
import { AdminPage } from "@/components/admin-page";
import { useAppNavigation } from "@/components/app-navigation";
import { moneyText, QueryError } from "@/components/fuel/ui";
import { usePartOptions } from "@/components/parts/part-options";
import { apiFetch } from "@/lib/api-client";
import { PART_PROJECT_UNASSIGNED } from "@/lib/parts";
import { downloadSheet } from "@/lib/spreadsheet-client";
import type { VehicleCostReportData, VehicleCostRow } from "@/lib/vehicle-costs";
import { Chart, ChartPanel } from "./report-charts";
import { formatNumber, MetricCards, ReportPending } from "./report-ui";
import { sharePercent } from "./report-values";
import costStyles from "./cost-report.module.css";
import styles from "./reports.module.css";

function spreadsheetAmount(value: string | null) {
  if (value === null) return null;
  const amount = new Decimal(value);
  return amount.sd() <= 15 ? amount.toNumber() : value;
}

function CostComposition({ report }: { report: VehicleCostReportData }) {
  const colors = ["#1677ff", "#08979c"];
  const segments = [
    { name: "已录入购入价", amount: report.totalPurchasePrice },
    { name: "配件费", amount: report.totalPartsAmount },
  ];

  return (
    <ChartPanel title="已知成本构成">
      {Number(report.totalKnownAmount) > 0 ? (
        <div className={styles.shareLayout}>
          <Chart label="已录入购入价和配件费占比" height={228} option={{
            color: colors,
            tooltip: { trigger: "item", renderMode: "richText", confine: true },
            series: [{
              name: "已知成本", type: "pie", radius: ["49%", "72%"], stillShowZeroSum: false,
              label: { show: false },
              data: segments.map(({ name, amount }) => ({ name, value: Number(amount) })),
              tooltip: { valueFormatter: (_value, index) => `${moneyText(segments[index]?.amount)} 元` },
            }],
          }} />
          <ul className={styles.shareLegend} aria-label="已知成本构成明细">
            {segments.map(({ name, amount }, index) => (
              <li className={styles.shareItem} key={name}>
                <span className={styles.shareKey}>
                  <span className={styles.shareSwatch} style={{ backgroundColor: colors[index] }} aria-hidden="true" />
                  <span title={name}>{name}</span>
                </span>
                <span className={styles.shareAmount}>{moneyText(amount)} 元</span>
                <span className={styles.sharePercent}>{formatNumber(sharePercent(amount, report.totalKnownAmount))}%</span>
              </li>
            ))}
          </ul>
        </div>
      ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无可计算占比的费用" />}
    </ChartPanel>
  );
}

export function VehicleCostReport() {
  const { message } = App.useApp();
  const { companyId, userId } = useAppNavigation();
  const [vehicleId, setVehicleId] = useState<string>();
  const [projectId, setProjectId] = useState<string>();
  const [exporting, setExporting] = useState(false);
  const { vehicles, projects, vehicleOptions, projectOptions } = usePartOptions();
  const params = new URLSearchParams();
  if (vehicleId) params.set("vehicleId", vehicleId);
  if (projectId) params.set("projectId", projectId);
  const path = `/api/vehicle-costs?${params}`;
  const query = useQuery({
    queryKey: ["parts", "vehicle-costs", companyId, userId, path],
    queryFn: ({ signal }) => apiFetch<VehicleCostReportData>(path, { signal }),
  });
  const report = query.data;

  async function exportCosts() {
    if (!report || !report.items.length || exporting) return;
    setExporting(true);
    try {
      await downloadSheet("车辆成本.xlsx", "车辆成本", [
        ["车牌", "当前项目", "购入日期", "购入价（元）", "累计配件费（元）", "累计已知成本（元）", "购入价状态"],
        ...report.items.map((row) => [
          row.plate, row.projectName, row.purchaseDate, spreadsheetAmount(row.purchasePrice),
          spreadsheetAmount(row.partsAmount), spreadsheetAmount(row.knownAmount), row.purchasePrice === null ? "未录入" : "已录入",
        ]),
        ["合计", null, null, spreadsheetAmount(report.totalPurchasePrice), spreadsheetAmount(report.totalPartsAmount),
          spreadsheetAmount(report.totalKnownAmount), `未录入 ${report.missingPurchasePriceCount} 辆`],
      ]);
    } catch {
      message.error("导出失败，请重试。");
    } finally {
      setExporting(false);
    }
  }

  return (
    <AdminPage title="车辆成本" className={`${styles.report} ${costStyles.costReport}`}
      actions={<Button icon={<DownloadOutlined />} disabled={!report?.items.length} loading={exporting} onClick={exportCosts}>导出 Excel</Button>}>
      <div className={costStyles.filters}>
        <Select<string> aria-label="车牌" className={costStyles.selector} showSearch allowClear optionFilterProp="label"
          placeholder="全部车牌" value={vehicleId} options={vehicleOptions} loading={vehicles.isPending} onChange={setVehicleId} />
        <Select<string> aria-label="当前项目" className={costStyles.selector} showSearch allowClear optionFilterProp="label"
          placeholder="全部当前项目" value={projectId} loading={projects.isPending} onChange={setProjectId}
          options={[...(projectOptions ?? []), { label: "未分配项目", value: PART_PROJECT_UNASSIGNED }]} />
      </div>
      {vehicles.isError && <QueryError error={vehicles.error} retry={() => void vehicles.refetch()} />}
      {projects.isError && <QueryError error={projects.error} retry={() => void projects.refetch()} />}
      {report ? (
        <>
          <MetricCards className={costStyles.metrics} metrics={[
            { label: "累计已知成本", value: moneyText(report.totalKnownAmount), unit: "元", detail: "已录入购入价 + 累计配件费" },
            { label: "已录入购入价", value: moneyText(report.totalPurchasePrice), unit: "元" },
            { label: "累计配件费", value: moneyText(report.totalPartsAmount), unit: "元", tone: "teal" },
            { label: "未录入购入价", value: report.missingPurchasePriceCount, unit: "辆", tone: "amber" },
          ]} />
          <CostComposition report={report} />
          <ChartPanel title="车辆成本明细">
            <Table<VehicleCostRow> key={path} rowKey="id" size="middle" scroll={{ x: 850 }} dataSource={report.items}
              locale={{ emptyText: "当前筛选下暂无车辆" }} pagination={{ pageSize: 20, hideOnSinglePage: true }} columns={[
                { title: "车牌", dataIndex: "plate", width: 120 },
                { title: "当前项目", dataIndex: "projectName", render: (value: string | null) => value ?? "未分配项目" },
                { title: "购入日期", dataIndex: "purchaseDate", width: 120, render: (value: string | null) => value ?? "—" },
                { title: "购入价（元）", dataIndex: "purchasePrice", width: 145, align: "right", className: costStyles.money,
                  render: (value: string | null) => value === null ? <Tag color="warning">未录入</Tag> : moneyText(value) },
                { title: "累计配件费（元）", dataIndex: "partsAmount", width: 150, align: "right", className: costStyles.money, render: moneyText },
                { title: "累计成本（元）", dataIndex: "knownAmount", width: 174, align: "right", className: costStyles.money,
                  render: (value: string, row) => row.purchasePrice === null ? `已知 ${moneyText(value)}` : moneyText(value) },
              ]} />
          </ChartPanel>
        </>
      ) : <ReportPending failed={query.isError} onRetry={() => void query.refetch()} />}
    </AdminPage>
  );
}
