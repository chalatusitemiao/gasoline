"use client";

import { PlusOutlined } from "@ant-design/icons";
import { ModalForm, ProFormSwitch, ProFormText, ProTable, type ProColumns } from "@ant-design/pro-components";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { App, Button, Form, Input, Select, Space, Tag } from "antd";
import { useState } from "react";
import { useAppNavigation } from "@/components/app-navigation";
import { apiFetch, jsonRequest } from "@/lib/api-client";
import { projectInputSchema, type FleetProject } from "@/lib/fleet-project";
import { FUEL_PAGE_SIZE, type FuelPage as PageData } from "@/lib/fuel";
import { ProjectImport } from "./project-import";
import { FuelPage, QueryError, tablePagination } from "./ui";
import styles from "./ui.module.css";

type Fields = Pick<FleetProject, "name" | "manager" | "phone" | "isActive">;
const endpoint = "/api/fuel/projects";
const statusOptions = [
  { value: "true", label: "在用" },
  { value: "false", label: "停用" },
];
const projectColumns: ProColumns<FleetProject>[] = [
  { title: "项目", dataIndex: "name", width: 300, ellipsis: true },
  { title: "负责人", dataIndex: "manager", width: 145, ellipsis: true },
  { title: "电话", dataIndex: "phone", width: 170, ellipsis: true },
  {
    title: "状态",
    dataIndex: "isActive",
    width: 100,
    render: (_, row) => <Tag color={row.isActive ? "success" : "default"}>{row.isActive ? "在用" : "停用"}</Tag>,
  },
];

export function ProjectManager() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const { companyId, permissions = [] } = useAppNavigation();
  const canManage = permissions.includes("archives:manage");
  const canImport = permissions.includes("archives:import");
  const [form] = Form.useForm<Fields>();
  const [keyword, setKeyword] = useState("");
  const [isActive, setIsActive] = useState<string>();
  const [pagination, setPagination] = useState({ page: 1, pageSize: FUEL_PAGE_SIZE });
  const [editor, setEditor] = useState<{ row?: FleetProject } | null>(null);
  const list = useQuery({
    queryKey: ["fuel", "projects", "list", companyId, keyword, isActive, pagination] as const,
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({
        keyword,
        page: String(pagination.page),
        pageSize: String(pagination.pageSize),
      });
      if (isActive) params.set("isActive", isActive);
      return apiFetch<PageData<FleetProject>>(`${endpoint}?${params}`, { signal });
    },
  });
  const save = useMutation({
    mutationFn: (fields: Partial<Fields>) => apiFetch<FleetProject>(
      editor?.row ? `${endpoint}/${encodeURIComponent(editor.row.id)}` : endpoint,
      jsonRequest(editor?.row ? "PUT" : "POST", fields),
    ),
  });

  function firstPage() {
    setPagination((previous) => ({ ...previous, page: 1 }));
  }

  async function submit(values: Fields) {
    const result = projectInputSchema.safeParse(values);
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
      firstPage();
      message.success("项目已保存。");
      return true;
    } catch {
      return false;
    }
  }

  const columns: ProColumns<FleetProject>[] = [
    ...projectColumns,
    ...(canManage ? [{
      title: "操作",
      width: 100,
      render: (_: unknown, row: FleetProject) => (
        <Button size="small" type="link" onClick={() => setEditor({ row })}>修改</Button>
      ),
    }] : []),
  ];

  return (
    <FuelPage title="项目档案" actions={
      <Space wrap>
        {canImport && <ProjectImport />}
        {canManage && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditor({})}>新增项目</Button>
        )}
      </Space>
    }>
      {list.error && <QueryError error={list.error} retry={() => { void list.refetch(); }} />}
      <ProTable<FleetProject>
        className={styles.table}
        rowKey="id"
        columns={columns}
        dataSource={list.data?.items ?? []}
        loading={list.isFetching && !list.data}
        search={false}
        options={false}
        scroll={{ x: 800 }}
        pagination={tablePagination(pagination, list.data?.total ?? 0, setPagination)}
        locale={{ emptyText: "暂无项目" }}
        headerTitle={
          <Space wrap>
            <Input.Search
              className={styles.search}
              aria-label="搜索项目、负责人或电话"
              placeholder="搜索项目、负责人或电话"
              maxLength={100}
              allowClear
              onSearch={(value) => {
                setKeyword(value.trim());
                firstPage();
              }}
            />
            <Select
              aria-label="项目状态"
              placeholder="全部状态"
              style={{ width: 112 }}
              allowClear
              value={isActive}
              options={statusOptions}
              onChange={(value) => {
                setIsActive(value);
                firstPage();
              }}
            />
          </Space>
        }
      />
      <ModalForm<Fields>
        key={editor?.row?.id ?? (editor ? "create" : "closed")}
        form={form}
        open={Boolean(editor)}
        width={480}
        title={editor?.row ? "修改项目" : "新增项目"}
        initialValues={editor?.row ?? { isActive: true }}
        clearOnDestroy
        onOpenChange={(visible) => {
          if (!visible) {
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
        <ProFormText
          name="name"
          label="项目"
          rules={[{ required: true, message: "请输入项目名称" }]}
          fieldProps={{ maxLength: 120 }}
        />
        <ProFormText name="manager" label="负责人" fieldProps={{ maxLength: 80 }} />
        <ProFormText name="phone" label="电话" fieldProps={{ type: "tel", maxLength: 40 }} />
        <ProFormSwitch name="isActive" label="状态" fieldProps={{ checkedChildren: "在用", unCheckedChildren: "停用" }} />
      </ModalForm>
    </FuelPage>
  );
}
