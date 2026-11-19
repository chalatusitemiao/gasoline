"use client";

import { useQuery } from "@tanstack/react-query";
import { Button, Descriptions, Divider, Drawer, Skeleton, Timeline } from "antd";
import { useAppNavigation } from "@/components/app-navigation";
import { moneyText, numberText, QueryError, stampText } from "@/components/fuel/ui";
import { apiFetch } from "@/lib/api-client";
import type { PartChange, PartRecord, PartRecordDetail } from "@/lib/parts";
import { PartForm } from "./part-form";
import { PartPhotoButton, PartPhotos } from "./part-photos";
import styles from "./parts.module.css";

function PartDescription({ record, timeZone }: { record: PartRecord; timeZone: string }) {
  return (
    <>
      <Descriptions
        size="small"
        column={{ xs: 1, sm: 2 }}
        items={[
          { key: "plate", label: "车牌", children: record.plate },
          { key: "date", label: "购买日期", children: record.date },
          { key: "name", label: "配件名称", children: record.name },
          { key: "project", label: "项目", children: record.projectName ?? "未分配项目" },
          { key: "quantity", label: "数量", children: numberText(record.quantity, 3) },
          { key: "unitPrice", label: "单价", children: `¥${moneyText(record.unitPrice)}` },
          { key: "amount", label: "总价", children: `¥${moneyText(record.amount)}` },
          { key: "area", label: "购买地区", children: record.purchaseArea || "—" },
          { key: "createdBy", label: "录入人", children: record.createdBy || "—" },
          { key: "createdAt", label: "录入时间", children: stampText(record.createdAt, timeZone) },
        ]}
      />
      {record.photos.length > 0 && <PartPhotos photos={record.photos} />}
    </>
  );
}

function PartHistory({ record, changes, timeZone }: { record: PartRecord; changes: PartChange[]; timeZone: string }) {
  return (
    <>
      <Divider orientation="left">变更历史</Divider>
      <Timeline items={[
        ...changes.map((entry) => ({
          key: entry.id,
          children: (
            <div className={styles.audit}>
              <strong>{entry.changedBy || "—"}</strong>
              {" · "}
              <time dateTime={entry.changedAt}>{stampText(entry.changedAt, timeZone)}</time>
              <p>修改原因：{entry.reason}</p>
              <ul>
                {entry.changes.map(({ field, before, after, beforePhotos, afterPhotos }) => (
                  <li key={field}>
                    {field}：{before || "—"} → {after || "—"}
                    {Boolean(beforePhotos?.length || afterPhotos?.length) && (
                      <div className={styles.auditPhotos}>
                        {beforePhotos?.length ? <span>修改前 <PartPhotoButton photos={beforePhotos} /></span> : null}
                        {afterPhotos?.length ? <span>修改后 <PartPhotoButton photos={afterPhotos} /></span> : null}
                      </div>
                    )}
                  </li>
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
  );
}

function usePartDetail(id: string) {
  const { companyId } = useAppNavigation();
  return useQuery({
    queryKey: ["parts", "detail", companyId, id],
    queryFn: ({ signal }) => apiFetch<PartRecordDetail>(`/api/parts/records/${encodeURIComponent(id)}`, { signal }),
  });
}

export function DeletedPartDetail({ record, timeZone }: { record: PartRecord; timeZone: string }) {
  const detail = usePartDetail(record.id);
  return (
    <>
      <PartDescription record={record} timeZone={timeZone} />
      {detail.error && <QueryError error={detail.error} retry={() => { void detail.refetch(); }} />}
      {detail.isPending && <Skeleton active />}
      {detail.data && <PartHistory record={record} changes={detail.data.changes} timeZone={timeZone} />}
    </>
  );
}

export function PartDetail({
  id, editing, today, timeZone, onEdit, onRead, onClose,
}: {
  id: string;
  editing: boolean;
  today: string;
  timeZone: string;
  onEdit: () => void;
  onRead: () => void;
  onClose: () => void;
}) {
  const { permissions = [], userId } = useAppNavigation();
  const detail = usePartDetail(id);
  const record = detail.data?.record;
  const canEdit = record && (permissions.includes("parts:delete") ||
    permissions.includes("parts:edit") && record.createdById === userId);

  return (
    <Drawer
      title={editing ? "修改配件记录" : "配件记录详情"}
      width="min(720px, 100vw)"
      open
      onClose={onClose}
      extra={!editing && canEdit && <Button onClick={onEdit}>修改记录</Button>}
    >
      {detail.error && <QueryError error={detail.error} retry={() => { void detail.refetch(); }} />}
      {detail.isPending && <Skeleton active />}
      {record && editing && canEdit && <PartForm today={today} record={record} onCancel={onRead} onSaved={onRead} />}
      {record && (!editing || !canEdit) && (
        <>
          <PartDescription record={record} timeZone={timeZone} />
          <PartHistory record={record} changes={detail.data?.changes ?? []} timeZone={timeZone} />
        </>
      )}
    </Drawer>
  );
}
