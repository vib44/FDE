"use client";

import { useEffect, useRef } from "react";
import * as echarts from "echarts/core";
import type { EChartsCoreOption, EChartsType, ECElementEvent } from "echarts/core";
import { BarChart, FunnelChart, HeatmapChart, LineChart, ScatterChart } from "echarts/charts";
import {
  AriaComponent,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  VisualMapComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";

echarts.use([
  BarChart,
  FunnelChart,
  HeatmapChart,
  LineChart,
  ScatterChart,
  AriaComponent,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  VisualMapComponent,
  CanvasRenderer,
]);

interface ChartProps {
  option: EChartsCoreOption;
  ariaLabel: string;
  empty?: boolean;
  emptyMessage?: string;
  loading?: boolean;
  onClick?: (event: ECElementEvent) => void;
}

export function Chart({
  option,
  ariaLabel,
  empty = false,
  emptyMessage = "No records match the current view. Try adjusting the dashboard filters.",
  loading = false,
  onClick,
}: ChartProps) {
  const host = useRef<HTMLDivElement>(null);
  const chart = useRef<EChartsType | null>(null);
  const clickHandler = useRef(onClick);

  useEffect(() => {
    clickHandler.current = onClick;
  }, [onClick]);

  useEffect(() => {
    const hostElement = host.current;
    if (!hostElement) return;

    const instance = echarts.init(hostElement);
    chart.current = instance;
    const observer = new ResizeObserver(() => instance.resize());
    observer.observe(hostElement);
    const handleClick = (event: ECElementEvent) => clickHandler.current?.(event);
    instance.on("click", handleClick);
    instance.setOption(option, true);

    return () => {
      observer.disconnect();
      instance.off("click", handleClick);
      instance.dispose();
      if (chart.current === instance) chart.current = null;
    };
  }, []);

  useEffect(() => {
    chart.current?.setOption(option, true);
  }, [option]);

  if (loading) {
    return <div className="chart-skeleton" aria-hidden="true" />;
  }
  if (empty) {
    return (
      <div className="chart-empty" role="status">
        <span className="empty-state-icon" aria-hidden="true">∅</span>
        <strong>No chart data</strong>
        <p>{emptyMessage}</p>
      </div>
    );
  }
  return (
    <div
      className={`chart-canvas${onClick ? " is-interactive" : ""}`}
      ref={host}
      role="img"
      aria-label={ariaLabel}
    />
  );
}
