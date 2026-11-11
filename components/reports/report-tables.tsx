"use client";

import { ProTable, type ProColumns } from "@ant-design/pro-components";
import { Table } from "antd";
import type { FuelAnalytics, FuelMetrics, VehicleMetrics } from "@/lib/fuel-analytics";
import { monthsInRange } from "@/lib/fuel-analytics";
import { formatNumber, signedPercent } from "./report-ui";
import { rankDrivers, rankVehicles, vehicleMonthIndex, type RankedDriver } from "./report-values";
import styles from "./reports.module.css";

const pagination = { defaultPageSize: 20, pageSizeOptions: [20, 50, 100], showSizeChanger: true };

function VehicleMonthCell({
  value,
  fleetConsumption,
}: {
  value?: FuelMetrics;
  fleetConsumption?: number | null;
}) {
  if (!value || value.count === 0) return "—";

  const aboveFleet = value.consumption != null && fleetConsumption != null
    && value.consumption > fleetConsumption * 1.2;

  return (
    <div className={styles.cell}>
      <span>{formatNumber(value.liters)} L</span>
      <small
        className={aboveFleet ? styles.flag : undefined}
        title={aboveFleet ? "高于同期均值 20%" : undefined}
      >
        {value.consumption == null ? "—" : `${formatNumber(value.consumption)} L/100km`}
      </small>
    </div>
  );
}

export function VehicleMonthTable({ report }: { report: FuelAnalytics }) {
  const months = monthsInRange(report.from, report.to);
  const fleetByMonth = new Map(report.months.map((value) => [value.month, value]));
  const vehiclesByMonth = vehicleMonthIndex(report.vehicles);
  const orderedVehicles = [...report.vehicles].sort((first, second) => first.plate.localeCompare(second.plate));
  const columns: ProColumns<VehicleMetrics>[] = [
    { title: "车辆", dataIndex: "plate", fixed: "left", width: 120 },
    ...months.map((month): ProColumns<VehicleMetrics> => ({
      title: month,
      key: month,
      align: "right",
      width: 130,
      render: (_, vehicle) => (
        <VehicleMonthCell
          value={vehiclesByMonth.get(vehicle.vehicleId)?.get(month)}
          fleetConsumption={fleetByMonth.get(month)?.consumption}
        />
      ),
    })),
    {
      title: "合计",
      key: "total",
      align: "right",
      width: 140,
      render: (_, vehicle) => <VehicleMonthCell value={vehicle} fleetConsumption={report.total.consumption} />,
    },
  ];

  return (
    <ProTable<VehicleMetrics>
      className={styles.table}
      headerTitle="各车月度油量 / 油耗"
      columns={columns}
      dataSource={orderedVehicles}
      rowKey="vehicleId"
      pagination={pagination}
      search={false}
      options={false}
      size="middle"
      scroll={{ x: 260 + months.length * 130 }}
      locale={{ emptyText: "暂无车辆档案" }}
      summary={() => (
        <Table.Summary.Row className={styles.summary}>
          <Table.Summary.Cell index={0}>合计</Table.Summary.Cell>
          {months.map((month, index) => (
            <Table.Summary.Cell index={index + 1} key={month} align="right">
              <VehicleMonthCell value={fleetByMonth.get(month)} />
            </Table.Summary.Cell>
          ))}
          <Table.Summary.Cell index={months.length + 1} align="right">
            <VehicleMonthCell value={report.total} />
          </Table.Summary.Cell>
        </Table.Summary.Row>
      )}
    />
  );
}

const driverColumns: ProColumns<RankedDriver>[] = [
  { title: "排名", dataIndex: "rank", width: 64, render: (_, row) => row.rank ?? "—" },
  { title: "司机", dataIndex: "name", width: 108, ellipsis: true },
  { title: "加油次数", dataIndex: "count", width: 90, align: "right" },
  { title: "总油量（L）", width: 115, align: "right", render: (_, row) => formatNumber(row.liters) },
  { title: "总金额（元）", width: 120, align: "right", render: (_, row) => formatNumber(row.amount, true) },
  { title: "总里程（km）", width: 120, align: "right", render: (_, row) => formatNumber(row.distance) },
  { title: "油耗（L/100km）", width: 136, align: "right", render: (_, row) => formatNumber(row.consumption) },
  { title: "较均值", width: 114, align: "right", render: (_, row) => row.deviation == null ? "—" : signedPercent(row.deviation) },
  { title: "异常次数", dataIndex: "anomalies", width: 86, align: "right" },
  { title: "常用车辆", width: 200, ellipsis: true, render: (_, row) => row.usualVehicles.join("、") || "—" },
];

export function DriverTable({ report }: { report: FuelAnalytics }) {
  return (
    <ProTable<RankedDriver>
      className={styles.table}
      headerTitle="司机油耗排名"
      columns={driverColumns}
      dataSource={rankDrivers(report)}
      rowKey="driverId"
      pagination={pagination}
      search={false}
      options={false}
      size="middle"
      scroll={{ x: 1153 }}
      locale={{ emptyText: "所选期间暂无司机加油记录" }}
    />
  );
}

type CostVehicle = VehicleMetrics & { share: number | null };

const costColumns: ProColumns<CostVehicle>[] = [
  { title: "车牌号", dataIndex: "plate", width: 122, fixed: "left" },
  { title: "加油次数", dataIndex: "count", width: 90, align: "right" },
  { title: "油量（L）", width: 110, align: "right", render: (_, row) => formatNumber(row.liters) },
  { title: "金额（元）", width: 128, align: "right", render: (_, row) => formatNumber(row.amount, true) },
  { title: "里程（km）", width: 115, align: "right", render: (_, row) => formatNumber(row.distance) },
  { title: "油耗（L/100km）", width: 136, align: "right", render: (_, row) => formatNumber(row.consumption) },
  { title: "元/公里", width: 104, align: "right", render: (_, row) => formatNumber(row.amountPerKm, true) },
  { title: "金额占比", width: 110, align: "right", render: (_, row) => row.share == null ? "—" : `${formatNumber(row.share)}%` },
];

export function CostVehicleTable({ report }: { report: FuelAnalytics }) {
  return (
    <ProTable<CostVehicle>
      className={styles.table}
      headerTitle="车辆费用排名"
      columns={costColumns}
      dataSource={rankVehicles(report)}
      rowKey="vehicleId"
      pagination={pagination}
      search={false}
      options={false}
      size="middle"
      scroll={{ x: 915 }}
      locale={{ emptyText: "所选期间暂无车辆加油记录" }}
    />
  );
}
