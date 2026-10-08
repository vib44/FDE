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
  empty: boolean;
  emptyMessage: string;
  control?: ReactNode;
  onClick?: (event: ECElementEvent) => void;
}) {
  return (
    <Card className="chart-panel">
      <div className="chart-heading">
        <h3>{title}</h3>
        <p>{takeaway}</p>
        <small className="chart-period">{period}</small>
        {control}
      </div>
      <Chart option={option} ariaLabel={label} empty={empty} emptyMessage={emptyMessage} onClick={onClick} />
    </Card>
  );
}
