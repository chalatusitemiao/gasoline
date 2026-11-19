"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, App, Col, Form, Input, InputNumber, Modal, Row, Space, Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import Decimal from "decimal.js";
import { useRef, useState } from "react";
import { moneyText, QueryError, stampText } from "@/components/fuel/ui";
import { apiFetch, jsonRequest } from "@/lib/api-client";
import type { Company, CompanyRenewal, CompanyRenewalPage } from "@/lib/company";

const billingStates = {
  unmanaged: { label: "未设置租期", color: "default" },
  pending: { label: "待开通", color: "warning" },
  active: { label: "租期有效", color: "success" },
  expired: { label: "已到期", color: "error" },
} satisfies Record<Company["billingStatus"], { label: string; color: string }>;

const historyPageSize = 5;
const amountPattern = /^\d{1,10}(?:\.\d{1,2})?$/;
const historyColumns: ColumnsType<CompanyRenewal> = [
  { title: "实收（元）", dataIndex: "amount", align: "right", width: 120, render: (amount: string) => moneyText(amount) },
  { title: "续费月数", dataIndex: "months", align: "right", width: 90 },
  { title: "租期", key: "period", width: 200, render: (_, renewal) => (
    <Space direction="vertical" size={2}>
      <span>起 {stampText(renewal.startsAt)}</span>
      <span>止 {stampText(renewal.endsAt)}</span>
    </Space>
  ) },
  { title: "登记时间", dataIndex: "recordedAt", width: 165, render: (value: string) => stampText(value) },
  { title: "经办人", dataIndex: "recordedBy", ellipsis: true },
];

type RenewalValues = { amount: string; months: number };

function createPaymentRequestId() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();

  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function CompanyBillingState({ company }: { company: Company }) {
  const status = billingStates[company.billingStatus];
  if (!status) return <Typography.Text type="secondary">—</Typography.Text>;
  return <Space direction="vertical" size={2}>
    <Tag color={status.color}>{status.label}</Tag>
    {company.paidUntil && <Typography.Text type="secondary">{stampText(company.paidUntil)}</Typography.Text>}
  </Space>;
}

export function CompanyRenewalDialog({ company, onClose }: { company: Company | null; onClose: () => void }) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<RenewalValues>();
  const [page, setPage] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const pendingRequestIds = useRef(new Map<string, string>());
  const submitting = useRef(false);
  const historyKey = ["company-renewals", company?.id];
  const endpoint = `/api/companies/${company?.id}/renewals`;
  const history = useQuery({
    queryKey: [...historyKey, page],
    enabled: company !== null,
    queryFn: ({ signal }) => apiFetch<CompanyRenewalPage>(`${endpoint}?page=${page}&pageSize=${historyPageSize}`, { signal }),
  });

  if (!company) return null;

  function close() {
    if (submitting.current) return;
    form.resetFields();
    setError("");
    setPage(1);
    onClose();
  }

  async function save(values: RenewalValues) {
    if (submitting.current) return;
    submitting.current = true;
    setSaving(true);
    setError("");
    try {
      const amount = new Decimal(values.amount.trim()).toFixed(2);
      const attempt = `${endpoint}:${amount}:${values.months}`;
      const requestId = pendingRequestIds.current.get(attempt) ?? createPaymentRequestId();
      pendingRequestIds.current.set(attempt, requestId);
      const renewal = await apiFetch<CompanyRenewal>(endpoint, jsonRequest("POST", { requestId, amount, months: values.months }));
      pendingRequestIds.current.delete(attempt);
      form.resetFields();
      setPage(1);
      void queryClient.invalidateQueries({ queryKey: ["companies", "list"] });
      void queryClient.invalidateQueries({ queryKey: historyKey });
      message.success(`已登记收款，续费至 ${stampText(renewal.endsAt)}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "收款登记失败，请重试");
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  }

  return <Modal
    title={`收款续费 · ${company.name}`}
    width={820}
    open
    onCancel={close}
    onOk={() => form.submit()}
    confirmLoading={saving}
    closable={!saving}
    maskClosable={!saving}
    keyboard={!saving}
    okText="登记并续费"
    cancelText="关闭"
    cancelButtonProps={{ disabled: saving }}
  >
    {company.paidUntil && <Typography.Paragraph>当前到期时间为 <Typography.Text strong>{stampText(company.paidUntil)}</Typography.Text>。</Typography.Paragraph>}
    <Typography.Paragraph type="secondary">
      有效期内续费从当前到期时间顺延，首次开通或到期后续费从登记时间起算。以下时间均为北京时间。
    </Typography.Paragraph>
    {!company.isActive && <Alert type="warning" showIcon message="公司已手动停用，可在续费后通过公司管理恢复使用。" style={{ marginBottom: 16 }} />}
    <Form<RenewalValues> form={form} layout="vertical" disabled={saving} autoComplete="off" onFinish={save}>
      <Row gutter={16}>
        <Col xs={24} sm={12}>
          <Form.Item name="amount" label="实收金额（元）" rules={[
            { required: true, whitespace: true, message: "请输入实收金额" },
            { validator: (_, value?: string) => {
              const amount = value?.trim();
              return !amount || (amountPattern.test(amount) && Number(amount) > 0)
                ? Promise.resolve()
                : Promise.reject(new Error("请输入 0.01–9999999999.99 元，最多两位小数"));
            } },
          ]}>
            <Input inputMode="decimal" maxLength={13} placeholder="例如 300.00" />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12}>
          <Form.Item name="months" label="续费月数" rules={[{ required: true, type: "integer", min: 1, max: 120, message: "请输入 1–120 的整数" }]}>
            <InputNumber inputMode="numeric" style={{ width: "100%" }} />
          </Form.Item>
        </Col>
      </Row>
    </Form>
    {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}
    <Typography.Title level={5}>续费记录</Typography.Title>
    {history.error && <QueryError error={history.error} retry={() => { void history.refetch(); }} />}
    <Table<CompanyRenewal>
      size="small"
      rowKey="id"
      columns={historyColumns}
      dataSource={history.data?.items ?? []}
      loading={history.isFetching}
      scroll={{ x: 690 }}
      locale={{ emptyText: "暂无续费记录" }}
      pagination={{ current: page, pageSize: historyPageSize, total: history.data?.total ?? 0, showSizeChanger: false, onChange: setPage }}
    />
  </Modal>;
}
