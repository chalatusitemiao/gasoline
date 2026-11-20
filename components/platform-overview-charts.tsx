"use client";

import { Column, Pie } from "@ant-design/charts";
import { Empty, Segmented } from "antd";
import { useEffect, useRef, useState, type ComponentRef, type ReactNode } from "react";
import { moneyText, numberText } from "@/components/fuel/ui";
import { formatNumber } from "@/components/reports/report-ui";
import { ReportDecimal, sharePercent } from "@/components/reports/report-values";
import type { CompanySummary } from "@/lib/company";
import reportStyles from "./reports/reports.module.css";
import styles from "./platform-overview-charts.module.css";

const metrics = {
  totalAmount: { label: "加油金额", unit: "元", color: "#1677ff", format: moneyText },
  totalLiters: { label: "加油量", unit: "升", color: "#08979c", format: (value: string) => numberText(value, 3) },
  recordCount: { label: "加油笔数", unit: "笔", color: "#597ef7", format: (value: string) => numberText(value, 0) },
  anomalyCount: { label: "异常记录", unit: "条", color: "#d48806", format: (value: string) => numberText(value, 0) },
};

type MetricKey = keyof typeof metrics;
const metricOptions = (Object.keys(metrics) as MetricKey[]).map((value) => ({ value, label: metrics[value].label }));
const comparisonLimit = 8;
const shareLimit = 5;
const shareColors = ["#1677ff", "#13a8a8", "#597ef7", "#73b72e", "#d89614", "#8c9bab"];
const compactNumber = new Intl.NumberFormat("zh-CN", { notation: "compact", maximumFractionDigits: 2 });

type ResizablePlot = ComponentRef<typeof Column> & { chart: { forceFit: () => unknown } };

function usePlotResize(visible: boolean) {
  const frame = useRef<HTMLDivElement>(null);
  const plot = useRef<ResizablePlot>(null);

  useEffect(() => {
    const element = frame.current;
    if (!visible || !element || typeof ResizeObserver === "undefined") return;

    let lastWidth = element.clientWidth;
    let pendingFrame: number | undefined;
    const observer = new ResizeObserver(() => {
      if (pendingFrame !== undefined) return;
      pendingFrame = requestAnimationFrame(() => {
        pendingFrame = undefined;
        const width = element.clientWidth;
        if (width === lastWidth) return;
        lastWidth = width;
        if (width > 0) plot.current?.chart.forceFit();
      });
    });
    observer.observe(element);

    return () => {
      observer.disconnect();
      if (pendingFrame !== undefined) cancelAnimationFrame(pendingFrame);
    };
  }, [visible]);

  return { frame, plot };
}

function rankCompanies(items: readonly CompanySummary[], metric: MetricKey) {
  return items.map((company) => ({ company, value: new ReportDecimal(company[metric]) }))
    .sort((first, second) => second.value.comparedTo(first.value) || first.company.companyCode.localeCompare(second.company.companyCode));
}

function companyNames(items: readonly CompanySummary[]) {
  const counts = new Map<string, number>();
  items.forEach(({ companyName }) => counts.set(companyName, (counts.get(companyName) ?? 0) + 1));

  return ({ companyName, companyCode }: CompanySummary) =>
    (counts.get(companyName) ?? 0) > 1 ? `${companyName} · ${companyCode}` : companyName;
}

function ChartSection({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className={reportStyles.panel} aria-label={title}>
      <div className={reportStyles.panelHeading}>
        <h2 className={reportStyles.panelTitle}>{title}</h2>
        {actions && <div className={reportStyles.panelActions}>{actions}</div>}
      </div>
      {children}
    </section>
  );
}

function ChartEmpty({ description }: { description: string }) {
  return <div className={styles.empty}><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={description} /></div>;
}

export function PlatformComparison({ items }: { items: readonly CompanySummary[] }) {
  const [metric, setMetric] = useState<MetricKey>("totalAmount");
  const definition = metrics[metric];
  const rows = rankCompanies(items, metric).slice(0, comparisonLimit);
  const nameOf = companyNames(items);
  const format = (value: string) => `${definition.format(value)} ${definition.unit}`;
  const hasValues = rows.some(({ value }) => value.gt(0));
  const { frame, plot } = usePlotResize(hasValues);
  const columnData = rows.map(({ company, value }) => ({
    key: company.companyId,
    label: nameOf(company),
    value: value.toNumber(),
    displayValue: format(value.toString()),
  }));
  const axisLabels = new Map(rows.map(({ company }) => [company.companyId, company.companyName]));

  return (
    <ChartSection title="公司业务对比" actions={(
      <Segmented<MetricKey> aria-label="公司业务对比指标" size="small" value={metric} options={metricOptions} onChange={setMetric} />
    )}>
      {hasValues ? (
        <div className={styles.comparison}>
          <div ref={frame} className={styles.plot}>
            <Column
              ref={plot}
              data={columnData}
              xField="key"
              yField="value"
              height={288}
              autoFit
              animate={false}
              containerAttributes={{ role: "img", "aria-label": `按公司对比${definition.label}，展示 ${rows.length} 家公司` }}
              scale={{ x: { domain: columnData.map(({ key }) => key), padding: 0.32 }, y: { domainMin: 0, nice: true } }}
              style={{ fill: definition.color, maxWidth: 44, radiusTopLeft: 4, radiusTopRight: 4 }}
              axis={{
                x: {
                  title: false, tick: false, labelAutoHide: true, labelAutoEllipsis: true,
                  labelFormatter: (key: string) => axisLabels.get(key) ?? "",
                },
                y: {
                  title: definition.unit, grid: true, gridStroke: "#edf0f5",
                  labelFormatter: (value: number | string) => compactNumber.format(Number(value)),
                },
              }}
              tooltip={{ title: "label", items: [{ name: definition.label, field: "displayValue" }] }}
            />
          </div>
          <div className={styles.ranking}>
            <h3 className={styles.rankingTitle}>{definition.label}排行{items.length > comparisonLimit ? ` · 前 ${comparisonLimit} 家` : ""}</h3>
            <ol className={styles.rankingList}>
              {rows.map(({ company, value }, index) => (
                <li className={styles.rankingItem} key={company.companyId}>
                  <span className={styles.rank} aria-hidden="true">{index + 1}</span>
                  <span className={styles.companyName} title={`${company.companyName} · ${company.companyCode}`}>{nameOf(company)}</span>
                  <strong className={styles.rankValue}>{format(value.toString())}</strong>
                </li>
              ))}
            </ol>
          </div>
        </div>
      ) : <ChartEmpty description={items.length ? `当前筛选下暂无${definition.label}` : "暂无匹配的公司"} />}
    </ChartSection>
  );
}

export function PlatformAmountShare({ items, totalAmount }: { items: readonly CompanySummary[]; totalAmount: string }) {
  const positive = rankCompanies(items, "totalAmount").filter(({ value }) => value.gt(0));
  const nameOf = companyNames(items);
  const slices = positive.slice(0, shareLimit).map(({ company, value }) => ({
    key: company.companyId, label: nameOf(company), title: `${company.companyName} · ${company.companyCode}`, value,
  }));
  if (positive.length > shareLimit) {
    const others = positive.slice(shareLimit);
    slices.push({
      key: "other",
      label: "其他公司",
      title: `其余 ${others.length} 家有加油金额的公司`,
      value: others.reduce((total, { value }) => total.plus(value), new ReportDecimal(0)),
    });
  }
  const shares = slices.map(({ value, ...slice }) => ({
    ...slice,
    value: value.toNumber(),
    amount: `${moneyText(value.toString())} 元`,
    percent: `${formatNumber(sharePercent(value, totalAmount))}%`,
  }));
  const hasShares = shares.length > 0;
  const { frame, plot } = usePlotResize(hasShares);

  return (
    <ChartSection title="公司加油金额占比">
      {hasShares ? (
        <div className={styles.share}>
          <div ref={frame} className={`${styles.plot} ${styles.donut}`}>
            <Pie
              ref={plot}
              data={shares}
              angleField="value"
              colorField="key"
              radius={0.86}
              innerRadius={0.61}
              height={216}
              padding={0}
              autoFit
              animate={false}
              legend={false}
              label={false}
              style={{ stroke: "#fff", lineWidth: 2 }}
              scale={{ color: { domain: shares.map(({ key }) => key), range: shareColors } }}
              containerAttributes={{ role: "img", "aria-label": `公司加油金额占比，合计 ${moneyText(totalAmount)} 元` }}
              tooltip={{ title: "label", items: [{ name: "加油金额", field: "amount" }, { name: "占比", field: "percent" }] }}
            />
            <div className={styles.donutTotal} aria-hidden="true">
              <strong>{compactNumber.format(Number(totalAmount))}</strong>
              <span>合计（元）</span>
            </div>
          </div>
          <ul className={styles.shareLegend} aria-label="各公司加油金额及占比">
            {shares.map(({ key, label, title, amount, percent }, index) => (
              <li className={styles.shareItem} key={key}>
                <span className={styles.swatch} style={{ backgroundColor: shareColors[index] }} aria-hidden="true" />
                <span className={styles.companyName} title={title}>{label}</span>
                <span className={styles.shareValue}>{amount}</span>
                <strong>{percent}</strong>
              </li>
            ))}
          </ul>
        </div>
      ) : <ChartEmpty description={items.length ? "当前筛选下暂无加油金额" : "暂无匹配的公司"} />}
    </ChartSection>
  );
}
