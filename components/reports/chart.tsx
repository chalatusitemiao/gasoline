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
import { init, use as registerECharts, type ECElementEvent, type EChartsType } from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import { useEffect, useRef } from "react";

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
  label,
  onSeriesClick,
}: {
  option: EChartsOption;
  label: string;
  onSeriesClick?: (index: number) => void;
}) {
  const element = useRef<HTMLDivElement>(null);
  const chart = useRef<EChartsType | null>(null);

  useEffect(() => {
    const node = element.current;
    if (!node) return;

    const instance = init(node);
    chart.current = instance;
    let width = node.clientWidth;
    let height = node.clientHeight;
    const observer = new ResizeObserver(() => {
      const nextWidth = node.clientWidth;
      const nextHeight = node.clientHeight;
      if (nextWidth === width && nextHeight === height) return;
      width = nextWidth;
      height = nextHeight;
      instance.resize();
    });
    observer.observe(node);

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

  useEffect(() => {
    const instance = chart.current;
    if (!instance || !onSeriesClick) return;
    function select(event: ECElementEvent) {
      if (event.componentType === "series" && Number.isInteger(event.dataIndex)) onSeriesClick?.(event.dataIndex);
    }
    instance.on("click", select);
    return () => {
      if (!instance.isDisposed()) instance.off("click", select);
    };
  }, [onSeriesClick]);

  return <div ref={element} style={{ height: "100%" }} role="img" aria-label={label} />;
}
