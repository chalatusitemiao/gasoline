"use client";

import { ReloadOutlined } from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import { Alert, Button, Card, DatePicker, Descriptions, Space, Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useState } from "react";
import Decimal from "decimal.js";
import { AdminPage } from "@/components/admin-page";
import { CompanySelect } from "@/components/company-select";
import { apiFetch } from "@/lib/api-client";
import type { CompanySummary, PlatformSummary } from "@/lib/company";

function formatDecimal(value: string, digits: number) {
  const [whole, fraction] = new Decimal(value).toFixed(digits).split(".");
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${fraction ? `.${fraction}` : ""}`;
}

export function PlatformOverview() {
  const [companyId, setCompanyId] = useState<string>();
  const [range, setRange] = useState<{ from?: string; to?: string }>({});
  const summary = useQuery({
    queryKey: ["platform-summary", companyId, range],
    queryFn: ({ signal }) => {
      const query = new URLSearchParams();
      if (companyId) query.set("companyId", companyId);
      if (range.from) query.set("from", range.from);
      if (range.to) query.set("to", range.to);
      return apiFetch<PlatformSummary>(`/api/platform/summary?${query}`, { signal });
    },
  });
  const columns: ColumnsType<CompanySummary> = [
    { title: "公司", key: "company", fixed: "left", width: 220, render: (_, row) => <Space direction="vertical" size={2}><Typography.Text strong>{row.companyName}</Typography.Text><Typography.Text type="secondary">{row.companyCode}</Typography.Text></Space> },
    { title: "状态", dataIndex: "isActive", width: 90, render: (value: boolean) => <Tag color={value ? "success" : "default"}>{value ? "启用" : "停用"}</Tag> },
    { title: "账号", dataIndex: "accountCount", align: "right" },
    { title: "车辆", dataIndex: "vehicleCount", align: "right" },
    { title: "司机", dataIndex: "driverCount", align: "right" },
    { title: "加油笔数", dataIndex: "recordCount", align: "right" },
    { title: "加油总量（升）", dataIndex: "totalLiters", align: "right", render: (value: string) => formatDecimal(value, 3) },
    { title: "加油总金额（元）", dataIndex: "totalAmount", align: "right", render: (value: string) => formatDecimal(value, 2) },
    { title: "异常记录", dataIndex: "anomalyCount", align: "right" },
  ];
  const total = summary.data?.total;

  return <AdminPage title="平台业务汇总" actions={<Button icon={<ReloadOutlined />} loading={summary.isFetching} onClick={() => void summary.refetch()}>刷新</Button>}>
    <Card>
      <Typography.Paragraph type="secondary">查看各公司的经营汇总。日期筛选仅作用于加油笔数、油量、金额和异常记录；账号、车辆、司机为当前档案数量。停用公司的历史数据仍计入汇总。</Typography.Paragraph>
      <Space wrap style={{ marginBottom: 24 }}>
        <CompanySelect value={companyId} onChange={setCompanyId} />
        <DatePicker.RangePicker aria-label="业务汇总日期范围" format="YYYY-MM-DD" onChange={(dates) => setRange(dates ? { from: dates[0]?.format("YYYY-MM-DD"), to: dates[1]?.format("YYYY-MM-DD") } : {})} />
        <Typography.Text type="secondary">{range.from ? `${range.from} 至 ${range.to}` : "全部业务日期"}</Typography.Text>
      </Space>
      {summary.isError && <Alert type="error" showIcon message={summary.error.message} style={{ marginBottom: 20 }} />}
      {total && <Descriptions size="small" column={{ xs: 1, sm: 2, md: 3, xl: 4 }} style={{ marginBottom: 24 }} items={[
        { key: "company", label: "公司数", children: total.companyCount },
        { key: "account", label: "账号数", children: total.accountCount },
        { key: "vehicle", label: "车辆数", children: total.vehicleCount },
        { key: "driver", label: "司机数", children: total.driverCount },
        { key: "records", label: "加油笔数", children: total.recordCount },
        { key: "liters", label: "加油总量", children: `${formatDecimal(total.totalLiters, 3)} 升` },
        { key: "amount", label: "加油总金额", children: `${formatDecimal(total.totalAmount, 2)} 元` },
        { key: "anomalies", label: "异常记录数", children: total.anomalyCount },
      ]} />}
      <Table<CompanySummary> rowKey="companyId" columns={columns} dataSource={summary.data?.items ?? []} loading={summary.isFetching} scroll={{ x: 1120 }} pagination={{ defaultPageSize: 20, showSizeChanger: true, showTotal: (count) => `共 ${count} 家公司` }} locale={{ emptyText: "暂无匹配的公司" }} />
    </Card>
  </AdminPage>;
}
