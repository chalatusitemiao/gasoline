"use client";

import { useQuery } from "@tanstack/react-query";
import { Button, Divider, Drawer, Skeleton, Timeline } from "antd";
import { FuelEditor } from "@/components/fuel/fuel-editor";
import { FULL_TANK_NOTE, fuelText, QueryError, stampText } from "@/components/fuel/ui";
import shared from "@/components/fuel/ui.module.css";
import { apiFetch } from "@/lib/api-client";
import type { FuelRecordDetail } from "@/lib/fuel";
import { RecordDetails } from "./record-details";
import styles from "./records.module.css";

const labels: Record<string, string> = {
  vehicleId: "车辆",
  plate: "车牌",
  driverId: "司机",
  driverName: "司机",
  date: "加油日期",
  fuelType: "油品",
  liters: "加油量",
  unitPrice: "单价",
  amount: "加油金额",
  odometer: "里程表读数",
  distance: "区间里程",
  consumption: "区间油耗",
  notes: "备注",
  source: "来源",
};

function changeValue(field: string, value: string) {
  if (!value) return "—";
  if (field === "fuelType") return fuelText(value);
  if (field === "source") return value === "manual" ? "手工录入" : "台账导入";
  return value;
}

export function RecordDrawer({
  id, editing, today, timeZone, onEdit, onCancelEdit, onClose,
}: {
  id: string | null;
  editing: boolean;
  today: string;
  timeZone: string;
  onEdit: () => void;
  onCancelEdit: () => void;
  onClose: () => void;
}) {
  const detail = useQuery({
    queryKey: ["fuel", "record", id],
    enabled: Boolean(id),
    queryFn: ({ signal }) => apiFetch<FuelRecordDetail>(`/api/fuel/records/${encodeURIComponent(id ?? "")}`, { signal }),
  });
  const record = detail.data?.record;
  const changes = detail.data?.changes ?? [];

  return (
    <Drawer
      title={editing ? "修改加油记录" : "加油详情"}
      width="min(680px, 100vw)"
      open={Boolean(id)}
      onClose={onClose}
      destroyOnHidden
      extra={record && !editing && <Button onClick={onEdit}>修改记录</Button>}
    >
      {detail.error && <QueryError error={detail.error} retry={() => { void detail.refetch(); }} />}
      {!record && detail.isFetching && <Skeleton active />}
      {record && (editing ? (
        <FuelEditor
          key={record.id}
          today={today}
          record={record}
          onCancel={onCancelEdit}
          onSaved={onCancelEdit}
        />
      ) : (
        <>
          <RecordDetails record={record} timeZone={timeZone} />
          <p className={shared.note}>{FULL_TANK_NOTE}</p>
          <Divider orientation="left">记录留痕</Divider>
          <Timeline items={[
            ...changes.map((change) => ({
              key: change.id,
              children: (
                <div className={styles.auditEntry}>
                  <strong>{change.changedBy || "—"}</strong>
                  {" · "}
                  <time dateTime={change.changedAt}>{stampText(change.changedAt, timeZone)}</time>
                  <p>原因：{change.reason}</p>
                  <ul>
                    {change.changes.map(({ field, before, after }) => (
                      <li key={field}>{labels[field] ?? field}：{changeValue(field, before)} → {changeValue(field, after)}</li>
                    ))}
                  </ul>
                </div>
              ),
            })),
            {
              key: "created",
              children: <>{record.createdBy || "—"} · {stampText(record.createdAt, timeZone)} · 录入记录</>,
            },
          ]} />
        </>
      ))}
    </Drawer>
  );
}
