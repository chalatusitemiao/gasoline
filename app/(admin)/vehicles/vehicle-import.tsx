"use client";

import { ImportOutlined, UploadOutlined } from "@ant-design/icons";
import { ProForm, ProFormSelect, ProFormTextArea } from "@ant-design/pro-components";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, Card, Form, Input, Modal, Select, Space, Tabs, Upload } from "antd";
import { useState } from "react";
import { FUEL_OPTIONS, QueryError } from "@/components/fuel/ui";
import { apiFetch, jsonRequest } from "@/lib/api-client";
import { FUEL_IMPORT_LIMIT, plateKey, type FuelType } from "@/lib/fuel";
import { readSheet } from "@/lib/spreadsheet-client";
import styles from "./vehicle-import.module.css";

type Fields = { fuelType: FuelType; notes?: string };
type Result = { added: string[]; existing: string[]; invalid: string[] };
type Sheet = { rows: string[][]; filename: string; header: number | null; columns: number[] };

function guessPlateColumn(rows: string[][]) {
  const headerPattern = /^(?:车辆)?(?:车牌(?:号(?:码)?)?|号牌(?:号(?:码)?)?|牌照(?:号(?:码)?)?|(?:license)?plate(?:no|number)?)$/iu;
  for (const [index, row] of rows.slice(0, 12).entries()) {
    const column = row.findIndex((value) => headerPattern.test(value.replace(/[\s_-]+/g, "")));
    if (column !== -1) return { header: index, column };
  }

  const scores = new Map<number, number>();
  for (const row of rows.slice(0, 30)) {
    row.forEach((raw, column) => {
      const value = plateKey(raw);
      const score = /^[\p{Script=Han}][A-Z][A-Z0-9]{5,7}$/u.test(value) ? 5
        : /[A-Z]/.test(value) && /[0-9]/.test(value) && /^[A-Z0-9]{5,12}$/.test(value) ? 2
        : 0;
      if (score) scores.set(column, (scores.get(column) ?? 0) + score);
    });
  }
  const best = [...scores.entries()].sort((a, b) => b[1] - a[1])[0];
  return { header: null, column: best?.[0] ?? 0 };
}

export function VehicleImport() {
  const queryClient = useQueryClient();
  const [form] = Form.useForm<Fields>();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"paste" | "file">("paste");
  const [pasted, setPasted] = useState("");
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [column, setColumn] = useState(0);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const importPlates = useMutation({
    mutationFn: (values: Fields & { plates: string[] }) =>
      apiFetch<Result>("/api/fuel/vehicles/import", jsonRequest("POST", values)),
  });

  const source = mode === "paste"
    ? pasted.split(/[\n\r,，;；]+/)
    : sheet?.rows.slice((sheet.header ?? -1) + 1).map((row) => row[column] ?? "") ?? [];
  const plates = source.map((plate) => plate.trim()).filter(Boolean);
  const working = reading || importPlates.isPending;

  function start() {
    setMode("paste");
    setPasted("");
    setSheet(null);
    setColumn(0);
    setResult(null);
    setError("");
    importPlates.reset();
    setOpen(true);
  }

  async function chooseFile(file: File) {
    setReading(true);
    setError("");
    setSheet(null);
    try {
      const rows = await readSheet(file);
      const columns = [...new Set(rows.flatMap((row) => row.flatMap((value, index) => value ? [index] : [])))].sort((a, b) => a - b);
      if (columns.length === 0) throw new Error("文件中没有可读取的数据。");
      const guess = guessPlateColumn(rows);
      setColumn(columns.includes(guess.column) ? guess.column : columns[0]);
      setSheet({ rows, filename: file.name, header: guess.header, columns });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "文件读取失败。");
    } finally {
      setReading(false);
    }
  }

  async function submit(values: Fields) {
    setError("");
    if (!plates.length) {
      setError("请粘贴车牌或从文件选择包含车牌的列。");
      return;
    }
    if (plates.length > FUEL_IMPORT_LIMIT) {
      setError(`每次最多导入 ${FUEL_IMPORT_LIMIT} 个车牌，请分批提交。`);
      return;
    }

    try {
      const response = await importPlates.mutateAsync({ ...values, plates });
      setResult(response);
      void queryClient.invalidateQueries({ queryKey: ["fuel"] });
    } catch {
      // Render the mutation error beside the input.
    }
  }

  return (
    <>
      <Button icon={<ImportOutlined />} onClick={start}>批量导入车辆</Button>
      <Modal
        title={result ? "车辆导入结果" : "批量导入车辆"}
        width={620}
        open={open}
        okText={result ? "完成" : "导入"}
        cancelText="取消"
        confirmLoading={working}
        maskClosable={!working}
        keyboard={!working}
        closable={!working}
        cancelButtonProps={{ disabled: working, style: result ? { display: "none" } : undefined }}
        destroyOnHidden
        onCancel={() => { if (!working) setOpen(false); }}
        onOk={() => { if (result) setOpen(false); else form.submit(); }}
      >
        {result ? (
          <div className={styles.results}>
            {([
              ["新增", result.added],
              ["已存在", result.existing],
              ["无法识别", result.invalid],
            ] as const).map(([label, list]) => (
              <Card size="small" key={label} title={`${label}（${list.length}）`}>
                <div className={styles.resultList}>{list.length ? list.join("、") : "—"}</div>
              </Card>
            ))}
          </div>
        ) : (
          <ProForm<Fields> form={form} clearOnDestroy disabled={working} submitter={false} onFinish={submit}>
            <Tabs
              activeKey={mode}
              onChange={(key) => { setMode(key === "file" ? "file" : "paste"); setError(""); }}
              items={[
                {
                  key: "paste", label: "粘贴车牌", disabled: working,
                  children: (
                    <Input.TextArea
                      aria-label="粘贴车牌"
                      placeholder="每行一个车牌，或用逗号、分号分隔"
                      value={pasted}
                      rows={5}
                      disabled={working}
                      onChange={(event) => setPasted(event.target.value)}
                    />
                  ),
                },
                {
                  key: "file", label: "上传 Excel / CSV", disabled: working,
                  children: (
                    <Space direction="vertical" className={styles.fileControls}>
                      <Upload
                        accept=".xlsx,.csv"
                        disabled={working}
                        showUploadList={false}
                        beforeUpload={(file) => { void chooseFile(file); return Upload.LIST_IGNORE; }}
                      >
                        <Button icon={<UploadOutlined />} disabled={working} loading={reading}>选择文件</Button>
                      </Upload>
                      {sheet && (
                        <>
                          <span>{sheet.filename}</span>
                          <Select
                            aria-label="车牌所在列"
                            value={column}
                            disabled={working}
                            className={styles.column}
                            onChange={setColumn}
                            options={sheet.columns.map((index) => {
                              const header = sheet.header == null ? "" : sheet.rows[sheet.header]?.[index];
                              return {
                                label: `第 ${index + 1} 列${header ? `（${header}）` : ""}`,
                                value: index,
                              };
                            })}
                          />
                          <span className={styles.count}>只读取所选列{plates.length ? `。预览：${plates.slice(0, 3).join("、")}` : "。"}</span>
                        </>
                      )}
                    </Space>
                  ),
                },
              ]}
            />
            <p className={styles.count}>待导入 {plates.length} 个车牌</p>
            {error && <Alert className={styles.error} type="error" showIcon message={error} />}
            {importPlates.error && <QueryError error={importPlates.error} />}
            <ProFormSelect name="fuelType" label="统一常用油品" options={FUEL_OPTIONS} rules={[{ required: true, message: "请选择油品" }]} />
            <ProFormTextArea name="notes" label="统一备注" fieldProps={{ maxLength: 500, autoSize: { minRows: 2, maxRows: 4 } }} />
          </ProForm>
        )}
      </Modal>
    </>
  );
}
