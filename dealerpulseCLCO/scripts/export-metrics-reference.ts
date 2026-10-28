import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";
import { loadDataset } from "../lib/data/index.ts";
import { EMPTY_FILTERS } from "../lib/types.ts";
import { ALERT_HEADERS, alertRows, rankingBlock } from "./metrics-reference/alerts-sheet.ts";
import { byBranch, byMonth, byRep, bySource, byStep } from "./metrics-reference/breakdowns.ts";
import type { Kind, Table } from "./metrics-reference/breakdowns.ts";
import { DEFINITIONS, DEFINITION_HEADERS } from "./metrics-reference/definitions.ts";
import { branchDetailPage } from "./metrics-reference/branch-detail.ts";
import { dealsPage } from "./metrics-reference/deals.ts";
import { deliveryPage } from "./metrics-reference/delivery.ts";
import { funnelPage } from "./metrics-reference/funnel.ts";
import { leadsPage } from "./metrics-reference/leads.ts";
import { overviewPage } from "./metrics-reference/overview.ts";
import { repDetailPage } from "./metrics-reference/rep-detail.ts";
import { targetsPage } from "./metrics-reference/targets.ts";
import type { Ctx, FlaggedMetric, PageModule } from "./metrics-reference/types.ts";

const ds = loadDataset();
const ctx: Ctx = { ds, filters: EMPTY_FILTERS };
const wb = new ExcelJS.Workbook();
const counts: [string, number][] = [];

const HEAD_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9E7F5" } };
const SECTION_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF2F2F2" } };
const wrap: Partial<ExcelJS.Alignment> = { wrapText: true, vertical: "top" };
const FORMATS: Record<Kind, string | undefined> = {
  text: undefined, cur: "#,##0", pct: "0.0%", int: "#,##0", days: "0", dec: "0.0",
};

function styleHeader(row: ExcelJS.Row): void {
  row.font = { bold: true };
  row.eachCell((cell) => { cell.fill = HEAD_FILL; cell.alignment = wrap; });
}

function addTitle(sheet: ExcelJS.Worksheet, text: string | undefined, span: number): void {
  if (!text) return;
  const row = sheet.addRow([text]);
  sheet.mergeCells(row.number, 1, row.number, span);
  row.getCell(1).alignment = wrap;
  row.getCell(1).font = { italic: true };
  row.height = Math.max(30, Math.ceil(text.length / 160) * 15);
}

function tableSheet(name: string, headers: string[], widths: number[], rows: string[][], note?: string, sectionCol = -1): void {
  const sheet = wb.addWorksheet(name);
  sheet.columns = widths.map((width) => ({ width }));
  addTitle(sheet, note, headers.length);
  const head = sheet.addRow(headers);
  styleHeader(head);
  for (const row of rows) sheet.addRow(row).alignment = wrap;
  sheet.views = [{ state: "frozen", ySplit: head.number }];
  sheet.autoFilter = { from: { row: head.number, column: 1 }, to: { row: head.number, column: headers.length } };
  counts.push([name, rows.length]);
  void sectionCol;
}

const PAGE_HEADERS = [
  "UI section", "UI label", "Comparison level", "Compared across", "Data fields used", "Filters it responds to",
  "Current value (full period)", "Code reference", "Formula", "What it shows in the UI",
  "Numbers used (amounts, counts, days behind the value)",
];
const PAGE_WIDTHS = [30, 30, 14, 18, 32, 30, 24, 44, 60, 60, 70];
const inputRows: string[][] = [];
const flagged: FlaggedMetric[] = [];

function pageSheet(page: PageModule): void {
  const sheet = wb.addWorksheet(page.sheetName);
  sheet.columns = PAGE_WIDTHS.map((width) => ({ width }));
  addTitle(sheet, page.note, PAGE_HEADERS.length);
  const head = sheet.addRow(PAGE_HEADERS);
  styleHeader(head);
  const rows = page.rows(ctx);
  let section = "";
  for (const metric of rows) {
    if (metric.section !== section) {
      section = metric.section;
      const header = sheet.addRow([section]);
      header.font = { bold: true };
      header.eachCell({ includeEmpty: true }, (cell) => { cell.fill = SECTION_FILL; });
      for (let column = 1; column <= PAGE_HEADERS.length; column++) header.getCell(column).fill = SECTION_FILL;
    }
    sheet.addRow([
      metric.section, metric.label, metric.level, metric.across, metric.fields, metric.filters,
      metric.value, metric.codeRef, metric.formula, metric.shows, metric.inputs,
    ]).alignment = wrap;
    inputRows.push([page.sheetName, metric.section, metric.label, metric.value, metric.inputs]);
  }
  sheet.views = [{ state: "frozen", ySplit: head.number, xSplit: 2 }];
  sheet.autoFilter = { from: { row: head.number, column: 1 }, to: { row: head.number, column: PAGE_HEADERS.length } };
  counts.push([page.sheetName, rows.length]);
  flagged.push(...(page.flags?.(ctx) ?? []));
}

function breakdownSheet(name: string, table: Table): void {
  const sheet = wb.addWorksheet(name);
  sheet.columns = table.columns.map((column) => ({ width: column.width }));
  addTitle(sheet, table.note, table.columns.length);
  const head = sheet.addRow(table.columns.map((column) => column.header));
  styleHeader(head);
  head.height = 60;
  const place = (values: (string | number | null)[], bold: boolean) => {
    const row = sheet.addRow(values.map((value) => value ?? "—"));
    row.alignment = wrap;
    row.eachCell((cell, index) => {
      const format = FORMATS[table.columns[index - 1]!.kind];
      if (format && typeof cell.value === "number") cell.numFmt = format;
    });
    if (bold) row.font = { bold: true };
  };
  for (const row of table.rows) place(row, false);
  if (table.totals) place(table.totals, true);
  sheet.views = [{ state: "frozen", ySplit: head.number, xSplit: 1 }];
  sheet.autoFilter = { from: { row: head.number, column: 1 }, to: { row: head.number, column: table.columns.length } };
  counts.push([name, table.rows.length + (table.totals ? 1 : 0)]);
}

const asOf = new Date(ds.asOf).toISOString();

// Sheet 1: Read me (row count added after the other sheets exist)
const readme = wb.addWorksheet("Read me");
readme.columns = [{ width: 28 }, { width: 110 }];

tableSheet("Definitions", DEFINITION_HEADERS, [28, 55, 80, 40], DEFINITIONS);

const pages: PageModule[] = [
  overviewPage, targetsPage, funnelPage, dealsPage, deliveryPage, leadsPage, branchDetailPage, repDetailPage,
];
for (const page of pages) pageSheet(page);

tableSheet(
  "Calculation inputs", ["Page", "UI section", "UI label", "Current value", "Numbers used to calculate it"],
  [22, 34, 34, 22, 100], inputRows,
  "One row per metric on the page sheets (same Page + UI section + UI label). Shows the actual amounts, counts and days that went into each value.",
);
breakdownSheet("By branch", byBranch(ctx));
breakdownSheet("By step", byStep(ctx));
breakdownSheet("By source", bySource(ctx));
breakdownSheet("By rep", byRep(ctx));
breakdownSheet("By month", byMonth(ctx));

const ranking = rankingBlock(ctx);
const alertSheet = wb.addWorksheet("Alerts & ranking");
alertSheet.columns = [28, 18, 16, 60, 60, 16, 60, 50].map((width) => ({ width }));
const alertHead = alertSheet.addRow(ALERT_HEADERS);
styleHeader(alertHead);
const alertData = alertRows(ctx);
for (const row of alertData) alertSheet.addRow(row).alignment = wrap;
alertSheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ALERT_HEADERS.length } };
alertSheet.addRow([]);
const blockTitle = alertSheet.addRow([ranking.title]);
blockTitle.font = { bold: true };
for (const line of ranking.lines) {
  const row = alertSheet.addRow([line]);
  alertSheet.mergeCells(row.number, 1, row.number, 5);
  row.getCell(1).alignment = wrap;
  row.height = Math.max(30, Math.ceil(line.length / 140) * 15);
}
alertSheet.views = [{ state: "frozen", ySplit: 1 }];
counts.push(["Alerts & ranking", alertData.length]);

if (flagged.length) {
  tableSheet(
    "Flags", ["Page", "UI item", "Where it is calculated", "Note"], [22, 40, 50, 100],
    flagged.map((item) => [item.page, item.label, item.where, item.note]),
    "UI items with no matching function in lib/. Documented here instead of inventing a formula.",
  );
}

const readmeLines: [string, string][] = [
  ["What this is", "A reference of every calculation shown in the DealerPulse dashboard, page by page, for explaining it to a non-technical founder. Every number comes from running the app's own metric functions."],
  ["Data as-of date (UTC)", `${asOf} (the newest timestamp in the data; all ages and overdue checks use this, not today's date)`],
  ["Filters used", "None. Full period, all branches, all sources, all models, leads counted by created date."],
  ["Note on pages", "'Branch detail' and 'Rep detail' are not separate pages in the app today: branch links open the Deals in progress page filtered to a branch, and rep rows appear on the Funnel and Lead Explorer pages. Those sheets document what is shown there."],
  ["Currency format", "₹ in Lakh (L) and Crore (Cr) text, same as the app. Breakdown sheets show full rupees with thousands separators."],
  ["Sheets", "Definitions; one sheet per page; Calculation inputs (the numbers behind each metric); By branch / step / source / rep / month; Alerts & ranking; Flags."],
  ["How to regenerate", "Run  npm run export:metrics  from the project folder. The file is written to docs/DealerPulse-metrics-reference.xlsx."],
];
for (const [key, value] of readmeLines) {
  const row = readme.addRow([key, value]);
  row.alignment = wrap;
  row.getCell(1).font = { bold: true };
}
readme.addRow([]);
const tocHead = readme.addRow(["Sheet", "Rows"]);
styleHeader(tocHead);
for (const [name, count] of counts) readme.addRow([name, count]).alignment = wrap;
counts.unshift(["Read me", readmeLines.length]);

const outDir = resolve(dirname(fileURLToPath(import.meta.url)), "..", "docs");
mkdirSync(outDir, { recursive: true });
const outFile = resolve(outDir, "DealerPulse-metrics-reference.xlsx");
await wb.xlsx.writeFile(outFile);

console.log(`Wrote ${outFile}`);
for (const [name, count] of counts) console.log(`  ${name}: ${count} rows`);
if (flagged.length) {
  console.log(`\nFlagged (no matching function): ${flagged.length}`);
  for (const item of flagged) console.log(`  [${item.page}] ${item.label} — ${item.where}`);
}
