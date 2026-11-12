import { lazy } from "react";
import { Result } from "antd";
import { AdminPage } from "@/components/admin-page";
import { FuelPage } from "@/components/fuel/ui";
import { monthInBusinessZone, todayInBusinessZone } from "@/lib/fuel-calendar";

const Dashboard = lazy(() => import("@/components/reports/dashboard").then(({ Dashboard }) => ({ default: Dashboard })));
const FuelEditor = lazy(() => import("@/components/fuel/fuel-editor").then(({ FuelEditor }) => ({ default: FuelEditor })));
const RecordsTable = lazy(() => import("@/app/(admin)/records/records-table").then(({ RecordsTable }) => ({ default: RecordsTable })));
const MonthlyReport = lazy(() => import("@/components/reports/monthly-report").then(({ MonthlyReport }) => ({ default: MonthlyReport })));
const ArchiveManager = lazy(() => import("@/components/fuel/archive-manager").then(({ ArchiveManager }) => ({ default: ArchiveManager })));
const VehicleImport = lazy(() => import("@/app/(admin)/vehicles/vehicle-import").then(({ VehicleImport }) => ({ default: VehicleImport })));
const LedgerImport = lazy(() => import("@/app/(admin)/import/ledger-import").then(({ LedgerImport }) => ({ default: LedgerImport })));
const SystemSettingsPanel = lazy(() => import("@/components/system-settings-form").then(({ SystemSettingsPanel }) => ({ default: SystemSettingsPanel })));
const CalculationDocs = lazy(() => import("@/app/(admin)/calculation-docs/calculation-docs").then(({ CalculationDocs }) => ({ default: CalculationDocs })));
const ApiDocs = lazy(() => import("@/app/(admin)/docs/api-docs").then(({ ApiDocs }) => ({ default: ApiDocs })));

export function DesktopPage({ pathname, search, timeZone }: { pathname: string; search: string; timeZone: string }) {
  switch (pathname) {
    case "/dashboard":
      return <Dashboard />;
    case "/refuel":
      return <FuelPage title="录入加油"><FuelEditor today={todayInBusinessZone(timeZone)} /></FuelPage>;
    case "/records": {
      const anomaliesOnly = new URLSearchParams(search).get("anomaliesOnly") === "true";
      return <RecordsTable key={String(anomaliesOnly)} today={todayInBusinessZone(timeZone)} timeZone={timeZone} anomaliesOnly={anomaliesOnly} />;
    }
    case "/vehicle-report":
      return <MonthlyReport key="vehicles" view="vehicles" initialMonth={monthInBusinessZone(timeZone)} />;
    case "/driver-report":
      return <MonthlyReport key="drivers" view="drivers" initialMonth={monthInBusinessZone(timeZone)} />;
    case "/costs":
      return <MonthlyReport key="costs" view="costs" initialMonth={monthInBusinessZone(timeZone)} />;
    case "/vehicles":
      return <ArchiveManager key="vehicles" kind="vehicles" extraAction={<VehicleImport />} />;
    case "/drivers":
      return <ArchiveManager key="drivers" kind="drivers" />;
    case "/import":
      return <LedgerImport />;
    case "/settings":
      return <AdminPage title="系统配置"><SystemSettingsPanel /></AdminPage>;
    case "/calculation-docs":
      return <CalculationDocs />;
    case "/docs":
      return <ApiDocs />;
    default:
      return <Result status="404" title="页面不存在" subTitle="请从左侧菜单选择页面。" />;
  }
}
