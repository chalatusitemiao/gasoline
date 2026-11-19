"use client";

import { useQuery } from "@tanstack/react-query";
import { Button, DatePicker, Empty, Segmented, Select, Table } from "antd";
import dayjs from "dayjs";
import { useEffect, useRef, useState } from "react";
import { AdminPage } from "@/components/admin-page";
import { useAppNavigation } from "@/components/app-navigation";
import { moneyText, QueryError, tablePagination } from "@/components/fuel/ui";
import { usePartOptions } from "@/components/parts/part-options";
import { PartPhotoButton } from "@/components/parts/part-photos";
import { apiFetch } from "@/lib/api-client";
import { FUEL_PAGE_SIZE } from "@/lib/fuel";
import { PART_PROJECT_UNASSIGNED, type PartRecord, type PartRecordsPage } from "@/lib/parts";
import type { PartCostReport, ProjectCostVehicle } from "@/lib/vehicle-costs";
import { Chart, ChartPanel } from "./report-charts";
import { MetricCards, ReportPending } from "./report-ui";
import costStyles from "./cost-report.module.css";
import styles from "./reports.module.css";

function PartCostDetails({ vehicleId, projectId, month, title }: {
  vehicleId: string;
  projectId?: string;
  month?: string;
  title: string;
}) {
  const { companyId } = useAppNavigation();
  const [pagination, setPagination] = useState({ page: 1, pageSize: FUEL_PAGE_SIZE });
  const params = new URLSearchParams({ vehicleId, page: String(pagination.page), pageSize: String(pagination.pageSize) });
  if (projectId) params.set("projectId", projectId);
  if (month) params.set("month", month);
  const path = `/api/parts/records?${params}`;
  const details = useQuery({
    queryKey: ["parts", "report-records", companyId, path],
    queryFn: ({ signal }) => apiFetch<PartRecordsPage>(path, { signal }),
  });

  return (
    <ChartPanel title={title}>
      {details.isError ? <QueryError error={details.error} retry={() => void details.refetch()} /> : (
        <Table<PartRecord>
          rowKey="id"
          size="middle"
          loading={details.isPending}
          dataSource={details.data?.items}
          locale={{ emptyText: "暂无配件支出明细" }}
          scroll={{ x: 500 }}
          pagination={tablePagination(pagination, details.data?.total ?? 0, setPagination)}
          columns={[
            { title: "购买日期", dataIndex: "date", width: 120 },
            { title: "配件", dataIndex: "name" },
            { title: "金额（元）", dataIndex: "amount", align: "right", width: 145, render: moneyText },
            { title: "照片", width: 100, render: (_, row) => <PartPhotoButton photos={row.photos} /> },
          ]}
        />
      )}
    </ChartPanel>
  );
}

function SingleVehicleCosts({ report }: { report: Extract<PartCostReport, { scope: "vehicle" }> }) {
  const { months } = report;
  return (
    <>
      <MetricCards className={costStyles.metrics} metrics={[
        { label: "累计配件费", value: moneyText(report.totalAmount), unit: "元" },
        { label: "本月配件费", value: moneyText(report.monthAmount), unit: "元", detail: report.month, tone: "teal" },
      ]} />
      <ChartPanel title="近 12 个月配件支出">
        <Chart label="近 12 个月配件支出趋势" height={264} option={{
          color: ["#1677ff"],
          tooltip: { trigger: "axis", renderMode: "richText", confine: true },
          grid: { left: 8, top: 24, right: 16, bottom: 12, outerBoundsMode: "auto" },
          xAxis: { type: "category", data: months.map(({ month }) => month), axisLabel: { hideOverlap: true } },
          yAxis: { type: "value", min: 0, name: "元" },
          series: [{
            name: "配件费", type: "line", data: months.map(({ amount }) => Number(amount)),
            symbolSize: 7, areaStyle: { opacity: 0.08 },
            tooltip: { valueFormatter: (_value, index) => `${moneyText(months[index]?.amount)} 元` },
          }],
        }} />
      </ChartPanel>
      <PartCostDetails vehicleId={report.vehicleId} title="历史配件支出明细" />
    </>
  );
}

function ProjectCosts({ report }: { report: Extract<PartCostReport, { scope: "project" }> }) {
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>();
  const details = useRef<HTMLDivElement>(null);
  const selected = report.vehicles.find(({ vehicleId }) => vehicleId === selectedVehicleId);
  const ranked = report.vehicles.slice(0, 10);

  useEffect(() => {
    if (selectedVehicleId) details.current?.scrollIntoView({ block: "nearest" });
  }, [selectedVehicleId]);

  return (
    <>
      <MetricCards className={costStyles.metrics} metrics={[
        { label: "项目当月配件费", value: moneyText(report.totalAmount), unit: "元", detail: report.month },
        { label: "有配件记录的车辆", value: report.vehicles.length, unit: "辆", tone: "teal" },
      ]} />
      <ChartPanel title="车辆配件费用排行">
        {ranked.length ? (
          <Chart label="当月车辆配件费用排行，展示前十辆" height={Math.max(180, 46 + ranked.length * 32)}
            onSeriesClick={(index) => setSelectedVehicleId(ranked[index]?.vehicleId)} option={{
              color: ["#1677ff"],
              tooltip: { trigger: "axis", renderMode: "richText", confine: true },
              grid: { left: 8, top: 16, right: 26, bottom: 12, outerBoundsMode: "auto" },
              xAxis: { type: "value", min: 0, name: "元" },
              yAxis: { type: "category", inverse: true, data: ranked.map(({ plate }) => plate) },
              series: [{
                name: "配件费", type: "bar", barMaxWidth: 18, cursor: "pointer",
                data: ranked.map(({ amount, vehicleId }) => ({
                  value: Number(amount), itemStyle: { color: selectedVehicleId === vehicleId ? "#0958d9" : "#4096ff", borderRadius: [0, 4, 4, 0] },
                })),
                tooltip: { valueFormatter: (_value, index) => `${moneyText(ranked[index]?.amount)} 元` },
              }],
            }} />
        ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="该月暂无配件记录" />}
      </ChartPanel>
      {report.vehicles.length > 0 && (
        <ChartPanel title="项目车辆花费">
          <Table<ProjectCostVehicle> rowKey="vehicleId" size="middle" dataSource={report.vehicles}
            scroll={{ x: 460 }} pagination={{ pageSize: 10, hideOnSinglePage: true }} columns={[
              { title: "车牌", dataIndex: "plate" },
              { title: "配件记录数", dataIndex: "count", align: "right", width: 130 },
              { title: "金额（元）", dataIndex: "amount", align: "right", width: 145, render: moneyText },
              { title: "明细", width: 95, render: (_, row) => (
                <Button type="link" size="small" aria-pressed={selectedVehicleId === row.vehicleId}
                  onClick={() => setSelectedVehicleId(row.vehicleId)}>查看</Button>
              ) },
            ]} />
        </ChartPanel>
      )}
      {selected && (
        <div ref={details}>
          <PartCostDetails key={selected.vehicleId} vehicleId={selected.vehicleId} projectId={report.projectId}
            month={report.month} title={`${selected.plate} · ${report.month} 配件明细`} />
        </div>
      )}
    </>
  );
}

export function PartsCostReport({ initialMonth }: { initialMonth: string }) {
  const { companyId } = useAppNavigation();
  const [scope, setScope] = useState<"vehicle" | "project">("vehicle");
  const [vehicleId, setVehicleId] = useState<string>();
  const [projectId, setProjectId] = useState<string>();
  const [month, setMonth] = useState(initialMonth);
  const { vehicles, projects, vehicleOptions, projectOptions } = usePartOptions();
  const params = new URLSearchParams({ scope });
  if (scope === "vehicle" && vehicleId) params.set("vehicleId", vehicleId);
  if (scope === "project" && projectId) {
    params.set("projectId", projectId);
    params.set("month", month);
  }
  const path = `/api/parts/costs?${params}`;
  const selected = scope === "vehicle" ? vehicleId : projectId;
  const options = scope === "vehicle" ? vehicles : projects;
  const report = useQuery({
    queryKey: ["parts", "costs", companyId, path],
    queryFn: ({ signal }) => apiFetch<PartCostReport>(path, { signal }),
    enabled: !!selected,
  });

  return (
    <AdminPage title="配件成本" className={`${styles.report} ${costStyles.costReport}`}>
      <div className={costStyles.filters}>
        <Segmented<"vehicle" | "project"> aria-label="统计方式" value={scope} onChange={setScope}
          options={[{ label: "按车牌", value: "vehicle" }, { label: "按项目", value: "project" }]} />
        {scope === "vehicle" ? (
          <Select<string> aria-label="车牌" className={costStyles.selector} showSearch allowClear optionFilterProp="label"
            placeholder="选择车牌" value={vehicleId} options={vehicleOptions} loading={vehicles.isPending} onChange={setVehicleId} />
        ) : (
          <>
            <Select<string> aria-label="项目" className={costStyles.selector} showSearch allowClear optionFilterProp="label"
              placeholder="选择项目" value={projectId} loading={projects.isPending} onChange={setProjectId}
              options={[...(projectOptions ?? []), { label: "未分配项目", value: PART_PROJECT_UNASSIGNED }]} />
            <DatePicker aria-label="统计月份" className={costStyles.month} picker="month" format="YYYY-MM" allowClear={false}
              value={dayjs(`${month}-01`)} onChange={(value) => { if (value) setMonth(value.format("YYYY-MM")); }} />
          </>
        )}
      </div>
      {options.isError && <QueryError error={options.error} retry={() => void options.refetch()} />}
      {!selected ? (
        <div className={`${styles.panel} ${styles.chartEmpty}`}>
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={scope === "vehicle" ? "选择车牌查看配件成本" : "选择项目查看当月车辆花费"} />
        </div>
      ) : report.data ? (
        report.data.scope === "vehicle" ? <SingleVehicleCosts key={path} report={report.data} /> : <ProjectCosts key={path} report={report.data} />
      ) : <ReportPending failed={report.isError} onRetry={() => void report.refetch()} />}
    </AdminPage>
  );
}
