"use client";

function decodeCsv(bytes: ArrayBuffer) {
  if (bytes.byteLength >= 2) {
    const prefix = new DataView(bytes).getUint16(0);
    if (prefix === 0xfffe) return new TextDecoder("utf-16le").decode(bytes);
    if (prefix === 0xfeff) return new TextDecoder("utf-16be").decode(bytes);
  }

  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("gb18030").decode(bytes);
  }
}

function cellText(value: unknown, date1904: boolean): string {
  if (value == null) return "";
  if (value instanceof Date) {
    const time = value.getTime();
    if (!Number.isFinite(time)) return "#无效日期";
    // ExcelJS converts serials 1–60 using the post-leap-bug epoch.
    // Its February 28 is the fictitious serial 60. Valid earlier dates need one day added.
    if (!date1904 && time < Date.UTC(1900, 2, 1)) {
      if (time < Date.UTC(1899, 11, 31) || time >= Date.UTC(1900, 1, 28)) return "#无效日期";
      return new Date(time + 86_400_000).toISOString().slice(0, 10);
    }
    return value.toISOString().slice(0, 10);
  }
  if (typeof value !== "object") return String(value).trim();
  if ("result" in value) return cellText(value.result, date1904);
  if ("text" in value) return cellText(value.text, date1904);
  if ("richText" in value && Array.isArray(value.richText)) {
    return value.richText.map((part: { text: string }) => part.text).join("").trim();
  }
  return "";
}

export async function readSheet(file: File): Promise<{ rows: string[][]; date1904: boolean }> {
  const extension = file.name.toLowerCase().split(".").pop();

  if (extension === "csv") {
    const { default: Papa } = await import("papaparse");
    const result = Papa.parse<string[]>(decodeCsv(await file.arrayBuffer()));
    if (result.errors.some((error) => error.code !== "UndetectableDelimiter")) {
      throw new Error("CSV 格式有误，请检查分隔符和引号。");
    }
    return { rows: result.data.map((row) => row.map((cell) => cell.trim())), date1904: false };
  }

  if (extension !== "xlsx") throw new Error("请选择 XLSX 或 CSV 文件。");

  const { Workbook } = await import("exceljs");
  const workbook = new Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const date1904 = workbook.properties.date1904 === true;
  const sheet = workbook.worksheets[0];
  if (!sheet) return { rows: [], date1904 };

  const rows: string[][] = [];
  sheet.eachRow({ includeEmpty: true }, (row) => {
    rows.push(Array.from({ length: row.cellCount }, (_, index) => cellText(row.getCell(index + 1).value, date1904)));
  });
  return { rows, date1904 };
}

export async function downloadSheet(
  filename: string,
  title: string,
  rows: (string | number | null)[][],
) {
  const { Workbook } = await import("exceljs");
  const workbook = new Workbook();
  const sheet = workbook.addWorksheet(title.slice(0, 31), {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  sheet.addRows(rows);
  sheet.getRow(1).font = { bold: true };
  const columns = rows[0]?.length ?? 0;
  for (let index = 1; index <= columns; index++) {
    const sample = rows.slice(0, 25).map((row) => String(row[index - 1] ?? "").length);
    sheet.getColumn(index).width = Math.max(13, Math.min(46, Math.max(...sample) * 1.6 + 4));
  }

  const data = await workbook.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([new Uint8Array(data)], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".xlsx") ? filename : filename + ".xlsx";
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
