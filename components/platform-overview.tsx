"use client";

import { ReloadOutlined } from "@ant-design/icons";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Alert, Button, Card, DatePicker, Skeleton, Spin, Table, Tag, Typography, type TableColumnsType } from "antd";
import Decimal from "decimal.js";
import { lazy, Suspense, useState } from "react";
import { AdminPage } from "@/components/admin-page";
import { CompanySelect } from "@/components/company-select";
import { moneyText } from "@/components/fuel/ui";
import { formatNumber, MetricCards } from "@/components/reports/report-ui";
import { apiFetch } from "@/lib/api-client";
import type { CompanySummary, PlatformSummary } from "@/lib/company";
import styles from "./platform-overview.module.css";

const PlatformComparison = lazy(() => import("./platform-overview-charts").then(({ PlatformComparison }) => ({ default: PlatformComparison })));
const PlatformAmountShare = lazy(() => import("./platform-overview-charts").then(({ PlatformAmountShare }) => ({ default: PlatformAmountShare })));

function litersText(value: string) {
  const [whole, fraction] = new Decimal(value).toFixed(3).split(".");
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${fraction}`;
}

const companyColumns: TableColumnsType<CompanySummary> = [
  {
    title: "公司", key: "company", fixed: "left", width: 220,
    render: (_, row) => (
      <div className={styles.companyName}>
        <Typography.Text strong>{row.companyName}</Typography.Text>
        <Typography.Text type="secondary">{row.companyCode}</Typography.Text>
      </div>
    ),
  },
  { title: "状态", dataIndex: "isActive", width: 90, render: (value: boolean) => <Tag color={value ? "success" : "default"}>{value ? "启用" : "停用"}</Tag> },
  { title: "账号", dataIndex: "accountCount", align: "right" },
  { title: "车辆", dataIndex: "vehicleCount", align: "right" },
  { title: "司机", dataIndex: "driverCount", align: "right" },
  { title: "加油笔数", dataIndex: "recordCount", align: "right" },
  { title: "加油量（升）", dataIndex: "totalLiters", align: "right", render: litersText },
  { title: "加油金额（元）", dataIndex: "totalAmount", align: "right", render: moneyText },
  { title: "异常记录", dataIndex: "anomalyCount", align: "right" },
];

function ArchiveSummary({ total }: { total: PlatformSummary["total"] }) {
  const counts = [
    { label: "公司", value: total.companyCount, unit: "家" },
    { label: "账号", value: total.accountCount, unit: "个" },
    { label: "车辆", value: total.vehicleCount, unit: "辆" },
    { label: "司机", value: total.driverCount, unit: "人" },
  ];

  return (
    <Card title={<h2 className={styles.sectionTitle}>当前档案</h2>} className={styles.archiveCard}>
      <dl className={styles.archiveGrid}>
        {counts.map(({ label, value, unit }) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{formatNumber(value)} <small>{unit}</small></dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

function PlatformSummaryContent({ data, refreshing }: { data: PlatformSummary; refreshing: boolean }) {
  const { items, total } = data;
  const anomalyShare = total.recordCount > 0
    ? `占加油记录 ${formatNumber(total.anomalyCount / total.recordCount * 100)}%`
    : undefined;

  return (
    <div className={styles.content}>
      <MetricCards className={styles.metrics} metrics={[
        { label: "加油总金额", value: moneyText(total.totalAmount), unit: "元" },
        { label: "加油总量", value: litersText(total.totalLiters), unit: "升" },
        { label: "加油笔数", value: total.recordCount, unit: "笔" },
        { label: "异常记录", value: total.anomalyCount, unit: "条", detail: anomalyShare },
      ]} />

      <Suspense fallback={<Card role="status" aria-label="正在加载公司对比图"><Skeleton active paragraph={{ rows: 4 }} /></Card>}>
        <PlatformComparison items={items} />
      </Suspense>

      <div className={styles.secondary}>
        <Suspense fallback={<Card role="status" aria-label="正在加载金额占比图"><Skeleton active paragraph={{ rows: 3 }} /></Card>}>
          <PlatformAmountShare items={items} totalAmount={total.totalAmount} />
        </Suspense>
        <ArchiveSummary total={total} />
      </div>

      <Card title={<h2 className={styles.sectionTitle}>公司明细</h2>} className={styles.details}>
        <Table<CompanySummary>
          rowKey="companyId"
          columns={companyColumns}
          dataSource={items}
          loading={refreshing}
          scroll={{ x: 1120 }}
          pagination={{ defaultPageSize: 20, showSizeChanger: true, showTotal: (count) => `共 ${count} 家公司` }}
          locale={{ emptyText: "暂无匹配的公司" }}
        />
      </Card>
    </div>
  );
}

export function PlatformOverview() {
  const [companyId, setCompanyId] = useState<string>();
  const [range, setRange] = useState({ from: "", to: "" });
  const summary = useQuery({
    queryKey: ["platform-summary", companyId, range],
    queryFn: ({ signal }) => {
      const query = new URLSearchParams();
      if (companyId) query.set("companyId", companyId);
      if (range.from) query.set("from", range.from);
      if (range.to) query.set("to", range.to);
      return apiFetch<PlatformSummary>(`/api/platform/summary?${query}`, { signal });
    },
    placeholderData: keepPreviousData,
  });

  return (
    <AdminPage
      title="平台业务汇总"
      className={styles.overview}
      actions={<Button icon={<ReloadOutlined />} loading={summary.isFetching} onClick={() => void summary.refetch()}>刷新</Button>}
    >
      <div className={styles.filterBar}>
        <div className={styles.filters} role="group" aria-label="业务汇总筛选">
          <div className={styles.companyFilter}>
            <CompanySelect value={companyId} onChange={setCompanyId} style={{ width: "100%", minWidth: 0 }} />
          </div>
          <DatePicker.RangePicker
            className={styles.rangeFilter}
            aria-label="业务汇总日期范围"
            format="YYYY-MM-DD"
            onChange={(_, [from, to]) => setRange({ from, to })}
          />
        </div>
        <Typography.Text type="secondary" className={styles.filterNote}>
          日期只筛选加油数据。停用公司的历史记录仍计入汇总。
        </Typography.Text>
      </div>

      {summary.isError && <Alert type="error" showIcon message={summary.error.message} />}
      {summary.isPending && (
        <Card role="status" aria-label="正在加载平台业务汇总"><Skeleton active paragraph={{ rows: 5 }} /></Card>
      )}
      {summary.data && (
        <Spin spinning={summary.isPlaceholderData} tip="正在更新汇总" wrapperClassName={styles.loading}>
          <PlatformSummaryContent data={summary.data} refreshing={summary.isFetching && !summary.isPlaceholderData} />
        </Spin>
      )}
    </AdminPage>
  );
}
