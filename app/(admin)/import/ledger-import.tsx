"use client";

import { DownloadOutlined, FileExcelOutlined, UploadOutlined } from "@ant-design/icons";
import { useQueryClient } from "@tanstack/react-query";
import { Alert, App, Button, Card, Progress, Select, Table, Upload } from "antd";
import { useState } from "react";
import { AdminPage } from "@/components/admin-page";
import { ApiClientError, apiFetch, jsonRequest } from "@/lib/api-client";
import { FUEL_IMPORT_LIMIT } from "@/lib/fuel";
import { downloadSheet, readSheet } from "@/lib/spreadsheet-client";
import styles from "./ledger-import.module.css";

const fields = [
  { key: "plate", label: "车牌号", aliases: ["车牌号", "车牌", "车号", "车辆牌照", "plate", "licenseplate"] },
  { key: "date", label: "加油日期", aliases: ["加油日期", "加油时间", "日期", "date", "refueldate"] },
  { key: "liters", label: "加油量", aliases: ["加油量", "加油量升", "加油量l", "油量", "油量升", "升数", "liters", "litres"] },
  { key: "amount", label: "金额", aliases: ["金额", "金额元", "加油金额", "油费", "实付金额", "amount"] },
  { key: "odometer", label: "里程表", aliases: ["里程表", "里程表km", "里程表读数", "里程表读数km", "表显里程", "里程", "odometer"] },
  { key: "driver", label: "司机", aliases: ["司机", "司机姓名", "驾驶员", "驾驶员姓名", "driver", "drivername"] },
] as const;

type Mapping = Partial<Record<(typeof fields)[number]["key"], number>>;
type SourceRow = { rowNumber: number; cells: string[] };
type ImportIssue = { rowNumber: number; message: string };
type ImportResult = { imported: number; issues: ImportIssue[] };

function guessMapping(headers: string[]): Mapping {
  const normalized = headers.map((header) => header.normalize("NFKC")
    .replace(/[\s（）()【】\[\]_/·：:-]/g, "").toLowerCase());
  const mapping: Mapping = {};
  for (const { key, aliases } of fields) {
    const index = normalized.findIndex((header) => aliases.some((alias) => alias === header));
    if (index >= 0) mapping[key] = index;
  }
  return mapping;
}

export function LedgerImport() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [filename, setFilename] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<SourceRow[]>([]);
  const [mapping, setMapping] = useState<Mapping>({});
  const [defaultFuelType, setDefaultFuelType] = useState<"diesel" | "gasoline">("diesel");
  const [reading, setReading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [finished, setFinished] = useState(false);
  const [processed, setProcessed] = useState(0);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [problem, setProblem] = useState("");

  const mappedColumns = fields.map(({ key }) => mapping[key]);
  const complete = mappedColumns.every((column) => column !== undefined);
  const distinct = new Set(mappedColumns).size === fields.length;
  const columnOptions = headers.map((header, index) => ({
    value: index,
    label: (index + 1) + " · " + (header || "无列名"),
  }));

  async function selectFile(file: File) {
    setReading(true);
    setFinished(false);
    setProcessed(0);
    setResult(null);
    setProblem("");
    setFilename("");
    setHeaders([]);
    setRows([]);
    setMapping({});

    try {
      const cells = await readSheet(file);
      const headerIndex = cells.findIndex((row) => row.some(Boolean));
      if (headerIndex < 0) throw new Error("文件没有可用数据。");
      const data = cells.slice(headerIndex + 1)
        .map((row, index) => ({ rowNumber: headerIndex + index + 2, cells: row }))
        .filter((row) => row.cells.some(Boolean));
      const columnCount = data.reduce((width, row) => Math.max(width, row.cells.length), cells[headerIndex].length);
      const columns = Array.from({ length: columnCount }, (_, index) => cells[headerIndex][index] ?? "");
      setFilename(file.name);
      setHeaders(columns);
      setRows(data);
      setMapping(guessMapping(columns));
      if (!data.length) setProblem("文件只有表头，请填写台账后重新选择。");
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "文件读取失败。");
    } finally {
      setReading(false);
    }
  }

  async function importRows() {
    if (!complete || !distinct || !rows.length || importing || finished) return;

    setImporting(true);
    setProblem("");
    let imported = 0;
    const issues: ImportIssue[] = [];
    let start = 0;
    try {
      for (; start < rows.length; start += FUEL_IMPORT_LIMIT) {
        const batch = rows.slice(start, start + FUEL_IMPORT_LIMIT).map(({ rowNumber, cells }) => {
          const cell = (key: (typeof fields)[number]["key"], maxLength = 40) =>
            (cells[mapping[key] ?? -1] ?? "").slice(0, maxLength + 1);
          return {
            rowNumber,
            plate: cell("plate"),
            date: cell("date"),
            liters: cell("liters"),
            amount: cell("amount"),
            odometer: cell("odometer"),
            driver: cell("driver", 80),
          };
        });
        const data = await apiFetch<ImportResult>(
          "/api/fuel/import",
          jsonRequest("POST", { rows: batch, fuelType: defaultFuelType }),
        );
        imported += data.imported;
        issues.push(...data.issues);
        setProcessed(start + batch.length);
        setResult({ imported, issues: [...issues] });
      }
    } catch (error) {
      const last = rows[Math.min(start + FUEL_IMPORT_LIMIT, rows.length) - 1].rowNumber;
      const range = "第 " + rows[start].rowNumber + " 至 " + last + " 行";
      if (error instanceof ApiClientError && error.status >= 400 && error.status < 500) {
        setProblem("导入中断。" + range + "未提交成功。" + error.message);
      } else {
        setProblem("导入中断。" + range +
          "的写入状态未确认，之后的行尚未提交。请先核对台账，再重新选择待导入文件。");
      }
    } finally {
      setImporting(false);
      setFinished(true);
      await queryClient.invalidateQueries();
    }
  }

  async function template() {
    try {
      await downloadSheet("加油台账导入模板.xlsx", "加油台账", [fields.map(({ label }) => label)]);
    } catch {
      message.error("模板下载失败，请重试。");
    }
  }

  return (
    <AdminPage
      title="数据导入"
      className={styles.page}
      actions={<Button icon={<DownloadOutlined />} onClick={() => void template()}>下载模板</Button>}
    >
      <Card className={styles.card} title="上传文件">
        <div className={styles.uploadRow}>
          <div className={styles.uploadInfo}>
            <span className={styles.fileIcon} aria-hidden="true"><FileExcelOutlined /></span>
            <div className={styles.fileText}>
              {filename && <div className={styles.fileName} role="status">{filename} · {rows.length} 条记录</div>}
              <p className={styles.hint}>文件金额作为实付金额，系统反算单价。档案中缺少的车辆和司机会在导入时创建。</p>
            </div>
          </div>
          <Upload
            accept=".xlsx,.csv"
            maxCount={1}
            showUploadList={false}
            disabled={reading || importing}
            beforeUpload={(file) => {
              void selectFile(file);
              return Upload.LIST_IGNORE;
            }}
          >
            <Button type="primary" icon={<UploadOutlined />} loading={reading}>选择 XLSX 或 CSV</Button>
          </Upload>
        </div>
        {problem && <Alert className={styles.sectionGap} type="error" message={problem} showIcon />}
      </Card>
      {headers.length > 0 && (
        <Card className={styles.card} title="列映射">
          <div className={styles.mapping}>
            {fields.map(({ key, label }) => (
              <label key={key}>
                <span>{label}</span>
                <Select<number>
                  aria-label={label}
                  allowClear
                  disabled={importing || finished}
                  placeholder="请选择源文件列"
                  value={mapping[key]}
                  options={columnOptions}
                  onChange={(value) => setMapping((current) => ({ ...current, [key]: value }))}
                />
              </label>
            ))}
            <label>
              <span>新车辆默认油品</span>
              <Select
                aria-label="新车辆默认油品"
                disabled={importing || finished}
                value={defaultFuelType}
                onChange={setDefaultFuelType}
                options={[{ value: "diesel", label: "柴油" }, { value: "gasoline", label: "汽油" }]}
              />
            </label>
          </div>
          {complete && !distinct && <Alert className={styles.sectionGap} type="warning" message="每个字段请选择不同的列。" showIcon />}
        </Card>
      )}
      {rows.length > 0 && (
        <Card className={styles.card} title="前 6 行预览" extra={
          <Button type="primary" disabled={!complete || !distinct || finished}
            loading={importing} onClick={() => void importRows()}>开始导入</Button>
        }>
          <Table<SourceRow>
            rowKey="rowNumber"
            size="small"
            pagination={false}
            scroll={{ x: 680 }}
            dataSource={rows.slice(0, 6)}
            columns={[
              { title: "原文件行号", dataIndex: "rowNumber" },
              ...fields.map(({ key, label }) => ({
                key,
                title: label,
                render: (_value: unknown, row: SourceRow) => row.cells[mapping[key] ?? -1] || "—",
              })),
            ]}
          />
          {importing && <Progress className={styles.sectionGap} percent={Math.floor(processed / rows.length * 100)} />}
        </Card>
      )}
      {result && (
        <Card className={styles.card} title="导入结果">
          <Alert type={result.issues.length ? "warning" : "success"} showIcon
            message={"已导入 " + result.imported + " 条，跳过 " + result.issues.length + " 条"} />
          {result.issues.length > 0 && (
            <Table<ImportIssue>
              className={styles.sectionGap}
              rowKey="rowNumber"
              size="small"
              pagination={{ defaultPageSize: 20, showSizeChanger: false }}
              dataSource={result.issues}
              columns={[{ title: "原文件行号", dataIndex: "rowNumber", width: 130 }, { title: "跳过原因", dataIndex: "message" }]}
            />
          )}
        </Card>
      )}
    </AdminPage>
  );
}
