"use client";

import { PlusOutlined, ReloadOutlined, KeyOutlined } from "@ant-design/icons";
import { App, Button, Card, Form, Input, Modal, Select, Space, Switch, Table, Typography } from "antd";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AdminPage } from "@/components/admin-page";
import { useAppNavigation } from "@/components/app-navigation";
import { apiFetch, jsonRequest } from "@/lib/api-client";
import { roleLabel, userRoles, type UserRole } from "@/lib/permissions";

type UserRow = {
  id: string;
  username: string;
  name: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
};

type CreateValues = { username: string; password: string; role: UserRole };
type PasswordValues = { password: string };

const usersKey = ["users"] as const;
const roleOptions = userRoles.map((role) => ({ value: role, label: roleLabel(role) }));

export function UserManagement() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const { refresh } = useAppNavigation();
  const [createForm] = Form.useForm<CreateValues>();
  const [passwordForm] = Form.useForm<PasswordValues>();
  const [createOpen, setCreateOpen] = useState(false);
  const [passwordTarget, setPasswordTarget] = useState<UserRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [savingUser, setSavingUser] = useState("");
  const users = useQuery({
    queryKey: usersKey,
    queryFn: ({ signal }) => apiFetch<UserRow[]>("/api/users", { signal }),
  });

  async function reloadUsers() {
    await queryClient.invalidateQueries({ queryKey: usersKey });
    refresh();
  }

  async function createUser(values: CreateValues) {
    setSaving(true);
    try {
      await apiFetch<UserRow>("/api/users", jsonRequest("POST", values));
      createForm.resetFields();
      setCreateOpen(false);
      await reloadUsers();
      message.success("账号已创建");
    } catch (error) {
      message.error(error instanceof Error ? error.message : "创建账号失败");
    } finally {
      setSaving(false);
    }
  }

  async function updateUser(row: UserRow, values: { role: UserRole; isActive: boolean; password?: string }) {
    setSavingUser(row.id);
    try {
      await apiFetch<UserRow>(`/api/users/${encodeURIComponent(row.id)}`, jsonRequest("PUT", values));
      setPasswordTarget(null);
      passwordForm.resetFields();
      await reloadUsers();
      message.success(values.password ? "密码已重置，原有登录会话已退出" : "账号权限已更新");
    } catch (error) {
      message.error(error instanceof Error ? error.message : "更新账号失败");
      void users.refetch();
    } finally {
      setSavingUser("");
    }
  }

  const columns = [
    {
      title: "账号",
      dataIndex: "username",
      key: "username",
      render: (_: string, row: UserRow) => (
        <Space direction="vertical" size={2}>
          <span>{row.name}</span>
          {row.name !== row.username && <span style={{ color: "#858b98", fontSize: 12 }}>{row.username}</span>}
        </Space>
      ),
    },
    {
      title: "角色",
      dataIndex: "role",
      key: "role",
      width: 150,
      render: (role: UserRole, row: UserRow) => (
        <Select
          aria-label={`${row.username}的角色`}
          value={role}
          options={roleOptions}
          style={{ width: 124 }}
          loading={savingUser === row.id}
          disabled={savingUser !== ""}
          onChange={(nextRole: UserRole) => void updateUser(row, { role: nextRole, isActive: row.isActive })}
        />
      ),
    },
    {
      title: "状态",
      dataIndex: "isActive",
      key: "isActive",
      width: 120,
      render: (isActive: boolean, row: UserRow) => (
        <Space>
          <Switch
            checked={isActive}
            aria-label={`${row.username}${isActive ? "停用" : "启用"}`}
            loading={savingUser === row.id}
            disabled={savingUser !== ""}
            onChange={(nextActive) => void updateUser(row, { role: row.role, isActive: nextActive })}
          />
          <span>{isActive ? "启用" : "停用"}</span>
        </Space>
      ),
    },
    {
      title: "创建时间",
      dataIndex: "createdAt",
      key: "createdAt",
      width: 140,
      render: (value: string) => new Date(value).toLocaleDateString("zh-CN"),
    },
    {
      title: "操作",
      key: "actions",
      width: 130,
      render: (_: unknown, row: UserRow) => (
        <Button
          type="link"
          icon={<KeyOutlined />}
          disabled={savingUser !== ""}
          onClick={() => setPasswordTarget(row)}
        >
          重置密码
        </Button>
      ),
    },
  ];

  return (
    <AdminPage title="账号管理" actions={(
      <Space>
        <Button icon={<ReloadOutlined />} loading={users.isFetching} onClick={() => void users.refetch()}>刷新</Button>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>新增账号</Button>
      </Space>
    )}>
      <Card>
        <Typography.Paragraph type="secondary">
          管理员可以管理账号、档案和全部台账。录入员可以新增加油记录，并修改自己录入的记录。只读人员可以查看台账、档案和报表。批量导入、删除及文件导出仅管理员可用。
        </Typography.Paragraph>
        <Table<UserRow>
          rowKey="id"
          columns={columns}
          dataSource={users.data ?? []}
          loading={users.isPending || users.isFetching}
          pagination={false}
          locale={{ emptyText: users.error?.message ?? "暂无账号" }}
          scroll={{ x: 720 }}
        />
      </Card>

      <Modal
        title="新增账号"
        open={createOpen}
        confirmLoading={saving}
        onCancel={() => setCreateOpen(false)}
        onOk={() => createForm.submit()}
        okText="创建"
        cancelText="取消"
        destroyOnHidden
      >
        <Form<CreateValues> form={createForm} layout="vertical" onFinish={createUser}>
          <Form.Item name="username" label="登录账号" rules={[{ required: true, whitespace: true, message: "请输入登录账号" }]}>
            <Input autoComplete="username" maxLength={128} />
          </Form.Item>
          <Form.Item name="password" label="初始密码" rules={[{ required: true, min: 8, message: "密码至少需要 8 位" }]}>
            <Input.Password autoComplete="new-password" maxLength={1024} />
          </Form.Item>
          <Form.Item name="role" label="角色" rules={[{ required: true }]} initialValue="operator">
            <Select options={roleOptions} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={passwordTarget ? `重置 ${passwordTarget.name} 的密码` : "重置密码"}
        open={Boolean(passwordTarget)}
        confirmLoading={savingUser !== ""}
        onCancel={() => {
          setPasswordTarget(null);
          passwordForm.resetFields();
        }}
        onOk={() => passwordForm.submit()}
        okText="确认重置"
        cancelText="取消"
        destroyOnHidden
      >
        <Form<PasswordValues> form={passwordForm} layout="vertical" onFinish={(values) => {
          if (passwordTarget) {
            void updateUser(passwordTarget, {
              role: passwordTarget.role,
              isActive: passwordTarget.isActive,
              password: values.password,
            });
          }
        }}>
          <Form.Item name="password" label="新密码" rules={[{ required: true, min: 8, message: "密码至少需要 8 位" }]}>
            <Input.Password autoComplete="new-password" maxLength={1024} />
          </Form.Item>
        </Form>
      </Modal>
    </AdminPage>
  );
}
