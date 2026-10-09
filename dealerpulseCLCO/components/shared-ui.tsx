"use client";

import { useRouter } from "next/navigation";
import { Fragment, useCallback, useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";
import Link from "next/link";
import type { Insight } from "../lib/types.ts";
import { formatCurrency } from "../lib/format.ts";
const severityLabels = {
  high: "High priority",
  medium: "Needs attention",
  low: "Monitor",
} as const;

export function Tag({
  children,
  tone = "neutral",
  title,
}: {
  children: ReactNode;
  tone?: "neutral" | "warn" | "bad";
  title?: string;
}) {
  return <span className={`tag tag-${tone}`} title={title}>{children}</span>;
}

export function TagList({ value, separator = ", " }: { value: string | null | undefined; separator?: string }) {
  const items = (value ?? "").split(separator).map((item) => item.trim()).filter(Boolean);
  if (!items.length || value === "—") return <>—</>;
  return (
    <span className="cell-tags">
      {items.map((item) => <span key={item} className="cell-tag">{item}</span>)}
    </span>
  );
}

export function CompactMultiSelect({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (values: string[]) => void;
}) {
  const selectedLabels = options
    .filter((option) => selected.includes(option.value))
    .map((option) => option.label);
  const summary = selectedLabels.length === 0
    ? `All ${label.toLowerCase()}`
    : selectedLabels.length <= 2
      ? selectedLabels.join(", ")
      : `${selectedLabels.length} selected`;

  return (
    <details className="compact-multi-select">
      <summary aria-label={`${label}: ${summary}`}>
        <span>{label}</span>
        <span className="compact-multi-select-value">{summary}</span>
      </summary>
      <div className="compact-multi-select-menu" role="group" aria-label={label}>
        <button type="button" onClick={() => onChange([])}>All {label.toLowerCase()}</button>
        {options.map((option) => (
          <label key={option.value}>
            <input
              type="checkbox"
              checked={selected.includes(option.value)}
              onChange={(event) => onChange(event.target.checked
                ? [...selected, option.value]
                : selected.filter((value) => value !== option.value))}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </details>
  );
}

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
  singleLineTakeaway = false,
  children,
}: {
  title: string;
  takeaway?: string;
  singleLineTakeaway?: boolean;
  children?: ReactNode;
}) {
  return (
    <header className="card-header">
      <div className="card-header-copy">
        <h2>{title}</h2>
        {takeaway && (
          <p
            className={singleLineTakeaway ? "card-takeaway-single-line" : undefined}
            title={singleLineTakeaway ? takeaway : undefined}
          >
            {takeaway}
          </p>
        )}
      </div>
      {children}
    </header>
  );
}

export interface PremiumTableColumn<Row> {
  label: string;
  align?: "left" | "right";
  tooltip?: string;
  /** Minimum column width in px; the table scrolls inside its card instead of squeezing. */
  minWidth?: number;
  sortValue?: (row: Row) => number | string | null;
  render: (row: Row) => ReactNode;
}

export interface PremiumTableSort {
  column: string;
  direction: "asc" | "desc";
}

export function PremiumTable<Row>({
  className,
  title,
  takeaway,
  toolbar,
  rows,
  columns,
  sortable = false,
  initialSort,
  totalsRow,
  rowKey,
  rowHref,
  highlightRow,
  emptyAction,
  emptyMessage,
  stickyFirstColumn = false,
  singleLineTakeaway = false,
  expandable,
  footer,
}: {
  className?: string;
  title: string;
  takeaway: string;
  toolbar?: ReactNode;
  rows: Row[];
  columns: PremiumTableColumn<Row>[];
  sortable?: boolean;
  initialSort?: PremiumTableSort;
  totalsRow?: ReactNode[];
  rowKey: (row: Row) => string;
  rowHref?: (row: Row) => string;
  highlightRow?: (row: Row) => boolean;
  emptyAction?: { label: string; href: string };
  emptyMessage: string;
  stickyFirstColumn?: boolean;
  singleLineTakeaway?: boolean;
  /** Inline row expansion; the caller owns the open state. */
  expandable?: { isOpen: (row: Row) => boolean; onToggle: (row: Row) => void; render: (row: Row) => ReactNode };
  footer?: ReactNode;
}) {
  const router = useRouter();
  const [sort, setSort] = useState<PremiumTableSort | null>(initialSort ?? null);
  const [fadeRight, setFadeRight] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const updateFade = useCallback(() => {
    const el = scrollRef.current;
    setFadeRight(Boolean(el && el.scrollWidth - el.clientWidth - el.scrollLeft > 1));
  }, []);
  useEffect(() => {
    updateFade();
    window.addEventListener("resize", updateFade);
    return () => window.removeEventListener("resize", updateFade);
  }, [updateFade, rows, columns.length]);
  const sortedRows = sortable && sort
    ? [...rows].sort((a, b) => {
      const column = columns.find((item) => item.label === sort.column);
      if (!column?.sortValue) return 0;
      const aValue = column.sortValue(a);
      const bValue = column.sortValue(b);
      if (aValue === null || bValue === null) {
        return aValue === bValue ? 0 : aValue === null ? 1 : -1;
      }
      const comparison = typeof aValue === "number" && typeof bValue === "number"
        ? aValue - bValue
        : String(aValue).localeCompare(String(bValue));
      return sort.direction === "asc" ? comparison : -comparison;
    })
    : rows;

  function changeSort(column: PremiumTableColumn<Row>) {
    if (!sortable || !column.sortValue) return;
    setSort((current) => ({
      column: column.label,
      direction: current?.column === column.label && current.direction === "asc" ? "desc" : "asc",
    }));
  }

  function navigate(row: Row) {
    if (rowHref) router.push(rowHref(row));
  }
  return (
    <Card className={["premium-table-card", stickyFirstColumn ? "has-sticky-first" : "", className].filter(Boolean).join(" ")}>
      <CardHeader title={title} takeaway={takeaway} singleLineTakeaway={singleLineTakeaway} />
      {toolbar && <div className="premium-table-toolbar">{toolbar}</div>}
      <div className={`premium-table-frame${fadeRight ? " has-fade-right" : ""}`}>
      <div className="premium-table-scroll" ref={scrollRef} onScroll={updateFade}>
        <table className="premium-table">
          <thead>
            <tr>{columns.map((column) => {
              const activeSort = sort?.column === column.label;
              return (
                <th
                  key={column.label}
                  scope="col"
                  title={column.tooltip}
                  style={column.minWidth ? { minWidth: column.minWidth } : undefined}
                  aria-sort={sortable && activeSort
                    ? sort.direction === "asc" ? "ascending" : "descending"
                    : undefined}
                  className={column.align === "right" ? "is-numeric" : undefined}
                >
                  {sortable && column.sortValue ? (
                    <button
                      className="premium-table-sort-button"
                      type="button"
                      onClick={() => changeSort(column)}
                      aria-label={`Sort by ${column.label} ${activeSort && sort.direction === "asc" ? "descending" : "ascending"}`}
                    >
                      {column.label}{activeSort && <span aria-hidden="true">{sort.direction === "asc" ? " ▲" : " ▼"}</span>}
                    </button>
                  ) : column.label}
                </th>
              );
            })}</tr>
          </thead>
          <tbody>
            {sortedRows.map((row) => (
              <Fragment key={rowKey(row)}>
              <tr
                tabIndex={rowHref || expandable ? 0 : undefined}
                aria-expanded={expandable ? expandable.isOpen(row) : undefined}
                className={[
                  rowHref ? "is-clickable" : "",
                  expandable ? "is-expandable" : "",
                  highlightRow?.(row) ? "is-highlighted" : "",
                ].filter(Boolean).join(" ") || undefined}
                onClick={expandable ? () => expandable.onToggle(row) : rowHref ? () => navigate(row) : undefined}
                onKeyDown={rowHref || expandable ? (event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    if (expandable) expandable.onToggle(row);
                    else navigate(row);
                  }
                } : undefined}
              >
                {columns.map((column) => (
                  <td key={column.label} className={column.align === "right" ? "is-numeric" : undefined}>
                    {column.render(row)}
                  </td>
                ))}
              </tr>
              {expandable?.isOpen(row) && (
                <tr className="premium-table-expansion-row">
                  <td colSpan={columns.length} className="premium-table-expansion">{expandable.render(row)}</td>
                </tr>
              )}
              </Fragment>
            ))}
            {!sortedRows.length && (
              <tr>
                <td colSpan={columns.length} className="premium-table-empty" role="status">
                  {emptyMessage}
                  {emptyAction && <Link href={emptyAction.href}>{emptyAction.label}</Link>}
                </td>
              </tr>
            )}
          </tbody>
          {totalsRow && (
            <tfoot>
              <tr>{columns.map((column, index) => (
                <td key={column.label} className={column.align === "right" ? "is-numeric" : undefined}>
                  {totalsRow[index]}
                </td>
              ))}</tr>
            </tfoot>
          )}
        </table>
      </div>
      </div>
      {footer}
    </Card>
  );
}

export function PageHeader({
  eyebrow,
  title,
  tagline,
  className,
  children,
  actions,
}: {
  eyebrow: string;
  title: string;
  tagline?: string;
  className: string;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className={`${className} page-summary-card`}>
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        {tagline && <p className="page-summary-tagline">{tagline}</p>}
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
