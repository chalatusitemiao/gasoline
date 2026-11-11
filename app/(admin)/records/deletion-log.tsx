"use client";

import { ProTable, type ProColumns } from "@ant-design/pro-components";
import { useQuery } from "@tanstack/react-query";
import { Modal } from "antd";
import { useState } from "react";
import { QueryError, stampText, tablePagination } from "@/components/fuel/ui";
import { apiFetch } from "@/lib/api-client";
import { FUEL_PAGE_SIZE, type FuelDeletion, type FuelPage } from "@/lib/fuel";
import { RecordDetails } from "./record-details";

const deletionColumns: ProColumns<FuelDeletion>[] = [
  { title: "车牌", dataIndex: "plate", width: 115 },
  { title: "加油日期", width: 112, render: (_, row) => row.snapshot.date },
  { title: "录入人 → 删除人", width: 185, render: (_, row) => `${row.snapshot.createdBy || "—"} → ${row.deletedBy}` },
  { title: "删除原因", dataIndex: "reason", ellipsis: true, render: (_, row) => row.reason || "—" },
];

export function DeletionLog({
  open, timeZone, onClose,
}: {
  open: boolean;
  timeZone: string;
  onClose: () => void;
}) {
  const [pagination, setPagination] = useState({ page: 1, pageSize: FUEL_PAGE_SIZE });
  const log = useQuery({
    queryKey: ["fuel", "deletions", pagination],
    enabled: open,
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({
        page: String(pagination.page),
        pageSize: String(pagination.pageSize),
      });
      return apiFetch<FuelPage<FuelDeletion>>(`/api/fuel/deletions?${params}`, { signal });
    },
  });
  const columns: ProColumns<FuelDeletion>[] = [
    { title: "删除时间", dataIndex: "deletedAt", width: 165, renderText: (value: string) => stampText(value, timeZone) },
    ...deletionColumns,
  ];

  return (
    <Modal title="加油记录删除日志" width={880} open={open} footer={null} onCancel={onClose} destroyOnHidden>
      {log.error && <QueryError error={log.error} retry={() => { void log.refetch(); }} />}
      <ProTable<FuelDeletion>
        rowKey="id"
        columns={columns}
        dataSource={log.data?.items ?? []}
        loading={log.isFetching}
        search={false}
        options={false}
        toolBarRender={false}
        expandable={{ expandedRowRender: (row) => <RecordDetails record={row.snapshot} timeZone={timeZone} /> }}
        pagination={tablePagination(pagination, log.data?.total ?? 0, setPagination)}
        scroll={{ x: 720 }}
        locale={{ emptyText: "暂无删除记录" }}
      />
    </Modal>
  );
}
