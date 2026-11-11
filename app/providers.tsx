"use client";

import "@ant-design/v5-patch-for-react-19";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App, ConfigProvider, type ThemeConfig } from "antd";
import zhCN from "antd/locale/zh_CN";
import { useState, type ReactNode } from "react";

const theme: ThemeConfig = {
  token: {
    colorPrimary: "#1677ff",
    colorInfo: "#1677ff",
    colorText: "#1f1f1f",
    colorTextSecondary: "#595959",
    colorBgLayout: "#f5f5f5",
    borderRadius: 6,
    borderRadiusLG: 8,
    fontFamily: "var(--app-font)",
  },
  components: {
    Card: { headerFontSize: 16, headerHeight: 48, bodyPadding: 20 },
    Table: {
      headerBg: "#fafafa",
      headerColor: "#434343",
      rowHoverBg: "#f5f8ff",
      cellPaddingBlock: 12,
      cellPaddingInline: 16,
    },
  },
};

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ConfigProvider locale={zhCN} theme={theme}>
      <App>{children}</App>
    </ConfigProvider>
  );
}

export function AppQueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 15_000, retry: 1 },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
