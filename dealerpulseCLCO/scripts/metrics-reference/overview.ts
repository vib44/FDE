import { EFFORT_LEVELS, THRESHOLDS } from "../../lib/config.ts";
import { formatCurrency, formatPercent } from "../../lib/format.ts";
import { overviewInsights } from "../../lib/insights/index.ts";
import { itemCopy } from "../../lib/insights/present.ts";
import { actNowInsights } from "../../lib/metrics/insights.ts";
import { branchHealthRows } from "../../lib/metrics/branch-health.ts";
import { overdueOpen } from "../../lib/metrics/delivery.ts";
import { filterLeads } from "../../lib/metrics/filters.ts";
import { healthKeyNumbers, healthStatus, kpiSublines } from "../../lib/metrics/overview-summary.ts";
import { overviewVM } from "../../lib/metrics/overview.ts";
import { periodLabel } from "../../lib/period.ts";
import { cur, num, pct, days, type MetricRow, type PageModule } from "./types.ts";

const FILTERS_ALL = "Date range, branch, source, model, date basis (created / event). No rep filter.";

function kpiValue(value: number | null, format: "currency" | "number" | "percent" | "days"): string {
  if (value === null) return "—";
  if (format === "currency") return cur(value);
  if (format === "percent") return pct(value);
  if (format === "days") return days(value);
  return num(value);
}

export const overviewPage: PageModule = {
  sheetName: "Overview",
  rows: ({ ds, filters }) => {
    const vm = overviewVM(ds, filters);
    const kpi = (id: string) => vm.kpis.find((item) => item.id === id)!;
    const sub = kpiSublines(ds, filters);
    const leads = filterLeads(ds, filters);
    const insights = actNowInsights(ds, filters);
    const health = healthKeyNumbers(ds, filters);
    const overdueCount = overdueOpen(leads, ds.asOf).length;
    const blocks = overviewInsights(ds, filters);
    const branchRows = branchHealthRows(ds, filters);
    const branchCount = `${ds.branches.length} branches`;
    const statusFor = (area: Parameters<typeof healthStatus>[0], match: (id: string) => boolean) =>
      healthStatus(area, insights.find((item) => match(item.id))?.severity, overdueCount);
    const weakest = branchRows.reduce<(typeof branchRows)[number] | null>((low, row) =>
      row.winRate !== null && (low === null || row.winRate < low.winRate!) ? row : low, null);
    const rows: MetricRow[] = [];

    rows.push({
      section: "Header strip", label: "Period · basis line", level: "Company", across: "—",
      fields: "leads.created_at", filters: "Date range, date basis",
      value: periodLabel(ds, filters), codeRef: "periodLabel in lib/period.ts",
      formula: "Earliest lead creation date to the data as-of date, or the chosen date range.",
      shows: "Which slice of time every number on the page covers.",
      inputs: `Data as of ${new Date(ds.asOf).toISOString().slice(0, 10)} (UTC)`,
    });

    rows.push({
      section: "Card: Business verdict", label: "Business verdict status chip", level: "Company", across: "—",
      fields: "targets.revenue, leads.deal_value, leads.delivery",
      filters: FILTERS_ALL, value: vm.verdict.status,
      codeRef: "overviewVM (verdict.status) in lib/metrics/overview.ts",
      formula: `Status comes from revenue target attainment: below ${formatPercent(THRESHOLDS.recalibrationPct, 0)} = At risk, below ${formatPercent(THRESHOLDS.lowAttainmentPct, 0)} = Watch, otherwise Favorable; No comparison when no target exists.`,
      shows: "A one-word health read of delivered revenue against target.",
      inputs: `Revenue target attainment ${pct(kpi("attainment").value)}`,
    });
    rows.push({
      section: "Card: Business verdict", label: "Verdict headline and summary sentence", level: "Company", across: "—",
      fields: "leads.deal_value, leads.delivery, targets.revenue",
      filters: FILTERS_ALL, value: "n/a - no shared function",
      codeRef: "NO MATCHING FUNCTION (headline and sentence are assembled inside components/dashboard.tsx from overviewVM KPIs and branchHealthRows)",
      formula: "Headline is picked from the verdict status. Sentence reads: delivered revenue, number of cars delivered, and the branch with the lowest closed win rate.",
      shows: "A plain-English summary of revenue, cars and the weakest branch.",
      inputs: `Revenue ${cur(kpi("revenue").value)}; cars delivered ${num(kpi("deliveries").value)}; weakest branch by win rate ${weakest ? `${weakest.branchName} at ${pct(weakest.winRate)}` : "none"}`,
    });

    const cards: { id: string; label: string; section: string; sub: string | null; fieldList: string; formula: string; shows: string; basisNote: string }[] = [
      { id: "revenue", label: "Revenue delivered", section: "KPI card: Revenue delivered", sub: kpi("attainment").value === null ? "Target unavailable" : `${pct(kpi("attainment").value)} of target`,
        fieldList: "leads.deal_value, leads.status, leads.delivery.delivered_at", formula: "Sum of deal value for leads that were delivered (by delivery date).", shows: "Money actually banked from cars handed over to customers.", basisNote: "Delivered leads, filtered by delivery date" },
      { id: "orders", label: "Orders booked", section: "KPI card: Orders booked", sub: sub.orders,
        fieldList: "leads.status_history (order_placed)", formula: "Number of leads that ever reached the order-placed stage (by order date).", shows: "How many customers actually committed to buy.", basisNote: "Leads that reached order placed" },
      { id: "winRate", label: "Closed win rate", section: "KPI card: Closed win rate", sub: sub.winRate,
        fieldList: "leads.status", formula: "Delivered leads ÷ (delivered + lost leads).", shows: "Of the deals that finished, the share we won.", basisNote: "Delivered ÷ (delivered + lost)" },
      { id: "pipelineValue", label: "Unordered deal value", section: "KPI card: Unordered deal value", sub: sub.pipelineValue,
        fieldList: "leads.deal_value, leads.status", formula: "Sum of deal value for open leads that have not yet placed an order (new, contacted, test drive, negotiation).", shows: "Money still to be won; the rep still has to close the sale.", basisNote: "Open pre-order stages" },
      { id: "awaitingDeliveryValue", label: "Ordered deal value", section: "KPI card: Ordered deal value", sub: sub.awaitingDeliveryValue,
        fieldList: "leads.deal_value, leads.status, leads.delivery", formula: "Sum of deal value for leads at order-placed with no delivery record yet.", shows: "Money already committed but the car has not been handed over.", basisNote: "Orders placed but not delivered" },
    ];
    for (const card of cards) {
      const item = kpi(card.id);
      rows.push({
        section: card.section, label: card.label, level: "Company", across: "—",
        fields: card.fieldList, filters: FILTERS_ALL,
        value: kpiValue(item.value, item.format),
        codeRef: "overviewVM (kpis) in lib/metrics/overview.ts", formula: card.formula, shows: card.shows,
        inputs: card.basisNote,
      });
      rows.push({
        section: card.section, label: `${card.label} - subline`, level: "Company", across: "—",
        fields: card.fieldList, filters: FILTERS_ALL, value: card.sub ?? "—",
        codeRef: card.id === "revenue" ? "overviewVM (attainment KPI) in lib/metrics/overview.ts" : "kpiSublines in lib/metrics/overview-summary.ts",
        formula: card.id === "revenue"
          ? "Delivered revenue ÷ target revenue for the same branch-months."
          : card.id === "orders" ? "Orders booked units ÷ target units for the same branch-months."
          : card.id === "winRate" ? "Count of delivered + lost leads."
          : card.id === "pipelineValue" ? "Count of leads in open pre-order stages."
          : "Count of orders placed with no delivery record.",
        shows: "A second fact that sits under the headline number.",
        inputs: "See value",
      });
      rows.push({
        section: card.section, label: `${card.label} - comparison and status dot`, level: "Company", across: "—",
        fields: "same as above", filters: "Needs a date range; with none selected no comparison is shown",
        value: item.delta === null ? "No comparison (full period)" : `${item.delta} vs previous period`,
        codeRef: "overviewVM (delta, deltaPct, status) in lib/metrics/overview.ts",
        formula: "Value for the chosen range minus the value for the equally long range just before it. Status dot: better than before = Favorable, worse = Watch, unordered value is always neutral.",
        shows: "Whether this number is moving the right way versus the previous period.",
        inputs: `Previous value ${item.previousValue === null ? "n/a" : kpiValue(item.previousValue, item.format)}; status ${item.status}`,
      });
    }

    const areas = [
      { label: "Targets & Revenue", area: "targets" as const, match: (id: string) => id === "branches-below-target", formula: "Count of branches whose delivered revenue is under 100% of target, out of branches that have a target.", shows: "How many branches are behind their revenue target." },
      { label: "Funnel", area: "funnel" as const, match: (id: string) => id.startsWith("conversion-") || id.startsWith("source-quality-"), formula: "Leads that reached contacted ÷ all leads.", shows: "How many enquiries get at least a first call." },
      { label: "Delivery", area: "delivery" as const, match: (id: string) => id === "orders-beyond-median-delivery", formula: "Median days to deliver across delivered leads.", shows: "How long a typical customer waits for the car." },
      { label: "Deals in progress", area: "deals" as const, match: (id: string) => id === "cold-preorder-leads", formula: "Open leads (before or at order) whose expected close date is before today (UTC).", shows: "How many open deals are late." },
      { label: "Team", area: "team" as const, match: (id: string) => id === "cold-preorder-leads", formula: "Distinct reps who own at least one overdue open lead.", shows: "How many reps have late deals." },
    ];
    for (const item of areas) {
      const section = `Health check card: ${item.label}`;
      rows.push({
        section, label: `${item.label} - key number`, level: "Company", across: "—",
        fields: "see formula", filters: FILTERS_ALL, value: health[item.area],
        codeRef: "healthKeyNumbers in lib/metrics/overview-summary.ts", formula: item.formula, shows: item.shows,
        inputs: `Overdue open leads company-wide: ${num(overdueCount)}`,
      });
      rows.push({
        section, label: `${item.label} - Good / Watch / Act chip`, level: "Company", across: "—",
        fields: "alerts above, leads.expected_close_date", filters: FILTERS_ALL,
        value: statusFor(item.area, item.match),
        codeRef: "healthStatus in lib/metrics/overview-summary.ts (matching alert chosen inside components/dashboard.tsx)",
        formula: "Act if the matching urgent alert is high severity, Watch if medium; Deals and Team also show Watch when any open lead is overdue; otherwise Good.",
        shows: "A traffic-light for this area of the business.",
        inputs: `Matching alert: ${insights.find((alert) => item.match(alert.id))?.id ?? "none"} (${insights.find((alert) => item.match(alert.id))?.severity ?? "—"})`,
      });
    }

    rows.push({
      section: "Table: Branch health", label: "Rank", level: "Branch", across: branchCount,
      fields: "targets.revenue, leads.deal_value, leads.delivery", filters: FILTERS_ALL, value: "see breakdown sheet",
      codeRef: "branchHealthRows in lib/metrics/branch-health.ts",
      formula: "Branches sorted from lowest to highest revenue attainment, then lowest win rate, then highest revenue.",
      shows: "Weakest branches appear first.", inputs: `${branchRows.length} branches ranked`,
    });
    rows.push({
      section: "Table: Branch health", label: "Revenue", level: "Branch", across: branchCount,
      fields: "leads.deal_value, leads.delivery.delivered_at", filters: FILTERS_ALL, value: "see breakdown sheet",
      codeRef: "attainment (basis deliveries) in lib/metrics/targets.ts, via branchHealthRows",
      formula: "Sum of deal value of leads delivered in a month that has a target for the branch.",
      shows: "Revenue each branch has banked.", inputs: `Total ${cur(branchRows.reduce((sum, row) => sum + row.revenue, 0))}`,
    });
    rows.push({
      section: "Table: Branch health", label: "Attainment (delivered revenue)", level: "Branch", across: branchCount,
      fields: "targets.revenue, leads.deal_value", filters: FILTERS_ALL, value: "see breakdown sheet",
      codeRef: "attainment (basis deliveries) in lib/metrics/targets.ts, via branchHealthRows",
      formula: "Delivered revenue ÷ target revenue for the branch's target months.",
      shows: "How much of its revenue goal the branch has reached.",
      inputs: `Target total ${cur(branchRows.reduce((sum, row) => sum + row.targetRevenue, 0))}`,
    });
    rows.push({
      section: "Table: Branch health", label: "Win rate", level: "Branch", across: branchCount,
      fields: "leads.status", filters: FILTERS_ALL, value: "see breakdown sheet",
      codeRef: "branchScorecard (win rate point) in lib/metrics/target-charts.ts, via branchHealthRows",
      formula: "Delivered leads ÷ (delivered + lost) for the branch.",
      shows: "How often the branch wins deals that finish.",
      inputs: `Weakest: ${weakest ? `${weakest.branchName} ${pct(weakest.winRate)}` : "none"}`,
    });
    rows.push({
      section: "Table: Branch health", label: "Weakest chip", level: "Branch", across: branchCount,
      fields: "leads.status", filters: FILTERS_ALL, value: weakest ? weakest.branchName : "—",
      codeRef: "NO MATCHING FUNCTION (lowest win rate picked inside components/dashboard.tsx)",
      formula: "The branch with the lowest closed win rate is highlighted.",
      shows: "Where to look first for lost deals.", inputs: weakest ? pct(weakest.winRate) : "—",
    });
    rows.push({
      section: "Table: Branch health", label: "Status", level: "Branch", across: branchCount,
      fields: "targets.revenue, leads.delivery", filters: FILTERS_ALL, value: "see breakdown sheet",
      codeRef: "branchHealthRows (status) in lib/metrics/branch-health.ts",
      formula: "Favorable when attainment is 100% or more, At risk when below 100%, No comparison without a target.",
      shows: "Which branches have hit their revenue goal.",
      inputs: `${branchRows.filter((row) => row.status === "good").length} favorable, ${branchRows.filter((row) => row.status === "risk").length} at risk`,
    });

    if (blocks.keyInsight) {
      rows.push({
        section: "Card: Key insight", label: "Share of target revenue reachable if every lead bought", level: "Company", across: "—",
        fields: "leads.deal_value, leads.created_at, targets.revenue", filters: "Date range, branch, source, model (no basis switch)",
        value: pct(blocks.keyInsight.number),
        codeRef: "buildStrategicInsights (lead_volume) using leadValueCeiling in lib/insights/strategic.ts and lib/metrics/lead-value-ceiling.ts",
        formula: "Total deal value of every lead in scope ÷ total target revenue. Shown only when below 100%.",
        shows: "Even if every lead bought, we could not hit target; the gap is lead volume.",
        inputs: blocks.keyInsight.line,
      });
    }

    rows.push({
      section: "Table: What to do first", label: "# / Owner / What's happening / Recoverable / Effort", level: "Branch / Rep", across: `${blocks.todo.length} ranked actions`,
      fields: "leads.status, leads.expected_close_date, leads.last_activity_at, deliveries, leads.lost_reason", filters: "Date range, branch, source, model, date basis",
      value: blocks.todo.length ? `${blocks.todo.length} ranked items; top: ${itemCopy(blocks.todo[0]!).headline} (${itemCopy(blocks.todo[0]!).recoverable})` : "No ranked actions",
      codeRef: "overviewInsights, rankAlerts, buildAlerts in lib/insights/overview.ts, rank.ts, alerts.ts",
      formula: "Every alert is given a recoverable amount; items are ranked by that amount (rounded), then by how quick the fix is. See the Alerts & ranking sheet.",
      shows: "The order in which the CEO should chase problems.",
      inputs: blocks.todo.slice(0, 5).map((item) => `#${item.rank} ${itemCopy(item).owners.join(" & ")}: ${formatCurrency(item.impact)} (${EFFORT_LEVELS[item.effort].label})`).join(" | "),
    });
    rows.push({
      section: "Card: Watch", label: "Watch lines", level: "Company", across: `${blocks.watch.length} items`,
      fields: "leads.status, targets.revenue", filters: "Date range, branch, source, model, date basis",
      value: blocks.watch.length ? blocks.watch.map((item) => item.line).join(" | ") : "None",
      codeRef: "overviewInsights, buildStrategicInsights in lib/insights/overview.ts and strategic.ts",
      formula: "Totals no single action can recover: branches with no unordered deals, leads lost before first contact. Items already shown elsewhere on the page are hidden.",
      shows: "Things to keep an eye on that are not a to-do item.", inputs: "Never ranked and never given a recoverable amount.",
    });
    rows.push({
      section: "Card: What's working", label: "Positive lines", level: "Branch / Source", across: `${blocks.working.length} items`,
      fields: "leads.delivery.days_to_deliver, leads.status, leads.status_history", filters: "Date range, source, model, date basis (branch ignored so peers are comparable)",
      value: blocks.working.length ? blocks.working.map((item) => item.text).join(" | ") : "None",
      codeRef: "overviewInsights, buildGoodNews in lib/insights/overview.ts and good-news.ts",
      formula: "Best branch/source versus the peer median, only if it strictly beats the median and has enough sample; facts already visible in the KPI or health cards are removed.",
      shows: "Where results are ahead of the pack.", inputs: "Up to three positives, ordered by margin over the peer median.",
    });

    return rows;
  },
  flags: () => [
    { page: "Overview", label: "Verdict headline and summary sentence", where: "components/dashboard.tsx", note: "Assembled in the component; overviewVM also builds a verdict title/summary that is not shown." },
    { page: "Overview", label: "Weakest chip on Branch health", where: "components/dashboard.tsx", note: "Lowest win rate is picked inside the component." },
    { page: "Overview", label: "Orders booked card unit sub-line", where: "lib/metrics/overview-summary.ts", note: "Target units come from the orders basis while Branch health uses the deliveries basis." },
  ],
};
