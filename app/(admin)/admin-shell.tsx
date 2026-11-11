"use client";

import {
  ApiOutlined,
  BarChartOutlined,
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
import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ComponentProps, type ReactNode } from "react";
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
  { path: "/docs", name: "接口文档", icon: <ApiOutlined /> },
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

function NavigationIndicator() {
  const { pending } = useLinkStatus();
  return pending ? <span className={styles.navigationIndicator} aria-hidden="true" /> : null;
}

function NavigationLink({ children, ...props }: ComponentProps<typeof Link>) {
  return (
    <Link {...props}>
      {children}
      <NavigationIndicator />
    </Link>
  );
}

export function AdminShell({
  children,
  name,
}: {
  children: ReactNode;
  name: string;
}) {
  const pathname = usePathname();
  const { message } = App.useApp();
  const [signingOut, setSigningOut] = useState(false);
  const currentPath = pathname.replace(/\/$/, "");
  const section = navigation.find((item) => item.children?.some((child) => child.path === currentPath));
  const page = (section?.children ?? navigation).find((item) => item.path === currentPath);

  async function signOut() {
    setSigningOut(true);

    try {
      await apiFetch("/api/logout", { method: "POST" });
      window.location.replace("/login");
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
        <NavigationLink href="/dashboard" className={styles.brand} aria-label="车辆监控首页">
          {logo}
          {title}
        </NavigationLink>
      )}
      token={{
        pageContainer: {
          paddingInlinePageContainerContent: 0,
          paddingBlockPageContainerContent: 32,
        },
      }}
      breadcrumbRender={() => page && currentPath !== "/dashboard" ? [
        { key: "dashboard", title: <NavigationLink href="/dashboard">经营看板</NavigationLink> },
        ...(section ? [{ key: section.path, title: section.name }] : []),
        { key: currentPath, title: <span aria-current="page">{page.name}</span> },
      ] : []}
      itemRender={(item) => item.title}
      menuItemRender={(item, defaultDom, menuProps) =>
        item.path && !item.children?.length
          ? (
            <NavigationLink
              href={item.path}
              aria-current={item.path === currentPath ? "page" : undefined}
              onClick={menuProps.isMobile ? item.onClick : undefined}
            >
              {defaultDom}
            </NavigationLink>
          )
          : defaultDom
      }
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
