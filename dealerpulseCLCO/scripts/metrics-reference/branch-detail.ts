import { stageConversion } from "../../lib/metrics/stage-progression.ts";
import { cur, days, num, pct } from "./types.ts";
import type { FlaggedMetric, MetricRow, PageModule } from "./types.ts";
import { dealsData } from "./deals.ts";

const PAGE = "Branch detail";
const NA = "n/a - no shared function";
const FILE_DEALS = "components/deals-page.tsx";
const FILE_SECTION = "components/deal-progression-section.tsx";
const FILE_STAGE = "lib/metrics/stage-progression.ts";
const FILTERS_BRANCH =
  "Branch (set by the drill-down link) plus the global date range, source, model and basis. Rep is not applied.";

type RowBody = Omit<MetricRow, "section" | "label">;
const make = (section: string, label: string, body: RowBody): MetricRow => ({ section, label, ...body });

export const branchDetailPage: PageModule = {
  sheetName: "Branch detail",
  note:
    "Branch detail is not a standalone page. /branch/[branchId] redirects to /branches (with ?branch=<id>), and /branches redirects to /deals, so a branch drill-down is the Deals in progress page with the branch filter set. The rows below show the same Deals metrics for one representative branch; company-wide values are on the 'Deals in progress' sheet. lib/metrics/branch-detail.ts (branchDetailData) is not rendered anywhere (see flags).",
  rows: (ctx) => {
    const { ds, filters } = ctx;
    const branch = ds.branches[0];
    if (!branch) return [];
    const branchFilters = { ...filters, branch: branch.id };
    const D = dealsData(ds, branchFilters);
    const m = D.metrics;
    const across = `Branch: ${branch.name} (first of ${num(ds.branches.length)} branches)`;
    const base = {
      level: "Branch", across, filters: FILTERS_BRANCH,
    };
    const rows: MetricRow[] = [];

    const nav = "Drill-down: how a branch is opened";
    rows.push(
      make(nav, "Branch name link", {
        ...base, fields: "branches.id, branches.name", value: branch.name,
        codeRef: `NO CALCULATION (branchHref in ${FILE_DEALS}; link in components/funnel-team-section.tsx; redirects in app/branch/[branchId]/page.tsx and app/branches/page.tsx)`,
        formula: "Clicking a branch name goes to /branch/<id>, which redirects to /branches and then /deals with branch=<id> kept in the link. The date range, source, model and basis are carried over. The #branch-<id> anchor is dropped by the second redirect.",
        shows: "Drilling into a branch re-opens Deals in progress limited to that branch.",
        inputs: `Example uses ${branch.name}. A branch id that does not exist is not checked and simply gives an empty page.`,
      }),
    );

    const kpi = "Deals page filtered to branch: KPI cards";
    rows.push(
      make(kpi, "Orders won", {
        ...base, fields: "leads.status_history, leads.branch_id", value: num(m.orderCount),
        codeRef: `dealProgressionMetrics → orderCount (${FILE_STAGE})`,
        formula: "Same as the Deals sheet, counting only this branch's leads that reached order placed.",
        shows: "How many orders this branch has placed.",
        inputs: `Order value ${cur(m.orderValue)}; test drive → order ${pct(m.testDriveOrderRate)}; typical days to order ${days(m.testDriveOrderTime.medianDays)}.`,
      }),
      make(kpi, "Test drives", {
        ...base, fields: "leads.status_history, leads.branch_id", value: num(m.testDriveCount),
        codeRef: `dealProgressionMetrics → testDriveCount (${FILE_STAGE})`,
        formula: "Same as the Deals sheet, limited to this branch.",
        shows: "How many of this branch's customers booked or took a test drive.",
        inputs: `Booking rate ${pct(m.bookingRate)}; typical days to book ${days(m.bookingTime.medianDays)}; 75th percentile ${days(m.bookingTime.percentile75Days)}; waiting now ${num(m.bookingOpenRows.length)} leads worth ${cur(D.waitingValue)}; overdue ${num(m.bookingOverdueRows.length)}.`,
      }),
      make(kpi, "Negotiations", {
        ...base, fields: "leads.status_history, leads.branch_id", value: num(m.negotiationCount),
        codeRef: `dealProgressionMetrics → negotiationCount (${FILE_STAGE})`,
        formula: "Same as the Deals sheet, limited to this branch.",
        shows: "How many of this branch's customers reached negotiation.",
        inputs: `Closing rate ${pct(m.closingRate)}; typical days to close ${days(m.closingTime.medianDays)}; 75th percentile ${days(m.closingTime.percentile75Days)}; open now ${num(m.closingOpenRows.length)} leads worth ${cur(D.openNegotiationValue)}; overdue ${num(m.closingOverdueRows.length)}.`,
      }),
      make(kpi, "Step 2 and Step 4 summaries, waiting lists and loss tables", {
        ...base, fields: "leads.status_history, leads.lost_reason, leads.deal_value", value: "see breakdown sheet",
        codeRef: `dealProgressionMetrics, lostAtStage, testDriveLift (${FILE_STAGE}); sentences in ${FILE_SECTION}`,
        formula: "All Step 2 and Step 4 content is recomputed on this branch's leads only, with the same rules as the Deals sheet (Overdue = beyond the 75th percentile, Due = beyond the median). The 75th percentile and median now come from this branch's own history, so thresholds differ from company-wide ones.",
        shows: "The branch's own waiting customers, delays and loss reasons.",
        inputs: `Branch lost at negotiation: ${num(D.negotiationLost.count)} deals worth ${cur(D.negotiationLost.value)}.`,
      }),
    );

    const byBranch = "Deals page filtered to branch: By branch table";
    rows.push(
      make(byBranch, "Selected branch's test-drive booking rate", {
        ...base, fields: "leads.status_history", value: pct(stageConversion(D.scoped, "contacted", "test_drive")),
        codeRef: `stageConversion (${FILE_STAGE}) per branch inside ${FILE_DEALS}`,
        formula: "Share of this branch's leads that reached contacted which also reached test drive. All branches are still listed, but with the branch filter every other branch's rows show — with no leads.",
        shows: "The branch's booking rate in the table next to the other (now empty) branch rows.",
        inputs: `Closing rate ${pct(stageConversion(D.scoped, "negotiation", "order_placed"))}. Weakest and Small sample chips: ${NA} (inline in ${FILE_DEALS}); with only one branch populated it is trivially the weakest where it has a rate.`,
      }),
    );

    const od = "Deals page filtered to branch: Open deals past expected close date";
    rows.push(
      make(od, "Overdue deals count", {
        ...base, fields: "leads.expected_close_date, leads.status", value: num(D.overdue.length),
        codeRef: "overdueOpen (lib/metrics/delivery.ts)",
        formula: "Open leads of this branch whose expected close day is before the as-of day.",
        shows: "How many of this branch's open deals are late.",
        inputs: `${num(D.overdue.length)} overdue; unordered value ${cur(D.overdueUnordered.value)} across ${num(D.overdueUnordered.count)} deals; ordered value ${NA}.`,
      }),
    );

    const dead = "Not rendered anywhere (unused code)";
    rows.push(
      make(dead, "branchDetailData", {
        ...base, fields: "—", value: "not shown on any page",
        codeRef: "branchDetailData (lib/metrics/branch-detail.ts)",
        formula: "Would build branch metrics, peer medians, funnel, losses, cold leads, rep and source tables and target pipeline. Only tests/metrics.test.ts imports it; no page or component does.",
        shows: "Nothing the dealership sees today.",
        inputs: "Flagged as dead code; its formulas are not documented as page metrics.",
      }),
      make(dead, "AI alerts card (branchAlertData)", {
        ...base, fields: "—", value: "not shown on any page",
        codeRef: "branchAlertData (lib/metrics/branch-alert-data.ts); AiAlertsCard (components/ai-alerts-card.tsx); /api/ai-alerts",
        formula: "AiAlertsCard is defined but no page or component renders it.",
        shows: "Nothing the dealership sees today.",
        inputs: "Flagged as dead code.",
      }),
    );

    return rows;
  },
  flags: (): FlaggedMetric[] => [
    {
      page: PAGE, label: "branchDetailData", where: "lib/metrics/branch-detail.ts",
      note: "Dead/unused code: not rendered by any page or component (only imported by tests/metrics.test.ts). There is no branch page.",
    },
    {
      page: PAGE, label: "AI alerts card / branchAlertData", where: "components/ai-alerts-card.tsx, lib/metrics/branch-alert-data.ts, app/api/ai-alerts/route.ts",
      note: "AiAlertsCard is not rendered anywhere, so branchAlertData and the /api/ai-alerts route are unused by the UI.",
    },
    {
      page: PAGE, label: "Branch drill-down links", where: "components/deals-page.tsx, components/funnel-team-section.tsx",
      note: "Links point to /branch/<id>, which redirects twice (/branches then /deals); the #branch-<id> anchor is lost. Label implies a branch page that does not exist.",
    },
    {
      page: PAGE, label: "Weakest / Small sample chips", where: "Deals page filtered to branch",
      note: "Calculated inline in components/deals-page.tsx; no shared function.",
    },
  ],
};
