"use client";

import {
  BarChartOutlined,
  BookOutlined,
  CalculatorOutlined,
  CarOutlined,
  DashboardOutlined,
  FileExcelOutlined,
  FolderOpenOutlined,
  FormOutlined,
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
import { App, Avatar, Button, Dropdown } from "antd";
import { useState, type ReactNode } from "react";
import { useAppNavigation } from "@/components/app-navigation";
import { BrandMark } from "@/components/brand-mark";
import { apiFetch } from "@/lib/api-client";
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
  { path: "/settings", name: "系统配置", icon: <SettingOutlined /> },
];

const headerPages = [
  { path: "/docs", name: "接口文档", icon: <BookOutlined /> },
  { path: "/calculation-docs", name: "计算文档", icon: <CalculatorOutlined /> },
];

const routes = {
  path: "/",
  children: navigation,
};

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
}: {
  children: ReactNode;
  name: string;
}) {
  const { pathname, Link, MenuLink = Link, onSessionEnded } = useAppNavigation();
  const { message } = App.useApp();
  const [signingOut, setSigningOut] = useState(false);
  const currentPath = pathname.replace(/\/$/, "");
  const section = navigation.find((item) => item.children?.some((child) => child.path === currentPath));
  const page = headerPages.find((item) => item.path === currentPath)
    ?? (section?.children ?? navigation).find((item) => item.path === currentPath);

  async function signOut() {
    setSigningOut(true);

    try {
      await apiFetch("/api/logout", { method: "POST" });
      if (onSessionEnded) await onSessionEnded();
      else window.location.replace("/login");
    } catch {
      message.error("退出失败，请重试。");
      setSigningOut(false);
    }
  }

  return (
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
        { key: "dashboard", title: <MenuLink href="/dashboard">经营看板</MenuLink> },
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
      actionsRender={() => headerPages.map(({ path, name, icon }) => (
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
      ))}
      avatarProps={{
        render: () => (
          <Dropdown
            trigger={["click"]}
            menu={{
              items: [{ key: "logout", icon: <LogoutOutlined />, label: "退出登录" }],
              onClick: ({ key }) => {
                if (key === "logout") void signOut();
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
  );
}
