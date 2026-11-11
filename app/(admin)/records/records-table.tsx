"use client";

import { DownloadOutlined, HistoryOutlined } from "@ant-design/icons";
import { ProForm, ProFormCheckbox, ProFormSelect, ProFormText, ProTable, type ProColumns } from "@ant-design/pro-components";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { App, Button, Card, Form, Space, Statistic } from "antd";
import { useState } from "react";
import {
  AnomalyTag, anomalyText, FuelPage, FULL_TANK_NOTE, fuelText, moneyText, numberText,
  QueryError, tablePagination, type Pagination,
} from "@/components/fuel/ui";
import shared from "@/components/fuel/ui.module.css";
import { apiFetch } from "@/lib/api-client";
import { FUEL_PAGE_SIZE, type FuelOptions, type FuelRecord, type FuelRecordsPage } from "@/lib/fuel";
import { downloadSheet } from "@/lib/spreadsheet-client";
import { DeletionLog } from "./deletion-log";
import { RecordDrawer } from "./record-drawer";
import styles from "./records.module.css";

type Filters = {
  from?: string;
  to?: string;
  vehicleId?: string;
  driverId?: string;
  keyword?: string;
  anomaliesOnly?: boolean;
};

const columns: ProColumns<FuelRecord>[] = [
  { title: "加油日期", dataIndex: "date", width: 112 },
  { title: "车牌", dataIndex: "plate", width: 115 },
  { title: "司机", dataIndex: "driverName", width: 116, ellipsis: true, render: (_, row) => row.driverName || "—" },
  { title: "加油量（L）", dataIndex: "liters", width: 108, align: "right", renderText: (value: string) => numberText(value, 3) },
  { title: "金额（元）", dataIndex: "amount", width: 112, align: "right", renderText: moneyText },
  { title: "单价（元/L）", dataIndex: "unitPrice", width: 122, align: "right", renderText: (value: string) => numberText(value, 6) },
  { title: "里程表（km）", dataIndex: "odometer", width: 118, align: "right", renderText: (value: string) => numberText(value) },
  { title: "区间里程（km）", dataIndex: "distance", width: 128, align: "right", renderText: (value: string | null) => numberText(value) },
  { title: "油耗（L/100km）", dataIndex: "consumption", width: 136, align: "right", renderText: (value: string | null) => numberText(value) },
  { title: "状态", width: 110, render: (_, row) => <AnomalyTag reason={row.anomalyReason} /> },
];

function loadRecords(filters: Filters, pagination: Pagination, signal?: AbortSignal) {
  const params = new URLSearchParams({
    page: String(pagination.page),
    pageSize: String(pagination.pageSize),
  });
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.vehicleId) params.set("vehicleId", filters.vehicleId);
  if (filters.driverId) params.set("driverId", filters.driverId);
  if (filters.keyword) params.set("keyword", filters.keyword);
  if (filters.anomaliesOnly) params.set("anomaliesOnly", "true");
  return apiFetch<FuelRecordsPage>(`/api/fuel/records?${params}`, { signal });
}

const exportHeadings = [
  "加油日期", "车牌", "司机", "油品", "加油量（L）", "单价（元/L）", "金额（元）",
  "里程表（km）", "区间里程（km）", "油耗（L/100km）", "异常标签", "录入人", "备注",
];

function excelNumber(value: string | null) {
  if (value == null) return null;
  const significant = value.replace(/\D/g, "").replace(/^0+|0+$/g, "");
  return significant.length > 15 ? value : Number(value);
}

function exportRow(row: FuelRecord) {
  return [
    row.date, row.plate, row.driverName, fuelText(row.fuelType), excelNumber(row.liters),
    excelNumber(row.unitPrice), excelNumber(row.amount), excelNumber(row.odometer),
    excelNumber(row.distance), excelNumber(row.consumption),
    anomalyText(row.anomalyReason), row.createdBy, row.notes,
  ];
}

export function RecordsTable({
  today, timeZone, anomaliesOnly,
}: {
  today: string;
  timeZone: string;
  anomaliesOnly: boolean;
}) {
  const { message, modal } = App.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<Filters>();
  const [pagination, setPagination] = useState({ page: 1, pageSize: FUEL_PAGE_SIZE });
  const [filters, setFilters] = useState<Filters>({ anomaliesOnly });
  const [drawer, setDrawer] = useState<{ id: string; editing: boolean } | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const options = useQuery({
    queryKey: ["fuel", "options"],
    queryFn: ({ signal }) => apiFetch<FuelOptions>("/api/fuel/options", { signal }),
  });
  const records = useQuery({
    queryKey: ["fuel", "records", filters, pagination] as const,
    queryFn: ({ signal }) => loadRecords(filters, pagination, signal),
    placeholderData: (previous, query) =>
      query?.queryKey[2] === filters && query.queryKey[3].pageSize === pagination.pageSize
        ? previous
        : undefined,
  });
  const summary = records.data?.summary;

  function filter(values: Filters) {
    if (values.from && values.to && values.from > values.to) {
      form.setFields([{ name: "to", errors: ["结束日期不能早于开始日期"] }]);
      return;
    }
    setFilters({ ...values, keyword: values.keyword?.trim() });
    setPagination((previous) => ({ ...previous, page: 1 }));
  }

  function reset() {
    form.resetFields();
    form.setFieldValue("anomaliesOnly", false);
    setFilters({});
    setPagination((previous) => ({ ...previous, page: 1 }));
  }

  function confirmDelete(row: FuelRecord) {
    modal.confirm({
      title: "删除加油记录？",
      content: `${row.date} · ${row.plate} · ${numberText(row.liters, 3)} L。删除后可在删除日志查看。`,
      okText: "删除",
      cancelText: "取消",
      okType: "danger",
      onOk: async () => {
        try {
          await apiFetch(`/api/fuel/records/${encodeURIComponent(row.id)}`, { method: "DELETE" });
          if (records.data?.items.length === 1 && pagination.page > 1) {
            setPagination((previous) => ({ ...previous, page: previous.page - 1 }));
          }
          setDrawer((previous) => previous?.id === row.id ? null : previous);
          void queryClient.invalidateQueries({ queryKey: ["fuel"] });
          message.success("加油记录已删除。");
        } catch (error) {
          message.error(error instanceof Error ? error.message : "删除失败。");
          throw error;
        }
      },
    });
  }

  async function exportRecords() {
    setExporting(true);
    try {
      const pageSize = 100;
      const first = await loadRecords(filters, { page: 1, pageSize });
      if (!first.items.length) {
        message.info("没有符合条件的加油记录。");
        return;
      }
      const byId = new Map(first.items.map((record) => [record.id, record]));
      const last = Math.ceil(first.total / pageSize);
      for (let page = 2; page <= last; page += 1) {
        const next = await loadRecords(filters, { page, pageSize });
        for (const record of next.items) byId.set(record.id, record);
      }
      await downloadSheet(`加油明细_${today}.xlsx`, "加油明细", [
        exportHeadings,
        ...Array.from(byId.values(), exportRow),
      ]);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "导出失败。");
    } finally {
      setExporting(false);
    }
  }

  const recordColumns: ProColumns<FuelRecord>[] = [
    ...columns,
    {
      title: "操作",
      width: 154,
      fixed: "right",
      render: (_, row) => (
        <Space size={0}>
          <Button size="small" type="link" onClick={() => setDrawer({ id: row.id, editing: false })}>详情</Button>
          <Button size="small" type="link" onClick={() => setDrawer({ id: row.id, editing: true })}>修改</Button>
          <Button size="small" type="link" danger onClick={() => confirmDelete(row)}>删除</Button>
        </Space>
      ),
    },
  ];

  return (
    <FuelPage title="加油记录" actions={
      <Space wrap>
        <Button icon={<HistoryOutlined />} onClick={() => setLogOpen(true)}>删除日志</Button>
        <Button icon={<DownloadOutlined />} loading={exporting} onClick={() => { void exportRecords(); }}>导出明细</Button>
      </Space>
    }>
      <Card className={shared.section}>
        {options.error && <QueryError error={options.error} retry={() => { void options.refetch(); }} />}
        <ProForm<Filters> form={form} initialValues={{ anomaliesOnly }} onFinish={filter} submitter={false}>
          <div className={styles.filters}>
            <ProFormText name="from" label="开始日期" fieldProps={{ type: "date", max: today }} />
            <ProFormText name="to" label="结束日期" fieldProps={{ type: "date", max: today }} />
            <ProFormSelect
              name="vehicleId" label="车辆" placeholder="全部车辆" showSearch
              options={options.data?.vehicles.map((row) => ({ label: row.plate, value: row.id }))}
              fieldProps={{ optionFilterProp: "label", loading: options.isPending }}
            />
            <ProFormSelect
              name="driverId" label="司机" placeholder="全部司机" showSearch
              options={options.data?.drivers.map((row) => ({
                label: row.isActive ? row.name : `${row.name}（停用）`,
                value: row.id,
              }))}
              fieldProps={{ optionFilterProp: "label", loading: options.isPending }}
            />
            <ProFormText name="keyword" label="关键词" placeholder="车牌、司机、备注" fieldProps={{ maxLength: 100, allowClear: true }} />
          </div>
          <div className={styles.filterActions}>
            <ProFormCheckbox name="anomaliesOnly" formItemProps={{ style: { marginBottom: 0 } }}>仅异常</ProFormCheckbox>
            <Space>
              <Button onClick={reset}>重置</Button>
              <Button type="primary" htmlType="submit">查询</Button>
            </Space>
          </div>
        </ProForm>
      </Card>

      <div className={styles.summary} role="group" aria-label="筛选结果汇总">
        <Statistic title="记录数" value={numberText(summary?.recordCount, 0)} suffix="条" />
        <Statistic title="加油量" value={numberText(summary?.totalLiters, 3)} suffix="L" />
        <Statistic title="加油金额" value={moneyText(summary?.totalAmount)} suffix="元" />
        <Statistic title="平均油耗" value={numberText(summary?.averageConsumption)} suffix="L/100km" />
        <Statistic title="行驶里程" value={numberText(summary?.totalDistance)} suffix="km" />
      </div>
      <p className={styles.note}>{FULL_TANK_NOTE}</p>

      {records.error && <QueryError error={records.error} retry={() => { void records.refetch(); }} />}
      <ProTable<FuelRecord>
        className={`${shared.table} ${styles.recordTable}`}
        rowKey="id"
        columns={recordColumns}
        dataSource={records.data?.items ?? []}
        loading={records.isFetching}
        search={false}
        options={false}
        toolBarRender={false}
        scroll={{ x: 1400 }}
        pagination={tablePagination(pagination, records.data?.total ?? 0, setPagination)}
        locale={{ emptyText: records.error ? "无法加载加油记录" : "暂无符合条件的加油记录" }}
      />
      <RecordDrawer
        id={drawer?.id ?? null}
        editing={drawer?.editing ?? false}
        today={today}
        timeZone={timeZone}
        onEdit={() => setDrawer((previous) => previous && { ...previous, editing: true })}
        onCancelEdit={() => setDrawer((previous) => previous && { ...previous, editing: false })}
        onClose={() => setDrawer(null)}
      />
      <DeletionLog open={logOpen} timeZone={timeZone} onClose={() => setLogOpen(false)} />
    </FuelPage>
  );
}
