"use client";

import { PlusOutlined } from "@ant-design/icons";
import { ModalForm, ProFormDigit, ProFormSelect, ProFormSwitch, ProFormText, ProFormTextArea, ProTable, type ProColumns } from "@ant-design/pro-components";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { App, Button, Form, Input, Space, Tag, Tooltip } from "antd";
import { useState, type ReactNode } from "react";
import { useAppNavigation } from "@/components/app-navigation";
import { DateInput } from "@/components/date-input";
import { apiFetch, jsonRequest } from "@/lib/api-client";
import type { FleetProjectOption } from "@/lib/fleet-project";
import { driverInputSchema, FUEL_PAGE_SIZE, vehicleInputSchema, type Driver, type FuelPage as PageData, type FuelType, type Vehicle } from "@/lib/fuel";
import { FUEL_OPTIONS, FuelPage, fuelText, moneyText, numberText, QueryError, tablePagination } from "./ui";
import styles from "./ui.module.css";

type ArchiveRow = Vehicle | Driver;
type Fields = {
  plate?: string;
  fuelType?: FuelType;
  name?: string;
  phone?: string;
  isActive?: boolean;
  projectId?: string | null;
  purchaseDate?: string | null;
  purchasePrice?: string | number | null;
  notes?: string;
};

const projectColumn: ProColumns<ArchiveRow> = {
  title: "项目",
  dataIndex: "projectName",
  width: 170,
  ellipsis: true,
  renderText: (value: string | null | undefined, row) =>
    value ? row.projectIsActive === false ? `${value}（停用）` : value : "—",
};

const vehicleColumns: ProColumns<ArchiveRow>[] = [
  { title: "车牌", dataIndex: "plate", width: 135 },
  projectColumn,
  { title: "常用油品", dataIndex: "fuelType", width: 110, renderText: fuelText },
  { title: "购入日期", dataIndex: "purchaseDate", width: 125, renderText: (value: string | null | undefined) => value || "—" },
  { title: "加油次数", dataIndex: "refuelCount", width: 115, align: "right" },
  { title: "上次加油日期", dataIndex: "lastDate", width: 140 },
  { title: "上次里程（km）", dataIndex: "lastOdometer", width: 145, align: "right", renderText: (value: string | null) => numberText(value) },
  { title: "备注", dataIndex: "notes", ellipsis: true },
];

const driverColumns: ProColumns<ArchiveRow>[] = [
  { title: "司机", dataIndex: "name", width: 205, ellipsis: true },
  projectColumn,
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
  return "plate" in row ? row.plate : row.name;
}

function editValues(vehicle: boolean, canViewPurchasePrice: boolean, row?: ArchiveRow): Fields {
  if (!row) return vehicle ? {} : { isActive: true };
  const common = { projectId: row.projectId ?? undefined, notes: row.notes ?? "" };
  if ("plate" in row) {
    return {
      ...common,
      plate: row.plate,
      fuelType: row.fuelType,
      purchaseDate: row.purchaseDate ?? undefined,
      ...(canViewPurchasePrice ? { purchasePrice: row.purchasePrice ?? undefined } : {}),
    };
  }
  return { ...common, name: row.name, phone: row.phone ?? "", isActive: row.isActive };
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
  const { companyId, permissions = [] } = useAppNavigation();
  const canManage = permissions.includes("archives:manage");
  const canImport = permissions.includes("archives:import");
  const canViewPurchasePrice = permissions.includes("archives:purchase-price");
  const queryClient = useQueryClient();
  const [form] = Form.useForm<Fields>();
  const [pagination, setPagination] = useState({ page: 1, pageSize: FUEL_PAGE_SIZE });
  const [keyword, setKeyword] = useState("");
  const [editor, setEditor] = useState<{ row?: ArchiveRow } | null>(null);
  const endpoint = `/api/fuel/${kind}`;

  const list = useQuery({
    queryKey: ["fuel", kind, keyword, pagination, companyId, canViewPurchasePrice] as const,
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({
        page: String(pagination.page),
        pageSize: String(pagination.pageSize),
        keyword,
      });
      return apiFetch<PageData<ArchiveRow>>(`${endpoint}?${params}`, { signal });
    },
    placeholderData: (previous, query) =>
      query?.queryKey[2] === keyword && query.queryKey[3].pageSize === pagination.pageSize &&
      query.queryKey[4] === companyId && query.queryKey[5] === canViewPurchasePrice
        ? previous
        : undefined,
  });
  const projects = useQuery({
    queryKey: ["fuel", "projects", "options"],
    queryFn: ({ signal }) => apiFetch<FleetProjectOption[]>("/api/fuel/projects/options", { signal }),
    enabled: canManage && Boolean(editor),
  });
  const save = useMutation({
    mutationFn: (values: Fields) => apiFetch(
      editor?.row ? `${endpoint}/${encodeURIComponent(editor.row.id)}` : endpoint,
      jsonRequest(editor?.row ? "PUT" : "POST", values),
    ),
  });

  async function submit(values: Fields) {
    const result = (vehicle ? vehicleInputSchema : driverInputSchema).safeParse({
      ...values,
      projectId: values.projectId ?? null,
      ...(vehicle ? { purchaseDate: values.purchaseDate || null } : {}),
      ...(vehicle && canViewPurchasePrice ? { purchasePrice: values.purchasePrice ?? null } : {}),
    });
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
      void queryClient.invalidateQueries({ queryKey: ["parts"] });
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
          void queryClient.invalidateQueries({ queryKey: ["parts"] });
          message.success(`${label}已删除。`);
        } catch (error) {
          message.error(error instanceof Error ? error.message : "删除失败。");
          throw error;
        }
      },
    });
  }

  const currentProject = editor?.row;
  const projectOptions = (projects.data ?? [])
    .filter((project) => project.isActive || project.id === currentProject?.projectId)
    .map((project) => ({ value: project.id, label: project.isActive ? project.name : `${project.name}（停用）` }));
  if (currentProject?.projectId && currentProject.projectName && !projectOptions.some(({ value }) => value === currentProject.projectId)) {
    projectOptions.push({
      value: currentProject.projectId,
      label: currentProject.projectIsActive === false ? `${currentProject.projectName}（停用）` : currentProject.projectName,
    });
  }

  const columns: ProColumns<ArchiveRow>[] = [
    ...(vehicle && canViewPurchasePrice
      ? [
          ...vehicleColumns.slice(0, 4),
          { title: "购入价格（元）", dataIndex: "purchasePrice", width: 145, align: "right" as const, renderText: moneyText },
          ...vehicleColumns.slice(4),
        ]
      : vehicle ? vehicleColumns : driverColumns),
    ...(canManage ? [{
      title: "操作",
      width: 115,
      render: (_: unknown, row: ArchiveRow) => {
        const linkedReason = (row.refuelCount ?? 0) > 0
          ? "已有加油记录，无法删除"
          : "hasPartRecords" in row && row.hasPartRecords ? "已有配件历史，无法删除" : undefined;
        return (
          <Space size={0}>
            <Button size="small" type="link" onClick={() => setEditor({ row })}>修改</Button>
            <Tooltip title={linkedReason}>
              <span>
                <Button size="small" type="link" danger disabled={Boolean(linkedReason)} onClick={() => remove(row)}>删除</Button>
              </span>
            </Tooltip>
          </Space>
        );
      },
    }] : []),
  ];

  return (
    <FuelPage title={`${label}档案`} actions={
      <Space wrap>
        {canImport && extraAction}
        {canManage && <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditor({})}>新增{label}</Button>}
      </Space>
    }>
      {list.error && <QueryError error={list.error} retry={() => { void list.refetch(); }} />}
      <ProTable<ArchiveRow>
        className={styles.table}
        rowKey="id"
        columns={columns}
        dataSource={list.data?.items ?? []}
        loading={list.isFetching && (!list.data || list.isPlaceholderData)}
        search={false}
        options={false}
        scroll={{ x: vehicle ? (canViewPurchasePrice ? 1320 : 1180) : 970 }}
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
        initialValues={editValues(vehicle, canViewPurchasePrice, editor?.row)}
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
        {projects.error && <QueryError error={projects.error} retry={() => { void projects.refetch(); }} />}
        <ProFormSelect
          name="projectId"
          label="项目"
          placeholder="选择项目"
          options={projectOptions}
          fieldProps={{ allowClear: true, showSearch: true, optionFilterProp: "label", loading: projects.isFetching }}
        />
        {vehicle && (
          <Form.Item name="purchaseDate" label="购入日期">
            <DateInput />
          </Form.Item>
        )}
        {vehicle && canViewPurchasePrice && <ProFormDigit
          name="purchasePrice"
          label="购入价格（元）"
          fieldProps={{ min: 0, precision: 2, stringMode: true, controls: false, placeholder: "输入购入价格" }}
        />}
        <ProFormTextArea name="notes" label="备注" fieldProps={{ maxLength: 500, autoSize: { minRows: 2, maxRows: 5 } }} />
      </ModalForm>
    </FuelPage>
  );
}
