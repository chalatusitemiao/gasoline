"use client";

import { HistoryOutlined, PlusOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { App, Button, Card, Form, Input, Modal, Select, Space, Table, type TableColumnsType } from "antd";
import { useState } from "react";
import { AdminPage } from "@/components/admin-page";
import { AppLink, useAppNavigation } from "@/components/app-navigation";
import { moneyText, numberText, QueryError, stampText, tablePagination, type Pagination } from "@/components/fuel/ui";
import { apiFetch, jsonRequest } from "@/lib/api-client";
import { FUEL_PAGE_SIZE, type FuelPage } from "@/lib/fuel";
import {
  PART_PROJECT_UNASSIGNED, partDeleteInputSchema, partMonthSchema,
  type PartDeletion, type PartRecord, type PartRecordsPage,
} from "@/lib/parts";
import { DeletedPartDetail, PartDetail } from "./part-detail";
import { usePartOptions } from "./part-options";
import { PartPhotoButton } from "./part-photos";
import styles from "./parts.module.css";

type Filters = { month?: string; vehicleId?: string; projectId?: string };
type DetailTarget = { id: string; editing: boolean };

const initialPagination = { page: 1, pageSize: FUEL_PAGE_SIZE };
const columns: TableColumnsType<PartRecord> = [
  { title: "购买日期", dataIndex: "date", width: 112 },
  { title: "车牌", dataIndex: "plate", width: 120 },
  { title: "配件名称", dataIndex: "name", width: 160, ellipsis: true },
  { title: "项目", dataIndex: "projectName", width: 145, ellipsis: true, render: (value: string | null) => value ?? "未分配项目" },
  { title: "数量", dataIndex: "quantity", width: 90, align: "right", render: (value: string) => numberText(value, 3) },
  { title: "单价（元）", dataIndex: "unitPrice", width: 110, align: "right", render: moneyText },
  { title: "总价（元）", dataIndex: "amount", width: 116, align: "right", render: moneyText },
  { title: "购买地区", dataIndex: "purchaseArea", width: 130, ellipsis: true, render: (value: string) => value || "—" },
  { title: "照片", width: 125, render: (_, row) => <PartPhotoButton photos={row.photos} /> },
];

function paramsFor(pagination: Pagination, filters: Filters = {}) {
  const params = new URLSearchParams({ page: String(pagination.page), pageSize: String(pagination.pageSize) });
  if (filters.month) params.set("month", filters.month);
  if (filters.vehicleId) params.set("vehicleId", filters.vehicleId);
  if (filters.projectId) params.set("projectId", filters.projectId);
  return params;
}

function PartDeletionLog({ timeZone, onClose }: { timeZone: string; onClose: () => void }) {
  const { companyId } = useAppNavigation();
  const [pagination, setPagination] = useState(initialPagination);
  const log = useQuery({
    queryKey: ["parts", "deletions", companyId, pagination],
    queryFn: ({ signal }) => apiFetch<FuelPage<PartDeletion>>(`/api/parts/deletions?${paramsFor(pagination)}`, { signal }),
  });
  const deletionColumns: TableColumnsType<PartDeletion> = [
    { title: "删除时间", dataIndex: "deletedAt", width: 155, render: (value: string) => stampText(value, timeZone) },
    { title: "删除人", dataIndex: "deletedBy", width: 105, ellipsis: true },
    { title: "车牌", dataIndex: "plate", width: 110 },
    { title: "配件名称", dataIndex: "name", width: 145, ellipsis: true },
    { title: "原总价（元）", dataIndex: "amount", width: 110, align: "right", render: moneyText },
    { title: "删除原因", dataIndex: "deletionReason" },
  ];
  return (
    <Modal title="配件记录删除日志" width={1060} open footer={null} onCancel={onClose}>
      {log.error && <QueryError error={log.error} retry={() => { void log.refetch(); }} />}
      <Table
        rowKey="id"
        size="small"
        columns={deletionColumns}
        dataSource={log.data?.items}
        loading={log.isPending}
        expandable={{
          expandedRowRender: (row, _index, _indent, expanded) => expanded ? <DeletedPartDetail record={row} timeZone={timeZone} /> : null,
        }}
        pagination={tablePagination(pagination, log.data?.total ?? 0, setPagination)}
        scroll={{ x: 710 }}
        locale={{ emptyText: "暂无删除记录" }}
      />
    </Modal>
  );
}

function PartDeleteDialog({ record, onClose, onDeleted }: {
  record: PartRecord;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [form] = Form.useForm<{ reason: string }>();
  const remove = useMutation({
    mutationFn: (values: { reason: string }) => apiFetch(
      `/api/parts/records/${encodeURIComponent(record.id)}`, jsonRequest("DELETE", values),
    ),
  });

  async function submit(values: { reason: string }) {
    if (remove.isPending) return;
    const result = partDeleteInputSchema.safeParse(values);
    if (!result.success) {
      form.setFields([{ name: "reason", errors: result.error.issues.map((issue) => issue.message) }]);
      return;
    }
    try {
      await remove.mutateAsync(result.data);
      onDeleted();
    } catch {
      // The mutation error appears in the dialog.
    }
  }

  return (
    <Modal
      title="删除配件记录"
      open
      onCancel={onClose}
      onOk={() => form.submit()}
      confirmLoading={remove.isPending}
      okButtonProps={{ danger: true }}
      okText="删除记录"
      maskClosable={!remove.isPending}
      closable={!remove.isPending}
      keyboard={!remove.isPending}
      cancelButtonProps={{ disabled: remove.isPending }}
    >
      <p>{record.date} · {record.plate} · {record.name} · ¥{moneyText(record.amount)}</p>
      <p className={styles.hint}>删除后，这笔支出将从报表中扣除，原单可在删除日志查看。</p>
      {remove.error && <QueryError error={remove.error} />}
      <Form form={form} onFinish={submit} layout="vertical" disabled={remove.isPending}>
        <Form.Item label="删除原因" name="reason" rules={[{ required: true, message: "请填写删除原因" }]}>
          <Input.TextArea maxLength={500} autoSize={{ minRows: 2, maxRows: 5 }} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

export function PartsRecords({ initialMonth, today, timeZone }: {
  initialMonth: string;
  today: string;
  timeZone: string;
}) {
  const { message } = App.useApp();
  const { companyId, permissions = [], userId } = useAppNavigation();
  const canDelete = permissions.includes("parts:delete");
  const canEditOwn = permissions.includes("parts:edit");
  const queryClient = useQueryClient();
  const [form] = Form.useForm<Filters>();
  const [filters, setFilters] = useState<Filters>({ month: initialMonth });
  const [pagination, setPagination] = useState(initialPagination);
  const [detail, setDetail] = useState<DetailTarget | null>(null);
  const [removing, setRemoving] = useState<PartRecord | null>(null);
  const [viewLog, setViewLog] = useState(false);
  const options = usePartOptions();
  const records = useQuery({
    queryKey: ["parts", "records", companyId, filters, pagination],
    queryFn: ({ signal }) => apiFetch<PartRecordsPage>(`/api/parts/records?${paramsFor(pagination, filters)}`, { signal }),
  });

  function search(values: Filters) {
    if (values.month && !partMonthSchema.safeParse(values.month).success) {
      form.setFields([{ name: "month", errors: ["请选择有效月份"] }]);
      return;
    }
    setFilters(values);
    setPagination((previous) => ({ ...previous, page: 1 }));
  }

  function reset() {
    form.resetFields();
    search({ month: initialMonth });
  }

  function deleted() {
    if (records.data?.items.length === 1 && pagination.page > 1) {
      setPagination((previous) => ({ ...previous, page: previous.page - 1 }));
    }
    if (detail?.id === removing?.id) setDetail(null);
    setRemoving(null);
    void queryClient.invalidateQueries({ queryKey: ["parts"] });
    message.success("配件记录已删除。");
  }

  const recordColumns: TableColumnsType<PartRecord> = [
    ...columns,
    {
      title: "操作",
      width: 150,
      fixed: "right",
      render: (_, row) => (
        <Space size={0}>
          <Button size="small" type="link" onClick={() => setDetail({ id: row.id, editing: false })}>详情</Button>
          {(canDelete || (canEditOwn && row.createdById === userId)) && (
            <Button size="small" type="link" onClick={() => setDetail({ id: row.id, editing: true })}>修改</Button>
          )}
          {canDelete && <Button size="small" type="link" danger onClick={() => setRemoving(row)}>删除</Button>}
        </Space>
      ),
    },
  ];

  return (
    <AdminPage
      title="配件记录"
      actions={
        <Space wrap>
          {canDelete && <Button icon={<HistoryOutlined />} onClick={() => setViewLog(true)}>删除日志</Button>}
          {permissions.includes("parts:create") && (
            <AppLink className={styles.navLink} href="/parts/new"><PlusOutlined /> 录入配件</AppLink>
          )}
        </Space>
      }
    >
      <Card className={styles.filterCard}>
        {options.vehicles.error && <QueryError error={options.vehicles.error} retry={() => { void options.vehicles.refetch(); }} />}
        {options.projects.error && <QueryError error={options.projects.error} retry={() => { void options.projects.refetch(); }} />}
        <Form form={form} layout="vertical" initialValues={{ month: initialMonth }} onFinish={search}>
          <div className={styles.filters}>
            <Form.Item name="vehicleId" label="车牌">
              <Select
                allowClear
                showSearch
                optionFilterProp="label"
                options={options.vehicleOptions}
                loading={options.vehicles.isPending}
                placeholder="全部车辆"
              />
            </Form.Item>
            <Form.Item name="month" label="购买月份">
              <Input type="month" max={initialMonth} />
            </Form.Item>
            <Form.Item name="projectId" label="项目">
              <Select
                allowClear
                showSearch
                optionFilterProp="label"
                options={[{ label: "未分配项目", value: PART_PROJECT_UNASSIGNED }, ...(options.projectOptions ?? [])]}
                loading={options.projects.isPending}
                placeholder="全部项目"
              />
            </Form.Item>
            <Space className={styles.filterActions}>
              <Button onClick={reset}>重置</Button>
              <Button htmlType="submit" type="primary">查询</Button>
            </Space>
          </div>
        </Form>
      </Card>
      <dl className={styles.summary} aria-live="polite">
        <div><dt>筛选记录</dt><dd>{numberText(records.data?.total, 0)} <small>条</small></dd></div>
        <div><dt>配件支出</dt><dd className={styles.summaryAmount}>{moneyText(records.data?.totalAmount)} <small>元</small></dd></div>
      </dl>
      {records.error && <QueryError error={records.error} retry={() => { void records.refetch(); }} />}
      <Table
        className={styles.recordsTable}
        rowKey="id"
        size="middle"
        columns={recordColumns}
        dataSource={records.data?.items}
        loading={records.isPending}
        pagination={tablePagination(pagination, records.data?.total ?? 0, setPagination)}
        scroll={{ x: 1258 }}
        locale={{ emptyText: "暂无符合条件的配件记录" }}
      />
      {detail && (
        <PartDetail
          key={detail.id}
          id={detail.id}
          editing={detail.editing}
          today={today}
          timeZone={timeZone}
          onEdit={() => setDetail({ ...detail, editing: true })}
          onRead={() => setDetail({ ...detail, editing: false })}
          onClose={() => setDetail(null)}
        />
      )}
      {removing && <PartDeleteDialog record={removing} onClose={() => setRemoving(null)} onDeleted={deleted} />}
      {viewLog && <PartDeletionLog timeZone={timeZone} onClose={() => setViewLog(false)} />}
    </AdminPage>
  );
}
