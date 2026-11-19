"use client";

import { PlusOutlined, ReloadOutlined, KeyOutlined } from "@ant-design/icons";
import { Alert, App, Button, Card, Form, Input, Modal, Select, Space, Switch, Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AdminPage } from "@/components/admin-page";
import { useAppNavigation } from "@/components/app-navigation";
import { CompanySelect } from "@/components/company-select";
import { apiFetch, jsonRequest } from "@/lib/api-client";
import { companyUserRoles, hasPermission, roleLabel, type UserRole } from "@/lib/permissions";

type CompanyRole = (typeof companyUserRoles)[number];
type UserRow = {
  id: string;
  username: string;
  name: string;
  role: UserRole;
  companyId: string | null;
  companyName: string | null;
  isActive: boolean;
  createdAt: string;
};

type CreateValues = { username: string; password: string; role: CompanyRole; companyId?: string };
type PasswordValues = { password: string };
const roleOptions = companyUserRoles.map((role) => ({ value: role, label: roleLabel(role) }));

export function UserManagement({ initialCompanyId }: { initialCompanyId?: string }) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const { refresh, permissions = [], userId, onSessionEnded, companyName } = useAppNavigation();
  const platform = hasPermission(permissions, "companies:manage");
  const [companyId, setCompanyId] = useState(initialCompanyId);
  const [createForm] = Form.useForm<CreateValues>();
  const [passwordForm] = Form.useForm<PasswordValues>();
  const [createOpen, setCreateOpen] = useState(false);
  const [passwordTarget, setPasswordTarget] = useState<UserRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [savingUser, setSavingUser] = useState("");
  const [formError, setFormError] = useState("");
  const users = useQuery({
    queryKey: ["users", companyId],
    queryFn: ({ signal }) => apiFetch<UserRow[]>(`/api/users${platform && companyId ? `?companyId=${encodeURIComponent(companyId)}` : ""}`, { signal }),
  });

  async function reloadUsers() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["users"] }),
      queryClient.invalidateQueries({ queryKey: ["companies"] }),
      queryClient.invalidateQueries({ queryKey: ["platform-summary"] }),
    ]);
    refresh();
  }

  async function endOwnSession() {
    await queryClient.cancelQueries();
    queryClient.clear();
    if (onSessionEnded) await onSessionEnded();
    else window.location.replace("/login");
  }

  async function createUser(values: CreateValues) {
    setSaving(true);
    setFormError("");
    try {
      await apiFetch<UserRow>("/api/users", jsonRequest("POST", values));
      createForm.resetFields();
      setCreateOpen(false);
      await reloadUsers();
      message.success("账号已创建");
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "创建账号失败");
    } finally {
      setSaving(false);
    }
  }

  async function updateUser(row: UserRow, values: { role: CompanyRole; isActive: boolean; password?: string }) {
    if (row.role === "super_admin") return;
    setSavingUser(row.id);
    try {
      await apiFetch<UserRow>(`/api/users/${encodeURIComponent(row.id)}`, jsonRequest("PUT", values));
      setPasswordTarget(null);
      passwordForm.resetFields();
      message.success(values.password ? "密码已重置，原有登录会话已退出" : "账号权限已更新");
      if (row.id === userId) {
        await endOwnSession();
        return;
      }
      await reloadUsers();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "更新账号失败");
      void users.refetch();
    } finally {
      setSavingUser("");
    }
  }

  const columns: ColumnsType<UserRow> = [
    { title: "账号", dataIndex: "username", key: "username", render: (_, row) => <Space direction="vertical" size={2}><span>{row.name}</span>{row.name !== row.username && <Typography.Text type="secondary">{row.username}</Typography.Text>}</Space> },
    ...(platform ? [{ title: "所属公司", dataIndex: "companyName", key: "companyName", render: (value: string | null) => value ?? "平台管理" }] : []),
    { title: "角色", dataIndex: "role", key: "role", width: 160, render: (role: UserRole, row) => role === "super_admin" ? <Tag color="blue">超级管理员</Tag> : <Select<CompanyRole> aria-label={`${row.username}的角色`} value={role} options={roleOptions} style={{ width: 140 }} loading={savingUser === row.id} disabled={savingUser !== ""} onChange={(nextRole) => void updateUser(row, { role: nextRole, isActive: row.isActive })} /> },
    { title: "状态", dataIndex: "isActive", key: "isActive", width: 120, render: (isActive: boolean, row) => row.role === "super_admin" ? <Tag color="success">启用</Tag> : <Space><Switch checked={isActive} aria-label={`${row.username}${isActive ? "停用" : "启用"}`} loading={savingUser === row.id} disabled={savingUser !== ""} onChange={(nextActive) => { if (row.role !== "super_admin") void updateUser(row, { role: row.role, isActive: nextActive }); }} /><span>{isActive ? "启用" : "停用"}</span></Space> },
    { title: "创建时间", dataIndex: "createdAt", key: "createdAt", width: 140, render: (value: string) => new Date(value).toLocaleDateString("zh-CN") },
    { title: "操作", key: "actions", width: 140, render: (_, row) => row.role === "super_admin" ? <Typography.Text type="secondary">本人在账号菜单改密</Typography.Text> : <Button type="link" icon={<KeyOutlined />} disabled={savingUser !== ""} onClick={() => setPasswordTarget(row)}>重置密码</Button> },
  ];

  return <AdminPage title="账号管理" actions={<Space wrap><Button icon={<ReloadOutlined />} loading={users.isFetching} onClick={() => void users.refetch()}>刷新</Button><Button type="primary" icon={<PlusOutlined />} onClick={() => { createForm.resetFields(); if (platform && companyId) { createForm.setFieldValue("companyId", companyId); createForm.setFieldValue("role", users.data?.some((row) => row.role === "admin" && row.isActive) ? "operator" : "admin"); } setFormError(""); setCreateOpen(true); }}>新增账号</Button></Space>}>
    <Card>
      <Typography.Paragraph type="secondary">{platform ? "管理各公司的账号。超级管理员全平台唯一，只负责公司、账号和业务汇总。" : `${companyName ?? "本公司"}的账号仅能访问本公司数据。`}公司管理员负责本公司账号、档案和台账；录入员可以新增记录、修改自己录入的记录；只读人员可查看台账、档案和报表。每家公司至少保留一名有效管理员。</Typography.Paragraph>
      {platform && <div style={{ marginBottom: 20 }}><CompanySelect value={companyId} onChange={setCompanyId} /></div>}
      {platform && companyId && users.data && !users.data.some((row) => row.role === "admin" && row.isActive) && <Alert type="warning" showIcon message="该公司尚无有效管理员，请新增公司管理员账号。" style={{ marginBottom: 16 }} />}
      {users.isError && <Alert type="error" showIcon message={users.error.message} style={{ marginBottom: 16 }} />}
      <Table<UserRow> rowKey="id" columns={columns} dataSource={users.data ?? []} loading={users.isFetching} pagination={{ defaultPageSize: 20, showSizeChanger: true, showTotal: (total) => `共 ${total} 个账号` }} locale={{ emptyText: "暂无账号" }} scroll={{ x: platform ? 980 : 760 }} />
    </Card>
    <Modal title="新增公司账号" open={createOpen} confirmLoading={saving} onCancel={() => { if (!saving) setCreateOpen(false); }} onOk={() => createForm.submit()} okText="创建" cancelText="取消" destroyOnHidden>
      <Form<CreateValues> form={createForm} layout="vertical" onFinish={createUser} disabled={saving}>
        {platform && <Form.Item name="companyId" label="所属公司" rules={[{ required: true, message: "请选择所属公司" }]}><CompanySelect allowClear={false} placeholder="请选择公司" /></Form.Item>}
        <Form.Item name="username" label="登录账号" extra="登录账号在全平台范围内唯一。" rules={[{ required: true, whitespace: true, message: "请输入登录账号" }]}><Input autoComplete="username" maxLength={128} /></Form.Item>
        <Form.Item name="password" label="初始密码" rules={[{ required: true, min: 8, message: "密码至少需要 8 位" }]}><Input.Password autoComplete="new-password" maxLength={1024} /></Form.Item>
        <Form.Item name="role" label="角色" rules={[{ required: true }]} initialValue="operator"><Select options={roleOptions} /></Form.Item>
        {formError && <Alert type="error" showIcon message={formError} />}
      </Form>
    </Modal>
    <Modal title={passwordTarget ? `重置 ${passwordTarget.name} 的密码` : "重置密码"} open={Boolean(passwordTarget)} confirmLoading={savingUser !== ""} onCancel={() => { setPasswordTarget(null); passwordForm.resetFields(); }} onOk={() => passwordForm.submit()} okText="确认重置" cancelText="取消" destroyOnHidden>
      <Form<PasswordValues> form={passwordForm} layout="vertical" onFinish={(values) => { if (passwordTarget && passwordTarget.role !== "super_admin") void updateUser(passwordTarget, { role: passwordTarget.role, isActive: passwordTarget.isActive, password: values.password }); }}>
        <Form.Item name="password" label="新密码" rules={[{ required: true, min: 8, message: "密码至少需要 8 位" }]}><Input.Password autoComplete="new-password" maxLength={1024} /></Form.Item>
      </Form>
    </Modal>
  </AdminPage>;
}
