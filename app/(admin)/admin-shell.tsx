"use client";

import {
  BankOutlined,
  BarChartOutlined,
  BookOutlined,
  CalculatorOutlined,
  CarOutlined,
  DashboardOutlined,
  FileExcelOutlined,
  FolderOpenOutlined,
  FormOutlined,
  KeyOutlined,
  LineChartOutlined,
  LogoutOutlined,
  OrderedListOutlined,
  ProfileOutlined,
  SettingOutlined,
  TeamOutlined,
  UnorderedListOutlined,
  UserOutlined,
  WalletOutlined,
} from "@ant-design/icons";
import { ProLayout, type ProLayoutProps } from "@ant-design/pro-components";
import { Alert, App, Avatar, Button, Dropdown, Form, Input, Modal } from "antd";
import { useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { useAppNavigation } from "@/components/app-navigation";
import { BrandMark } from "@/components/brand-mark";
import { apiFetch, jsonRequest } from "@/lib/api-client";
import { hasPermission, pagePermission, type Permission } from "@/lib/permissions";
import styles from "./admin.module.css";

type NavigationItem = {
  path: string;
  name: string;
  icon: ReactNode;
  children?: NavigationItem[];
};

const navigation: NavigationItem[] = [
  { path: "/dashboard", name: "经营看板", icon: <DashboardOutlined /> },
  {
    path: "/ledger",
    name: "加油台账",
    icon: <ProfileOutlined />,
    children: [
      { path: "/refuel", name: "录入加油", icon: <FormOutlined /> },
      { path: "/records", name: "加油记录", icon: <UnorderedListOutlined /> },
      { path: "/import", name: "数据导入", icon: <FileExcelOutlined /> },
    ],
  },
  {
    path: "/reports",
    name: "经营报表",
    icon: <BarChartOutlined />,
    children: [
      { path: "/vehicle-report", name: "单车月报", icon: <LineChartOutlined /> },
      { path: "/driver-report", name: "司机考核", icon: <OrderedListOutlined /> },
      { path: "/costs", name: "成本表", icon: <WalletOutlined /> },
    ],
  },
  {
    path: "/archives",
    name: "基础档案",
    icon: <FolderOpenOutlined />,
    children: [
      { path: "/vehicles", name: "车辆档案", icon: <CarOutlined /> },
      { path: "/drivers", name: "司机档案", icon: <TeamOutlined /> },
    ],
  },
  { path: "/companies", name: "公司管理", icon: <BankOutlined /> },
  { path: "/settings", name: "公司配置", icon: <SettingOutlined /> },
  { path: "/users", name: "账号管理", icon: <TeamOutlined /> },
];

const headerPages = [
  { path: "/docs", name: "接口文档", icon: <BookOutlined /> },
  { path: "/calculation-docs", name: "计算文档", icon: <CalculatorOutlined /> },
];

// Ant Design Pro: config/defaultSettings.ts and src/app.tsx.
const layoutSettings = {
  navTheme: "light",
  colorPrimary: "#1677ff",
  layout: "mix",
  contentWidth: "Fluid",
  fixedHeader: false,
  fixSiderbar: true,
  splitMenus: false,
  bgLayoutImgList: [
    { src: "/ant-design-pro/layout-glow.webp", left: 85, bottom: 100, height: "303px" },
    { src: "/ant-design-pro/layout-glow.webp", right: -45, bottom: -68, height: "303px" },
    { src: "/ant-design-pro/layout-grid.webp", left: 0, bottom: 0, width: "331px" },
  ],
} satisfies ProLayoutProps;

export function AdminShell({
  children,
  name,
  companyName,
  permissions,
}: {
  children: ReactNode;
  name: string;
  companyName?: string | null;
  permissions: readonly Permission[];
}) {
  const { pathname, Link, MenuLink = Link, onSessionEnded } = useAppNavigation();
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [passwordOpen, setPasswordOpen] = useState(false);
  const platform = hasPermission(permissions, "platform:view");
  const pages = navigation.map((item) => ({ ...item, name: item.path === "/dashboard" && platform ? "平台业务汇总" : item.name }));
  const [signingOut, setSigningOut] = useState(false);
  const currentPath = pathname.replace(/\/$/, "");
  const section = pages.find((item) => item.children?.some((child) => child.path === currentPath));
  const page = headerPages.find((item) => item.path === currentPath)
    ?? (section?.children ?? pages).find((item) => item.path === currentPath);
  const availableNavigation = pages.flatMap((item) => {
    if (item.children) {
      const children = item.children.filter((child) => {
        const permission = pagePermission(child.path, permissions);
        return permission !== null && hasPermission(permissions, permission);
      });
      return children.length ? [{ ...item, children }] : [];
    }

    const permission = pagePermission(item.path, permissions);
    return permission !== null && hasPermission(permissions, permission) ? [item] : [];
  });
  const availableHeaderPages = headerPages.filter((item) => {
    const permission = pagePermission(item.path, permissions);
    return permission !== null && hasPermission(permissions, permission);
  });
  const routes = { path: "/", children: availableNavigation };

  async function signOut() {
    setSigningOut(true);

    try {
      await apiFetch("/api/logout", { method: "POST" });
      await queryClient.cancelQueries();
      queryClient.clear();
      if (onSessionEnded) await onSessionEnded();
      else window.location.replace("/login");
    } catch {
      message.error("退出失败，请重试。");
      setSigningOut(false);
    }
  }

  return (
    <>
    <ProLayout
      {...layoutSettings}
      className={styles.shell}
      title="车辆监控"
      logo={<BrandMark />}
      route={routes}
      location={{ pathname: currentPath }}
      locale="zh-CN"
      siderWidth={256}
      pageTitleRender={() => ""}
      contentStyle={{ padding: 0, minWidth: 0 }}
      menu={{ locale: false }}
      headerTitleRender={(logo, title) => (
        <MenuLink
          href="/dashboard"
          className={styles.brand}
          aria-label="车辆监控首页"
          aria-current={currentPath === "/dashboard" ? "page" : undefined}
        >
          {logo}
          {title}
        </MenuLink>
      )}
      token={{
        pageContainer: {
          paddingInlinePageContainerContent: 0,
          paddingBlockPageContainerContent: 32,
        },
      }}
      breadcrumbRender={() => page && currentPath !== "/dashboard" ? [
        { key: "dashboard", title: <MenuLink href="/dashboard">{platform ? "平台业务汇总" : "经营看板"}</MenuLink> },
        ...(section ? [{ key: section.path, title: section.name }] : []),
        { key: currentPath, title: <span aria-current="page">{page.name}</span> },
      ] : []}
      itemRender={(item) => item.title}
      menuItemRender={(item, defaultDom, menuProps) =>
        item.path && !item.children?.length
          ? (
            <MenuLink
              href={item.path}
              aria-current={item.path === currentPath ? "page" : undefined}
              onClick={menuProps.isMobile ? item.onClick : undefined}
            >
              {defaultDom}
            </MenuLink>
          )
          : defaultDom
      }
      actionsRender={() => [
        ...(companyName ? [<span key="company" className={styles.companyName} title={companyName}>{companyName}</span>] : []),
        ...availableHeaderPages.map(({ path, name, icon }) => (
          <MenuLink
            key={path}
            href={path}
            className={styles.headerAction}
            aria-label={name}
            aria-current={currentPath === path ? "page" : undefined}
            title={name}
          >
            {icon}
          </MenuLink>
        )),
      ]}
      avatarProps={{
        render: () => (
          <Dropdown
            trigger={["click"]}
            menu={{
              items: [{ key: "password", icon: <KeyOutlined />, label: "修改本人密码" }, { key: "logout", icon: <LogoutOutlined />, label: "退出登录" }],
              onClick: ({ key }) => {
                if (key === "logout") void signOut();
                if (key === "password") setPasswordOpen(true);
              },
            }}
          >
            <Button
              type="text"
              loading={signingOut}
              className={styles.account}
              aria-label={`账号菜单，${name}`}
            >
              <Avatar className={styles.avatar} icon={<UserOutlined />} size={28} />
              <span className={styles.accountName}>{name}</span>
            </Button>
          </Dropdown>
        ),
      }}
    >
      <div className={styles.content}>{children}</div>
    </ProLayout>
    <ChangePasswordModal open={passwordOpen} onClose={() => setPasswordOpen(false)} onSaved={async () => {
      await queryClient.cancelQueries();
      queryClient.clear();
      if (onSessionEnded) await onSessionEnded();
      else window.location.replace("/login");
    }} />
    </>
  );
}


function ChangePasswordModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => Promise<void> }) {
  const [form] = Form.useForm<{ currentPassword: string; password: string; confirmPassword: string }>();
  const { message } = App.useApp();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save(values: { currentPassword: string; password: string }) {
    setSaving(true);
    setError("");
    try {
      await apiFetch("/api/users/password", jsonRequest("PUT", { currentPassword: values.currentPassword, password: values.password }));
      form.resetFields();
      message.success("密码已修改，请重新登录");
      await onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "修改密码失败，请重试");
    } finally {
      setSaving(false);
    }
  }

  return <Modal title="修改本人密码" open={open} onCancel={() => { if (!saving) { form.resetFields(); setError(""); onClose(); } }} onOk={() => form.submit()} confirmLoading={saving} okText="修改并重新登录" cancelText="取消" destroyOnHidden>
    <Form form={form} layout="vertical" onFinish={save} disabled={saving}>
      <Form.Item name="currentPassword" label="当前密码" rules={[{ required: true, message: "请输入当前密码" }]}><Input.Password autoComplete="current-password" maxLength={1024} /></Form.Item>
      <Form.Item name="password" label="新密码" rules={[{ required: true, min: 8, message: "新密码至少需要 8 位" }]}><Input.Password autoComplete="new-password" maxLength={1024} /></Form.Item>
      <Form.Item name="confirmPassword" label="确认新密码" dependencies={["password"]} rules={[{ required: true, message: "请再次输入新密码" }, { validator: (_, value) => !value || value === form.getFieldValue("password") ? Promise.resolve() : Promise.reject(new Error("两次输入的密码不一致")) }]}><Input.Password autoComplete="new-password" maxLength={1024} /></Form.Item>
      {error && <Alert type="error" showIcon message={error} />}
    </Form>
  </Modal>;
}
