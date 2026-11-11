import { Descriptions } from "antd";
import { AnomalyTag, fuelText, moneyText, numberText, stampText } from "@/components/fuel/ui";
import type { FuelRecord } from "@/lib/fuel";

export function RecordDetails({ record, timeZone }: { record: FuelRecord; timeZone: string }) {
  return (
    <Descriptions bordered size="small" column={{ xs: 1, sm: 2 }} items={[
      { key: "date", label: "加油日期", children: record.date },
      { key: "plate", label: "车牌", children: record.plate },
      { key: "driver", label: "司机", children: record.driverName || "—" },
      { key: "fuel", label: "油品", children: fuelText(record.fuelType) },
      { key: "liters", label: "加油量（L）", children: numberText(record.liters, 3) },
      { key: "unitPrice", label: "单价（元/L）", children: numberText(record.unitPrice, 6) },
      { key: "amount", label: "加油金额（元）", children: moneyText(record.amount) },
      { key: "odometer", label: "里程表读数（km）", children: numberText(record.odometer) },
      { key: "distance", label: "区间里程（km）", children: numberText(record.distance) },
      { key: "consumption", label: "区间油耗（L/100km）", children: numberText(record.consumption) },
      { key: "baseline", label: "参考油耗（L/100km）", children: numberText(record.baseline) },
      { key: "status", label: "异常状态", children: <AnomalyTag reason={record.anomalyReason} /> },
      { key: "source", label: "来源", children: record.source === "manual" ? "手工录入" : "台账导入" },
      { key: "createdBy", label: "录入人", children: record.createdBy || "—" },
      { key: "createdAt", label: "录入时间", children: stampText(record.createdAt, timeZone) },
      { key: "updatedBy", label: "最后修改人", children: record.updatedBy || "—" },
      { key: "updatedAt", label: "最后修改时间", children: stampText(record.updatedAt, timeZone) },
      { key: "notes", label: "备注", span: "filled", children: record.notes || "—" },
    ]} />
  );
}
