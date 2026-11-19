"use client";

import { DownloadOutlined, ImportOutlined, UploadOutlined } from "@ant-design/icons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Alert, App, Button, Modal, Space, Table, Typography, Upload } from "antd";
import { useState } from "react";
import { apiFetch, jsonRequest } from "@/lib/api-client";
import type { ProjectImportResult, ProjectImportRow } from "@/lib/fleet-project";
import { FUEL_IMPORT_LIMIT } from "@/lib/fuel";
import { downloadSheet, readSheet } from "@/lib/spreadsheet-client";
import { QueryError } from "./ui";

const endpoint = "/api/fuel/projects/import";
const templateColumns = ["项目", "负责人", "电话"];

function sheetRows(rows: string[][]): ProjectImportRow[] {
  const first = rows.findIndex((row) => row.some(Boolean));
  const header = first === -1 ? [] : rows[first];
  const project = header.findIndex((cell) => cell === "项目" || cell === "项目名称");
  if (project === -1) throw new Error("请在首个有内容的行填写「项目」表头，或使用导入模板。");
  const manager = header.indexOf("负责人");
  const phone = header.indexOf("电话");
  return rows.slice(first + 1).flatMap((row, index) => {
    const values = { name: row[project] ?? "", manager: row[manager] ?? "", phone: row[phone] ?? "" };
    return row.some(Boolean) ? [{ rowNumber: first + index + 2, ...values }] : [];
  });
}

export function ProjectImport() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<ProjectImportRow[]>([]);
  const [filename, setFilename] = useState("");
  const [reading, setReading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [fileError, setFileError] = useState<Error | null>(null);
  const importFile = useMutation({
    mutationFn: (items: ProjectImportRow[]) => apiFetch<ProjectImportResult>(endpoint, jsonRequest("POST", { rows: items })),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["fuel"] });
      void queryClient.invalidateQueries({ queryKey: ["parts"] });
    },
  });
  const result = importFile.data;
  const working = reading || importFile.isPending;

  function start() {
    setRows([]);
    setFilename("");
    setFileError(null);
    importFile.reset();
    setOpen(true);
  }

  async function readFile(file: File) {
    setReading(true);
    setRows([]);
    setFilename("");
    setFileError(null);
    importFile.reset();
    try {
      const rows = sheetRows((await readSheet(file)).rows);
      if (!rows.length) throw new Error("文件中没有可导入的项目。");
      if (rows.length > FUEL_IMPORT_LIMIT) throw new Error(`每次最多导入 ${FUEL_IMPORT_LIMIT} 行，请分批导入。`);
      setRows(rows);
      setFilename(file.name);
    } catch (error) {
      setFileError(error instanceof Error ? error : new Error("文件读取失败。"));
    } finally {
      setReading(false);
    }
  }

  async function downloadTemplate() {
    setDownloading(true);
    try {
      await downloadSheet("项目档案导入模板.xlsx", "项目档案", [templateColumns], [3]);
    } catch {
      message.error("模板下载失败，请重试。");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <>
      <Button icon={<ImportOutlined />} onClick={start}>批量导入项目</Button>
      <Modal
        title={result ? "项目导入结果" : "批量导入项目"}
        width={740}
        open={open}
        okText={result ? "完成" : "确认导入"}
        cancelText="取消"
        confirmLoading={working}
        okButtonProps={{ disabled: !result && rows.length === 0 }}
        cancelButtonProps={{ disabled: working, style: result ? { display: "none" } : undefined }}
        maskClosable={!working}
        keyboard={!working}
        closable={!working}
        destroyOnHidden
        onCancel={() => { if (!working) setOpen(false); }}
        onOk={() => {
          if (result) setOpen(false);
          else importFile.mutate(rows);
        }}
      >
        {result ? (
          <Space direction="vertical" size="middle" style={{ display: "flex" }}>
            <Alert
              type={result.issues.length ? "warning" : "success"}
              message={`成功导入 ${result.added} 项，跳过 ${result.issues.length} 行。`}
              showIcon
            />
            {result.issues.length > 0 && (
              <Table<ProjectImportResult["issues"][number]>
                rowKey="rowNumber"
                size="small"
                scroll={{ x: 500 }}
                dataSource={result.issues}
                pagination={result.issues.length > 8 ? { pageSize: 8, showSizeChanger: false } : false}
                columns={[
                  { title: "原文件行号", dataIndex: "rowNumber", width: 110 },
                  { title: "项目", dataIndex: "name", ellipsis: true, render: (value: string) => value || "—" },
                  { title: "跳过原因", dataIndex: "reason" },
                ]}
              />
            )}
          </Space>
        ) : (
          <Space direction="vertical" size="middle" style={{ display: "flex" }}>
            <Space wrap>
              <Button icon={<DownloadOutlined />} loading={downloading} onClick={downloadTemplate}>下载模板</Button>
              <Upload
                accept=".xlsx,.csv"
                disabled={working}
                showUploadList={false}
                beforeUpload={(file) => {
                  void readFile(file);
                  return Upload.LIST_IGNORE;
                }}
              >
                <Button type="primary" ghost icon={<UploadOutlined />} disabled={working}>选择文件</Button>
              </Upload>
            </Space>
            {fileError && <QueryError error={fileError} />}
            {importFile.error && <QueryError error={importFile.error} />}
            {rows.length ? (
              <>
                <Typography.Text strong>{filename} · {rows.length} 行</Typography.Text>
                <Table<ProjectImportRow>
                  rowKey="rowNumber"
                  size="small"
                  scroll={{ x: 500 }}
                  dataSource={rows}
                  pagination={rows.length > 8 ? { pageSize: 8, showSizeChanger: false } : false}
                  columns={[
                    { title: "原文件行号", dataIndex: "rowNumber", width: 110 },
                    { title: "项目", dataIndex: "name", ellipsis: true, render: (value: string) => value || "—" },
                    { title: "负责人", dataIndex: "manager", ellipsis: true },
                    { title: "电话", dataIndex: "phone", ellipsis: true },
                  ]}
                />
                <Typography.Text type="secondary">空项目名和同名项目会跳过，已有档案保留原值。</Typography.Text>
              </>
            ) : (
              <Typography.Text type="secondary">支持 XLSX 和 CSV。项目必填，电话列请使用文本格式。</Typography.Text>
            )}
          </Space>
        )}
      </Modal>
    </>
  );
}
