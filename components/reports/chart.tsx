"use client";

import type { EChartsOption } from "echarts";
import { BarChart, LineChart, PieChart } from "echarts/charts";
import {
  AriaComponent,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  TitleComponent,
  TooltipComponent,
} from "echarts/components";
import { init, use as registerECharts, type EChartsType } from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import { useEffect, useRef } from "react";
import styles from "./reports.module.css";

registerECharts([
  BarChart,
  LineChart,
  PieChart,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  TitleComponent,
  TooltipComponent,
  AriaComponent,
  CanvasRenderer,
]);

export default function Chart({
  option,
  height,
  label,
}: {
  option: EChartsOption;
  height: number;
  label: string;
}) {
  const element = useRef<HTMLDivElement>(null);
  const chart = useRef<EChartsType | null>(null);

  useEffect(() => {
    if (!element.current) return;

    const instance = init(element.current);
    chart.current = instance;
    const observer = new ResizeObserver(() => instance.resize());
    observer.observe(element.current);

    return () => {
      observer.disconnect();
      instance.dispose();
      chart.current = null;
    };
  }, []);

  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    chart.current?.setOption({
      ...option,
      ...(reduceMotion ? { animation: false } : {}),
      aria: { enabled: true, label: { description: label } },
    }, { notMerge: true });
  }, [label, option]);

  return <div ref={element} className={styles.chartCanvas} style={{ height, minWidth: 0 }} role="img" aria-label={label} />;
}
