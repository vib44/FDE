"use client";

import { useRouter } from "next/navigation";
import type { ComponentProps, ReactNode } from "react";
import Link from "next/link";
import type { Insight } from "../lib/types.ts";
import { formatCurrency } from "../lib/format.ts";
const severityLabels = {
  high: "High priority",
  medium: "Needs attention",
  low: "Monitor",
} as const;

export function Card({
  className,
  ...props
}: ComponentProps<"article">) {
  return <article {...props} className={["card", className].filter(Boolean).join(" ")} />;
}

export function PageContainer({
  className,
  children,
  ...props
}: ComponentProps<"main">) {
  return (
    <main {...props} className={["dashboard", className].filter(Boolean).join(" ")}>
      {children}
    </main>
  );
}

export function Grid({
  className,
  ...props
}: ComponentProps<"div">) {
  return <div {...props} className={["layout-grid", className].filter(Boolean).join(" ")} />;
}

export function CardHeader({
  title,
  takeaway,
  children,
}: {
  title: string;
  takeaway?: string;
  children?: ReactNode;
}) {
  return (
    <header className="card-header">
      <div className="card-header-copy">
        <h2>{title}</h2>
        {takeaway && <p>{takeaway}</p>}
      </div>
      {children}
    </header>
  );
}

export interface PremiumTableColumn<Row> {
  label: string;
  align?: "left" | "right";
  render: (row: Row) => ReactNode;
}

export function PremiumTable<Row>({
  title,
  takeaway,
  rows,
  columns,
  rowKey,
  rowHref,
  highlightRow,
  emptyAction,
  emptyMessage,
}: {
  title: string;
  takeaway: string;
  rows: Row[];
  columns: PremiumTableColumn<Row>[];
  rowKey: (row: Row) => string;
  rowHref?: (row: Row) => string;
  highlightRow?: (row: Row) => boolean;
  emptyAction?: { label: string; href: string };
  emptyMessage: string;
}) {
  const router = useRouter();
  function navigate(row: Row) {
    if (rowHref) router.push(rowHref(row));
  }
  return (
    <Card className="premium-table-card">
      <CardHeader title={title} takeaway={takeaway} />
      <div className="premium-table-scroll">
        <table className="premium-table">
          <thead>
            <tr>{columns.map((column) => (
              <th key={column.label} scope="col" className={column.align === "right" ? "is-numeric" : undefined}>
                {column.label}
              </th>
            ))}</tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={rowKey(row)}
                tabIndex={rowHref ? 0 : undefined}
                className={[
                  rowHref ? "is-clickable" : "",
                  highlightRow?.(row) ? "is-highlighted" : "",
                ].filter(Boolean).join(" ") || undefined}
                onClick={rowHref ? () => navigate(row) : undefined}
                onKeyDown={rowHref ? (event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    navigate(row);
                  }
                } : undefined}
              >
                {columns.map((column) => (
                  <td key={column.label} className={column.align === "right" ? "is-numeric" : undefined}>
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={columns.length} className="premium-table-empty" role="status">
                  {emptyMessage}
                  {emptyAction && <Link href={emptyAction.href}>{emptyAction.label}</Link>}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export function PageHeader({
  eyebrow,
  title,
  className,
  children,
  actions,
}: {
  eyebrow: string;
  title: string;
  className: string;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className={className}>
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        {children}
      </div>
      {actions}
    </header>
  );
}

export function InsightCard({
  insight,
  href,
  linkLabel,
}: {
  insight: Pick<Insight, "severity" | "headline" | "evidence" | "owner" | "rupeeImpact" | "action"> & {
    impactLabel?: string | null;
  };
  href: string;
  linkLabel: string;
}) {
  return (
    <li className={`insight-card severity-${insight.severity}`}>
      <div className="insight-content">
        <div className="insight-title-row">
          <h3>{insight.headline}</h3>
          <span className={`insight-severity severity-${insight.severity}`}>{severityLabels[insight.severity]}</span>
        </div>
        <p className="insight-evidence">{insight.evidence}</p>
        <p className="insight-details">
          <span>
            <strong>Impact:</strong>{" "}
            {insight.impactLabel ? `${insight.impactLabel} · ` : ""}
            {formatCurrency(insight.rupeeImpact)}
          </span>
          <span><strong>Owner:</strong> {insight.owner}</span>
        </p>
        <p className="insight-action"><strong>Next action:</strong> {insight.action}</p>
      </div>
      <Link className="insight-link" href={href}>
        {linkLabel}{linkLabel === "View" && <> <span aria-hidden="true">→</span></>}
      </Link>
    </li>
  );
}
