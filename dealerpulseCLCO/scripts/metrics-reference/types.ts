import type { Dataset, FilterState } from "../../lib/types.ts";
import { formatCurrency, formatNumber, formatPercent } from "../../lib/format.ts";

/** Dev-only helpers for scripts/export-metrics-reference.ts. Never imported by the app. */

export interface Ctx {
  ds: Dataset;
  /** Always EMPTY_FILTERS: full period, no branch/source/model filter, created-date basis. */
  filters: FilterState;
}

/** One metric shown on a page. Every text value that holds a number must be built from real function output. */
export interface MetricRow {
  /** e.g. "KPI card: Test drives" or "Table: Branch delivery scorecard". Rows are grouped by this. */
  section: string;
  /** Exactly as shown on screen. */
  label: string;
  /** Company / Branch / Rep / Stage / Step / Source / Model / Month / Customer */
  level: string;
  /** e.g. "5 branches" (build the count from data) or "—". */
  across: string;
  /** JSON fields, e.g. "leads.status_history". */
  fields: string;
  /** Which filters the UI applies to this metric. */
  filters: string;
  /** Formatted full-period value, or "see breakdown sheet". */
  value: string;
  /** Function name and file path. If no function exists write "NO MATCHING FUNCTION (calculated inside <component path>)". */
  codeRef: string;
  /** Plain-language formula. */
  formula: string;
  /** One plain sentence for the founder. */
  shows: string;
  /** Numbers behind the value, computed from real functions, e.g. "412 reached test drive ÷ 905 reached contacted". */
  inputs: string;
}

export interface FlaggedMetric {
  page: string;
  label: string;
  where: string;
  note: string;
}

export interface PageModule {
  sheetName: string;
  /** Short note shown at the top of the sheet (e.g. "Branch detail is not a standalone page..."). */
  note?: string;
  rows: (ctx: Ctx) => MetricRow[];
  /** UI items with no matching function in lib/. Flag, do not invent a formula. */
  flags?: (ctx: Ctx) => FlaggedMetric[];
}

export const cur = (value: number | null | undefined): string =>
  value === null || value === undefined ? "—" : formatCurrency(value);
export const pct = (value: number | null | undefined): string =>
  value === null || value === undefined ? "—" : formatPercent(value, 1);
export const num = (value: number | null | undefined): string =>
  value === null || value === undefined ? "—" : formatNumber(value);
/** Days are shown as whole numbers. */
export const days = (value: number | null | undefined): string =>
  value === null || value === undefined ? "—" : `${Math.round(value)} days`;
/** "a ÷ b = rate" text for the inputs column. */
export const frac = (top: number, bottom: number, topLabel: string, bottomLabel: string): string =>
  `${formatNumber(top)} ${topLabel} ÷ ${formatNumber(bottom)} ${bottomLabel}${bottom ? ` = ${formatPercent(top / bottom, 1)}` : ""}`;
