import Link from "next/link";
import { Trophy } from "lucide-react";
import { formatNumber } from "../lib/format.ts";
import { Card, CardHeader } from "./shared-ui.tsx";

export interface RankListRow {
  id: string;
  name: string;
  href?: string;
  value: string;
  valueDetail?: string;
  secondary: string;
  barValue: number;
  barLabel?: string;
}

export function RankListCard({
  title,
  takeaway,
  rows,
  emptyMessage,
  className,
}: {
  title: string;
  takeaway: string;
  rows: RankListRow[];
  emptyMessage: string;
  className?: string;
}) {
  return (
    <Card className={["rank-list-card", className].filter(Boolean).join(" ")}>
      <CardHeader title={title} takeaway={takeaway} />
      <ol className="delivery-branch-rank-list">
        {rows.map((row, index) => {
          const content = (
            <>
              <span className={`delivery-rank-badge${index === 0 ? " is-first" : ""}`}>
                {index === 0 && <Trophy aria-hidden="true" />}
                {formatNumber(index + 1)}
              </span>
              <span className="delivery-rank-main">
                <span className="delivery-rank-name">
                  <span className="delivery-rank-name-text" title={row.name}>{row.name}</span>
                </span>
                <span className="rank-list-secondary">{row.secondary}</span>
                <span className="delivery-rank-meta">
                  <span className="delivery-rank-track" aria-hidden="true">
                    <span style={{ width: `${Math.max(0, Math.min(100, row.barValue * 100))}%` }} />
                  </span>
                  {row.barLabel && <span className="delivery-rank-delay">{row.barLabel}</span>}
                </span>
              </span>
              <span className="rank-list-values">
                <strong className="delivery-rank-days">{row.value}</strong>
                {row.valueDetail && <span className="rank-list-value-detail">{row.valueDetail}</span>}
              </span>
            </>
          );
          return (
            <li key={row.id}>
              {row.href ? (
                <Link className="delivery-branch-rank-row" href={row.href} title={`View ${row.name}`}>
                  {content}
                </Link>
              ) : (
                <div className="delivery-branch-rank-row">{content}</div>
              )}
            </li>
          );
        })}
        {!rows.length && <li className="delivery-rank-empty">{emptyMessage}</li>}
      </ol>
    </Card>
  );
}
