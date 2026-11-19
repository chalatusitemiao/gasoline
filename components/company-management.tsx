"use client";

import { EditOutlined, PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, App, Button, Card, Form, Input, Modal, Popconfirm, Radio, Space, Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useState } from "react";
import { AdminPage } from "@/components/admin-page";
import { AppLink } from "@/components/app-navigation";
import { CompanyBillingState, CompanyRenewalDialog } from "@/components/company-renewal-dialog";
import { apiFetch, jsonRequest } from "@/lib/api-client";
import type { Company, CompanyPage } from "@/lib/company";

type CompanyValues = {
  name: string;
  contactName: string;
  contactPhone: string;
  notes: string;
  suspendOnExpiry?: boolean;
  adminUsername?: string;
  adminPassword?: string;
};

export function CompanyManagement() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<CompanyValues>();
  const [keyword, setKeyword] = useState("");
  const [pagination, setPagination] = useState({ page: 1, pageSize: 20 });
  const [editing, setEditing] = useState<Company | null>(null);
  const [renewing, setRenewing] = useState<Company | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingId, setSavingId] = useState("");
  const [formError, setFormError] = useState("");
  const companies = useQuery({
    queryKey: ["companies", "list", keyword, pagination],
    queryFn: ({ signal }) => apiFetch<CompanyPage>(`/api/companies?${new URLSearchParams({ keyword, page: String(pagination.page), pageSize: String(pagination.pageSize) })}`, { signal }),
  });
  const renewalCompany = renewing && (companies.data?.items.find((company) => company.id === renewing.id) ?? renewing);
  const canConfigureExpiry = typeof editing?.suspendOnExpiry === "boolean";

  async function invalidate() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["companies"] }),
      queryClient.invalidateQueries({ queryKey: ["platform-summary"] }),
      queryClient.invalidateQueries({ queryKey: ["users"] }),
    ]);
  }

  function edit(company: Company | null) {
    setEditing(company);
    setFormError("");
    form.resetFields();
    if (company) form.setFieldsValue(company);
    setOpen(true);
  }

  async function save(values: CompanyValues) {
    setSaving(true);
    setFormError("");
    try {
      const company = await apiFetch<Company>(editing ? `/api/companies/${editing.id}` : "/api/companies", jsonRequest(editing ? "PUT" : "POST", editing ? {
        name: values.name,
        contactName: values.contactName ?? "",
        contactPhone: values.contactPhone ?? "",
        notes: values.notes ?? "",
        isActive: canConfigureExpiry ? undefined : editing.isActive,
        suspendOnExpiry: canConfigureExpiry && values.suspendOnExpiry !== editing.suspendOnExpiry ? values.suspendOnExpiry : undefined,
      } : values));
      setOpen(false);
      form.resetFields();
      await invalidate();
      const success = editing ? "公司资料已保存" : "公司和初始管理员已创建";
      message.success(!editing && company.billingStatus === "pending" ? `${success}，登记首笔收款后开通` : success);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "保存失败，请重试");
    } finally {
      setSaving(false);
    }
  }

  async function setActive(company: Company) {
    setSavingId(company.id);
    try {
      await apiFetch<Company>(`/api/companies/${company.id}`, jsonRequest("PUT", {
        name: company.name,
        contactName: company.contactName,
        contactPhone: company.contactPhone,
        notes: company.notes,
        isActive: !company.isActive,
      }));
      await invalidate();
      message.success(company.isActive ? "公司已停用，所属账号已失去业务访问权限" : "公司管理状态已设为启用");
    } catch (error) {
      message.error(error instanceof Error ? error.message : "更新失败，请重试");
    } finally {
      setSavingId("");
    }
  }

  const columns: ColumnsType<Company> = [
    { title: "公司", key: "company", render: (_, row) => <Space direction="vertical" size={2}><Typography.Text strong>{row.name}</Typography.Text><Typography.Text type="secondary">{row.code}</Typography.Text></Space> },
    { title: "联系人", dataIndex: "contactName", render: (value: string) => value || "—" },
    { title: "联系电话", dataIndex: "contactPhone", render: (value: string) => value || "—" },
    { title: "账号 / 有效管理员", key: "accounts", render: (_, row) => <Space direction="vertical" size={2}><span>{row.accountCount} / {row.adminCount}</span>{row.adminCount === 0 && <Typography.Text type="danger">待创建公司管理员</Typography.Text>}</Space> },
    { title: "管理状态", dataIndex: "isActive", render: (value: boolean) => <Tag color={value ? "success" : "default"}>{value ? "启用" : "停用"}</Tag> },
    { title: "租期 / 到期时间", key: "billing", width: 170, render: (_, row) => <CompanyBillingState company={row} /> },
    { title: "备注", dataIndex: "notes", ellipsis: true, render: (value: string) => value || "—" },
    { title: "操作", key: "actions", width: 260, render: (_, row) => <Space wrap>
      <Button type="link" size="small" icon={<EditOutlined />} onClick={() => edit(row)} disabled={savingId !== ""}>编辑</Button>
      <AppLink href={`/users?companyId=${row.id}`}>账号</AppLink>
      {row.billingStatus && <Button type="link" size="small" onClick={() => setRenewing(row)} disabled={savingId !== ""}>收款续费</Button>}
      <Popconfirm title={row.isActive ? `停用 ${row.name}？` : `恢复 ${row.name}？`} description={row.isActive ? "所属账号立即失去业务访问权限，历史数据保留。" : "启用后按公司租期及各账号状态授予访问权限。"} onConfirm={() => setActive(row)} okText={row.isActive ? "停用公司" : "恢复公司"} cancelText="取消">
        <Button type="link" size="small" danger={row.isActive} loading={savingId === row.id} disabled={savingId !== "" && savingId !== row.id}>{row.isActive ? "停用" : "恢复"}</Button>
      </Popconfirm>
    </Space> },
  ];

  return <AdminPage title="公司管理" actions={<Space wrap><Button icon={<ReloadOutlined />} loading={companies.isFetching} onClick={() => void companies.refetch()}>刷新</Button><Button type="primary" icon={<PlusOutlined />} onClick={() => edit(null)}>创建公司</Button></Space>}>
    <Card>
      <Typography.Paragraph type="secondary">每家公司独立管理账号、车辆、司机和加油台账。新公司登记首笔收款后开通。</Typography.Paragraph>
      <Input.Search aria-label="搜索公司" placeholder="搜索公司名称、编号或联系人" allowClear enterButton="搜索" onSearch={(value) => { setKeyword(value.trim()); setPagination((previous) => ({ ...previous, page: 1 })); }} style={{ maxWidth: 420, marginBottom: 20 }} />
      {companies.isError && <Alert type="error" showIcon message={companies.error.message} style={{ marginBottom: 16 }} />}
      <Table<Company> rowKey="id" columns={columns} dataSource={companies.data?.items ?? []} loading={companies.isFetching} scroll={{ x: 1270 }} locale={{ emptyText: "暂无公司，请创建第一家公司" }} pagination={{ current: pagination.page, pageSize: pagination.pageSize, total: companies.data?.total ?? 0, showSizeChanger: true, showTotal: (total) => `共 ${total} 家公司`, onChange: (page, pageSize) => setPagination({ page, pageSize }) }} />
    </Card>
    <Modal title={editing ? `编辑 ${editing.name}` : "创建公司"} open={open} onCancel={() => { if (!saving) setOpen(false); }} onOk={() => form.submit()} confirmLoading={saving} okText={editing ? "保存" : "创建公司和管理员"} cancelText="取消" destroyOnHidden>
      <Form<CompanyValues> form={form} layout="vertical" disabled={saving} onFinish={save} autoComplete="off">
        <Form.Item name="name" label="公司名称" rules={[{ required: true, whitespace: true, message: "请输入公司名称" }]}><Input maxLength={120} /></Form.Item>
        <Form.Item name="contactName" label="联系人"><Input maxLength={80} /></Form.Item>
        <Form.Item name="contactPhone" label="联系电话"><Input maxLength={32} /></Form.Item>
        <Form.Item name="notes" label="备注"><Input.TextArea maxLength={500} rows={2} showCount /></Form.Item>
        {canConfigureExpiry && <Form.Item name="suspendOnExpiry" label="到期处理" extra="选择到期不停用时，启用的公司及账号在租期到期后可继续使用。">
          <Radio.Group options={[{ label: "到期停用", value: true }, { label: "到期不停用", value: false }]} />
        </Form.Item>}
        {!editing && <>
          <Form.Item name="adminUsername" label="初始管理员账号" extra="登录账号在全平台范围内唯一。" rules={[{ required: true, whitespace: true, message: "请输入管理员账号" }]}><Input autoComplete="username" maxLength={128} /></Form.Item>
          <Form.Item name="adminPassword" label="初始管理员密码" rules={[{ required: true, min: 8, message: "密码至少需要 8 位" }]}><Input.Password autoComplete="new-password" maxLength={1024} /></Form.Item>
        </>}
        {formError && <Alert type="error" showIcon message={formError} />}
      </Form>
    </Modal>
    <CompanyRenewalDialog company={renewalCompany} onClose={() => setRenewing(null)} />
  </AdminPage>;
}
