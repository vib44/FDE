import type { ReactNode } from "react";
import type { EChartsCoreOption, ECElementEvent } from "echarts/core";
import { Chart } from "./chart.tsx";
import { Card } from "./shared-ui.tsx";

export function ChartPanel({
  title,
  takeaway,
  label,
  period,
  option,
  chartHeight,
  fillHeight = false,
  empty,
  emptyMessage,
  control,
  onClick,
}: {
  title: string;
  takeaway: string;
  label: string;
  period: string;
  option: EChartsCoreOption;
  chartHeight?: number;
  fillHeight?: boolean;
  empty: boolean;
  emptyMessage: string;
  control?: ReactNode;
  onClick?: (event: ECElementEvent) => void;
}) {
  return (
    <Card className={fillHeight ? "chart-panel chart-panel-fill" : "chart-panel"}>
      <div className="chart-heading">
        <h3>{title}</h3>
        {fillHeight ? (
          <p>{takeaway} <span className="chart-period">· {period}</span></p>
        ) : (
          <>
            <p>{takeaway}</p>
            <small className="chart-period">{period}</small>
          </>
        )}
        {control}
      </div>
      <Chart
        option={option}
        ariaLabel={label}
        height={chartHeight}
        empty={empty}
        emptyMessage={emptyMessage}
        onClick={onClick}
      />
    </Card>
  );
}
