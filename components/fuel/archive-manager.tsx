"use client";

import { PlusOutlined } from "@ant-design/icons";
import { ModalForm, ProFormSelect, ProFormSwitch, ProFormText, ProFormTextArea, ProTable, type ProColumns } from "@ant-design/pro-components";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { App, Button, Form, Input, Space, Tag, Tooltip } from "antd";
import { useState, type ReactNode } from "react";
import { apiFetch, jsonRequest } from "@/lib/api-client";
import { driverInputSchema, driverLabel, FUEL_PAGE_SIZE, vehicleInputSchema, type Driver, type FuelPage as PageData, type FuelType, type Vehicle } from "@/lib/fuel";
import { FUEL_OPTIONS, FuelPage, fuelText, numberText, QueryError, tablePagination } from "./ui";
import styles from "./ui.module.css";

type ArchiveRow = Vehicle | Driver;
type Fields = {
  plate?: string;
  fuelType?: FuelType;
  name?: string;
  phone?: string;
  isActive?: boolean;
  notes?: string;
};

const vehicleColumns: ProColumns<ArchiveRow>[] = [
  { title: "车牌", dataIndex: "plate", width: 135 },
  { title: "常用油品", dataIndex: "fuelType", width: 110, renderText: fuelText },
  { title: "加油次数", dataIndex: "refuelCount", width: 115, align: "right" },
  { title: "上次加油日期", dataIndex: "lastDate", width: 140 },
  { title: "上次里程（km）", dataIndex: "lastOdometer", width: 145, align: "right", renderText: (value: string | null) => numberText(value) },
  { title: "备注", dataIndex: "notes", ellipsis: true },
];

const driverColumns: ProColumns<ArchiveRow>[] = [
  {
    title: "司机",
    width: 205,
    ellipsis: true,
    render: (_, row) => "name" in row ? <span title={row.id}>{driverLabel(row.name, row.id)}</span> : null,
  },
  { title: "手机号", dataIndex: "phone", width: 155 },
  {
    title: "状态",
    dataIndex: "isActive",
    width: 100,
    render: (_, row) => "isActive" in row
      ? <Tag color={row.isActive ? "success" : "default"}>{row.isActive ? "在用" : "停用"}</Tag>
      : null,
  },
  { title: "加油记录数", dataIndex: "refuelCount", width: 120, align: "right" },
  { title: "备注", dataIndex: "notes", ellipsis: true },
];

function displayName(row: ArchiveRow) {
  return "plate" in row ? row.plate : driverLabel(row.name, row.id);
}

function editValues(vehicle: boolean, row?: ArchiveRow): Fields {
  if (!row) return vehicle ? {} : { isActive: true };
  if ("plate" in row) return { plate: row.plate, fuelType: row.fuelType, notes: row.notes ?? "" };
  return { name: row.name, phone: row.phone ?? "", isActive: row.isActive, notes: row.notes ?? "" };
}

export function ArchiveManager({
  kind,
  extraAction,
}: {
  kind: "vehicles" | "drivers";
  extraAction?: ReactNode;
}) {
  const vehicle = kind === "vehicles";
  const label = vehicle ? "车辆" : "司机";
  const { message, modal } = App.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<Fields>();
  const [pagination, setPagination] = useState({ page: 1, pageSize: FUEL_PAGE_SIZE });
  const [keyword, setKeyword] = useState("");
  const [editor, setEditor] = useState<{ row?: ArchiveRow } | null>(null);
  const endpoint = `/api/fuel/${kind}`;

  const list = useQuery({
    queryKey: ["fuel", kind, keyword, pagination] as const,
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({
        page: String(pagination.page),
        pageSize: String(pagination.pageSize),
        keyword,
      });
      return apiFetch<PageData<ArchiveRow>>(`${endpoint}?${params}`, { signal });
    },
    placeholderData: (previous, query) =>
      query?.queryKey[2] === keyword && query.queryKey[3].pageSize === pagination.pageSize
        ? previous
        : undefined,
  });
  const save = useMutation({
    mutationFn: (values: Fields) => apiFetch(
      editor?.row ? `${endpoint}/${encodeURIComponent(editor.row.id)}` : endpoint,
      jsonRequest(editor?.row ? "PUT" : "POST", values),
    ),
  });

  async function submit(values: Fields) {
    const result = (vehicle ? vehicleInputSchema : driverInputSchema).safeParse(values);
    if (!result.success) {
      form.setFields(result.error.issues.map((issue) => ({
        name: issue.path[0] as keyof Fields,
        errors: [issue.message],
      })));
      return false;
    }
    try {
      await save.mutateAsync(result.data);
      void queryClient.invalidateQueries({ queryKey: ["fuel"] });
      if (!editor?.row) setPagination((previous) => ({ ...previous, page: 1 }));
      message.success(`${label}已保存。`);
      return true;
    } catch {
      return false;
    }
  }

  function remove(row: ArchiveRow) {
    modal.confirm({
      title: `删除${label}？`,
      content: displayName(row),
      okText: "删除",
      cancelText: "取消",
      okType: "danger",
      onOk: async () => {
        try {
          await apiFetch(`${endpoint}/${encodeURIComponent(row.id)}`, { method: "DELETE" });
          if (list.data?.items.length === 1 && pagination.page > 1) {
            setPagination((previous) => ({ ...previous, page: previous.page - 1 }));
          }
          void queryClient.invalidateQueries({ queryKey: ["fuel"] });
          message.success(`${label}已删除。`);
        } catch (error) {
          message.error(error instanceof Error ? error.message : "删除失败。");
          throw error;
        }
      },
    });
  }

  const columns: ProColumns<ArchiveRow>[] = [
    ...(vehicle ? vehicleColumns : driverColumns),
    {
      title: "操作",
      width: 115,
      render: (_, row) => {
        const linked = (row.refuelCount ?? 0) > 0;
        return (
          <Space size={0}>
            <Button size="small" type="link" onClick={() => setEditor({ row })}>修改</Button>
            <Tooltip title={linked ? "已有加油记录，无法删除" : undefined}>
              <span>
                <Button size="small" type="link" danger disabled={linked} onClick={() => remove(row)}>删除</Button>
              </span>
            </Tooltip>
          </Space>
        );
      },
    },
  ];

  return (
    <FuelPage title={`${label}档案`} actions={
      <Space wrap>
        {extraAction}
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditor({})}>新增{label}</Button>
      </Space>
    }>
      {list.error && <QueryError error={list.error} retry={() => { void list.refetch(); }} />}
      <ProTable<ArchiveRow>
        className={styles.table}
        rowKey="id"
        columns={columns}
        dataSource={list.data?.items ?? []}
        loading={list.isFetching}
        search={false}
        options={false}
        scroll={{ x: vehicle ? 870 : 800 }}
        pagination={tablePagination(pagination, list.data?.total ?? 0, setPagination)}
        locale={{ emptyText: `暂无${label}记录` }}
        headerTitle={
          <Input.Search
            className={styles.search}
            aria-label={vehicle ? "搜索车牌" : "搜索司机姓名、手机号或档案编号"}
            placeholder={vehicle ? "搜索车牌" : "搜索姓名、手机号或档案编号"}
            maxLength={100}
            allowClear
            onSearch={(value) => {
              setKeyword(value.trim());
              setPagination((previous) => ({ ...previous, page: 1 }));
            }}
          />
        }
      />

      <ModalForm<Fields>
        key={editor?.row?.id ?? (editor ? "create" : "closed")}
        form={form}
        open={Boolean(editor)}
        width={480}
        title={editor?.row ? `修改${label}` : `新增${label}`}
        initialValues={editValues(vehicle, editor?.row)}
        clearOnDestroy
        onOpenChange={(open) => {
          if (!open) {
            setEditor(null);
            save.reset();
          }
        }}
        modalProps={{
          destroyOnHidden: true,
          maskClosable: !save.isPending,
          keyboard: !save.isPending,
          closable: !save.isPending,
        }}
        submitter={{
          searchConfig: { submitText: "保存", resetText: "取消" },
          resetButtonProps: { disabled: save.isPending },
        }}
        onFinish={submit}
      >
        {save.error && <QueryError error={save.error} />}
        {vehicle ? (
          <>
            <ProFormText name="plate" label="车牌" rules={[{ required: true, message: "请输入车牌" }]} fieldProps={{ maxLength: 40 }} />
            <ProFormSelect name="fuelType" label="常用油品" options={FUEL_OPTIONS} rules={[{ required: true, message: "请选择油品" }]} />
          </>
        ) : (
          <>
            <ProFormText name="name" label="姓名" rules={[{ required: true, message: "请输入司机姓名" }]} fieldProps={{ maxLength: 80 }} />
            <ProFormText name="phone" label="手机号" fieldProps={{ type: "tel", maxLength: 32 }} />
            <ProFormSwitch name="isActive" label="状态" fieldProps={{ checkedChildren: "在用", unCheckedChildren: "停用" }} />
          </>
        )}
        <ProFormTextArea name="notes" label="备注" fieldProps={{ maxLength: 500, autoSize: { minRows: 2, maxRows: 5 } }} />
      </ModalForm>
    </FuelPage>
  );
}
