import { THRESHOLDS } from "../../lib/config.ts";
import { formatPercent } from "../../lib/format.ts";
import { deliverySectionData } from "../../lib/metrics/delivery.ts";
import { cur, num, pct, days, type MetricRow, type PageModule } from "./types.ts";

const FILTERS = "Date range (on the date basis chosen), branch, source, model. No rep filter.";
const CODE = "deliverySectionData in lib/metrics/delivery.ts";

export const deliveryPage: PageModule = {
  sheetName: "Delivery",
  rows: ({ ds, filters }) => {
    const m = deliverySectionData(ds, filters);
    const branches = `${ds.branches.length} branches`;
    const rows: MetricRow[] = [];
    const add = (row: MetricRow) => rows.push(row);

    add({ section: "KPI card: Median delivery time", label: "Median delivery time", level: "Company", across: "—",
      fields: "deliveries.days_to_deliver", filters: FILTERS, value: days(m.medianDeliveryDays), codeRef: CODE,
      formula: "Middle value of days between order and delivery across delivered cars.",
      shows: "How long a typical customer waits for the car.", inputs: `${num(m.deliveredCount)} delivered cars` });
    add({ section: "KPI card: Median delivery time", label: "Fastest (sub-line)", level: "Company", across: "—",
      fields: "deliveries.days_to_deliver", filters: FILTERS, value: m.fastestDeliveryDays === null ? "—" : `${num(m.fastestDeliveryDays)} days`, codeRef: CODE,
      formula: "Smallest days-to-deliver; shows how many deliveries tie when more than one.",
      shows: "The best case we have achieved.", inputs: `${num(m.fastestDeliveries.length)} delivery(ies) at this speed` });

    add({ section: "KPI card: Highest-value delivery", label: "Highest-value delivery", level: "Company", across: "—",
      fields: "leads.deal_value, deliveries", filters: FILTERS, value: cur(m.highestDeliveryValue), codeRef: CODE,
      formula: "Largest deal value among delivered cars; sub-line names the model and branch.",
      shows: "The single biggest car we have handed over.",
      inputs: m.highestValueDeliveries[0] ? `${m.highestValueDeliveries[0].model}, ${m.highestValueDeliveries[0].branchName}; ${num(m.highestValueDeliveries.length)} at this value` : "—" });

    add({ section: "KPI card: Most delivered model", label: "Most delivered model", level: "Model", across: `${ds.models.length} models`,
      fields: "leads.model, deliveries", filters: FILTERS, value: m.mostDeliveredModel?.model ?? "—", codeRef: CODE,
      formula: "Model with the most delivered cars (ties broken alphabetically); sub-line shows its count and share of all deliveries.",
      shows: "Which model customers actually take delivery of most.",
      inputs: m.mostDeliveredModel ? `${num(m.mostDeliveredModel.count)} of ${num(m.deliveredCount)} deliveries = ${pct(m.mostDeliveredModel.count / m.deliveredCount)}` : "—" });

    add({ section: "KPI card: Ordered deal value", label: "Ordered deal value", level: "Company", across: "—",
      fields: "leads.deal_value, leads.status, deliveries", filters: FILTERS, value: cur(m.awaitingValue), codeRef: CODE,
      formula: "Sum of deal value of orders placed with no delivery record.",
      shows: "Revenue at stake until these cars are delivered.", inputs: `${num(m.awaitingCount)} orders` });
    add({ section: "KPI card: Ordered deal value", label: "Idle orders warning (sub-line and triangle)", level: "Company", across: "—",
      fields: "leads.last_activity_at", filters: FILTERS, value: `${num(m.awaitingIdleCount)} idle ${THRESHOLDS.staleOrderDays}+ days`, codeRef: CODE,
      formula: `Awaiting orders with no activity for ${THRESHOLDS.staleOrderDays} days or more; triangle shows when at least one.`,
      shows: "Orders that look forgotten.", inputs: `${num(m.awaitingIdleCount)} of ${num(m.awaitingCount)} orders` });

    add({ section: "KPI card: Delayed deliveries", label: "Delayed deliveries", level: "Company", across: "—",
      fields: "deliveries.delay_reason", filters: FILTERS, value: pct(m.delayRate), codeRef: CODE,
      formula: "Deliveries that have a recorded delay reason ÷ all deliveries.",
      shows: "How often customers wait longer than planned.", inputs: `${num(m.delayedCount)} of ${num(m.deliveredCount)} deliveries` });
    add({ section: "KPI card: Delayed deliveries", label: "'avg X days vs Y on time' (sub-line)", level: "Company", across: "—",
      fields: "deliveries.days_to_deliver, deliveries.delay_reason", filters: FILTERS,
      value: `${days(m.medianDelayedDays)} vs ${days(m.medianOnTimeDays)}`, codeRef: CODE + " (medianDelayedDays, medianOnTimeDays)",
      formula: "Median days for delayed deliveries versus median days for on-time deliveries.",
      shows: "How much longer a delayed delivery takes. The screen says 'avg' but the number is a median.",
      inputs: `Average (not shown): delayed ${days(m.averageDelayedDays)}, on time ${days(m.averageOnTimeDays)}` });

    const maxBranchMedian = Math.max(0, ...m.branchSpeedRows.map((row) => row.medianDays));
    add({ section: "Rank list: Fastest to deliver", label: "Branch median days (value)", level: "Branch", across: `Up to 5 of ${branches}`,
      fields: "deliveries.days_to_deliver, leads.branch_id", filters: FILTERS, value: "see breakdown sheet", codeRef: "deliverySectionData (branchSpeedRows) in lib/metrics/delivery.ts",
      formula: "Median days to deliver per branch, quickest first (ties by lower delay rate); top five shown.",
      shows: "Which branches get cars to customers fastest.",
      inputs: m.branchSpeedRows.map((row) => `${row.branchName} ${days(row.medianDays)}`).join("; ") });
    add({ section: "Rank list: Fastest to deliver", label: "Delays: X% (bar label)", level: "Branch", across: `Up to 5 of ${branches}`,
      fields: "deliveries.delay_reason", filters: FILTERS, value: "see breakdown sheet", codeRef: "deliverySectionData (branchSpeedRows.delayRate)",
      formula: "Delayed deliveries ÷ deliveries for the branch.", shows: "Whether the fast branches are also reliable.",
      inputs: m.branchSpeedRows.map((row) => `${row.branchName} ${formatPercent(row.delayRate, 0)}`).join("; ") + `; bar scaled to the slowest of the five (${days(maxBranchMedian)})` });
    add({ section: "Rank list: Fastest to deliver", label: "Small sample chip", level: "Branch", across: `Up to 5 of ${branches}`,
      fields: "deliveries", filters: FILTERS, value: `${m.branchSpeedRows.filter((row) => row.belowMinimumSample).length} branches flagged`, codeRef: "deliverySectionData (belowMinimumSample)",
      formula: `Branch has fewer than ${THRESHOLDS.minDeliveriesForBranchRank} deliveries.`, shows: "This branch's speed is based on too few cars to trust.",
      inputs: `Minimum ${THRESHOLDS.minDeliveriesForBranchRank} deliveries` });

    add({ section: "Chart: Orders awaiting delivery by age", label: "Orders and ₹ value per age bucket", level: "Stage", across: `${m.ageBuckets.length} age buckets`,
      fields: "leads.status_history (order_placed), deliveries", filters: FILTERS, value: "see breakdown sheet", codeRef: "deliverySectionData (ageBuckets) in lib/metrics/delivery.ts",
      formula: "Each awaiting order is placed in a bucket by days since the order was placed; bars show ₹ value, label shows count.",
      shows: "How old the undelivered orders are.",
      inputs: m.ageBuckets.map((bucket) => `${bucket.label}: ${num(bucket.count)} orders, ${cur(bucket.value)}${bucket.oldestDaysWaiting === null ? "" : `, oldest ${num(bucket.oldestDaysWaiting)}d`}`).join("; ") });
    add({ section: "Chart: Orders awaiting delivery by age", label: "Takeaway sentence", level: "Company", across: "—",
      fields: "leads.deal_value", filters: FILTERS, value: `${num(m.awaitingCount)} orders worth ${cur(m.awaitingValue)}`, codeRef: "deliverySectionData (awaitingCount, awaitingValue)",
      formula: "Count and total value of awaiting orders.", shows: "Headline size of the delivery backlog.", inputs: "—" });

    const scorecardCols: [string, string, string, string][] = [
      ["Branch manager", "leads.rep.role", "The rep with the branch-manager role at the branch.", "Who owns the branch."],
      ["Deliveries done", "deliveries", "Leads with a delivery record in the period, per branch.", "How many cars each branch handed over."],
      ["Avg. days to deliver", "deliveries.days_to_deliver", "Mean days to deliver per branch (tooltip also shows the median). Fastest branch is ticked; Small sample chip when under the minimum deliveries.", "How quick each branch is on average."],
      ["Revenue delivered", "leads.deal_value, deliveries", "Sum of deal value of delivered cars per branch.", "Money banked per branch."],
      ["Orders awaiting delivery", "leads.status, deliveries", "Count of orders placed with no delivery record per branch.", "Cars owed to customers."],
      ["Ordered deal value", "leads.deal_value, leads.status", "Sum of deal value of those awaiting orders; largest is marked with a clock.", "Revenue still locked up per branch."],
    ];
    for (const [label, fields, formula, shows] of scorecardCols) {
      add({ section: "Table: Branch delivery scorecard", label, level: "Branch", across: branches, fields, filters: FILTERS,
        value: "see breakdown sheet", codeRef: "branchDeliveryScorecard in lib/metrics/delivery.ts", formula, shows, inputs: "See By branch sheet" });
    }
    add({ section: "Table: Branch delivery scorecard", label: "Total row", level: "Company", across: branches, fields: "as above", filters: FILTERS,
      value: `${num(m.scorecardTotals.deliveries)} deliveries; ${m.scorecardTotals.averageDays === null ? "—" : `${m.scorecardTotals.averageDays.toFixed(1)} days`} avg; ${cur(m.scorecardTotals.revenueDelivered)}; ${num(m.scorecardTotals.ordersAwaiting)} awaiting; ${cur(m.scorecardTotals.valueAwaiting)}`,
      codeRef: "branchDeliveryScorecardTotals in lib/metrics/delivery.ts",
      formula: "Sums of deliveries, revenue, awaiting orders and value; average days is weighted by deliveries.", shows: "Company-wide totals of the table.", inputs: "—" });
    const fastest = m.scorecardRows.filter((row) => row.averageDays !== null).sort((a, b) => a.averageDays! - b.averageDays!)[0];
    const backlog = m.scorecardRows.filter((row) => row.valueAwaiting > row.revenueDelivered).map((row) => row.branchName);
    add({ section: "Table: Branch delivery scorecard", label: "Summary sentence", level: "Branch", across: branches, fields: "as above", filters: FILTERS,
      value: `${fastest ? `${fastest.branchName} fastest at ${fastest.averageDays!.toFixed(1)} days` : "No branch has completed deliveries"}; backlog bigger than delivered: ${backlog.length ? backlog.join(", ") : "none"}`,
      codeRef: "NO MATCHING FUNCTION (sentence assembled inside components/delivery-section.tsx from branchDeliveryScorecard rows)",
      formula: "Names the branch with the lowest average days, and branches whose ordered value is larger than revenue delivered.",
      shows: "Who is fastest and who has a backlog bigger than what they have delivered.", inputs: "—" });

    const lead = m.reasons[0];
    add({ section: "Table: Delay reasons ranked", label: "Delay reason / Delayed orders", level: "Customer", across: `${m.reasons.length} reasons`,
      fields: "deliveries.delay_reason", filters: FILTERS, value: "see breakdown sheet", codeRef: "deliverySectionData (reasons)",
      formula: "Count of delivered cars per delay reason, most common first.", shows: "What is holding deliveries up most often.",
      inputs: m.reasons.map((row) => `${row.reason}: ${num(row.count)}`).join("; ") });
    add({ section: "Table: Delay reasons ranked", label: "Average extra days", level: "Customer", across: `${m.reasons.length} reasons`,
      fields: "deliveries.days_to_deliver", filters: FILTERS, value: lead && lead.averageExtraDays !== null ? `${lead.averageExtraDays.toFixed(1)} days (top reason)` : "—",
      codeRef: "deliverySectionData (reasons.averageExtraDays)", formula: "Average days to deliver for orders with this reason minus the average days of on-time deliveries.",
      shows: "How much extra waiting each reason causes.", inputs: `On-time average ${m.averageOnTimeDays === null ? "—" : m.averageOnTimeDays.toFixed(1)} days` });
    add({ section: "Table: Delay reasons ranked", label: "Controllable vs not", level: "Customer", across: `${m.reasons.length} reasons`,
      fields: "—", filters: "—", value: "Placeholder — not mapped", codeRef: "NO MATCHING FUNCTION (static placeholder text in components/delivery-section.tsx)",
      formula: "Not calculated; reasons are not mapped to controllable / not controllable on screen.", shows: "Nothing yet; do not present as a metric.", inputs: "—" });

    add({ section: "Table: Orders awaiting delivery", label: "Days waiting / Order value / row list", level: "Customer", across: `${num(m.awaitingRows.length)} orders`,
      fields: "leads.status_history (order_placed), leads.deal_value", filters: FILTERS, value: `${num(m.awaitingRows.length)} rows; longest wait ${m.awaitingRows[0] ? `${num(m.awaitingRows[0].daysWaiting)} days` : "—"}`,
      codeRef: "deliverySectionData (awaitingRows)", formula: "Each undelivered order with whole days since the order was placed; rows 30+ days are highlighted.",
      shows: "Which individual customers to chase.", inputs: `Highlight at ${THRESHOLDS.staleOrderDays}+ days (the screen compares days waiting, not idle days)` });
    add({ section: "Table: Closed lost revenue", label: "Lost deals list and Deal value", level: "Customer", across: `${num(m.closedLostCount)} lost deals`,
      fields: "leads.status, leads.lost_reason, leads.deal_value", filters: FILTERS, value: `${num(m.closedLostCount)} deals, ${cur(m.closedLostValue)}`,
      codeRef: "deliverySectionData (closedLostRows, closedLostCount, closedLostValue)",
      formula: "Leads with status lost, newest loss first, with their deal value and reason.", shows: "Money we lost, kept apart from open orders.", inputs: "—" });
    return rows;
  },
  flags: () => [
    { page: "Delivery", label: "Controllable vs not", where: "components/delivery-section.tsx", note: "Static placeholder; no function behind it." },
    { page: "Delivery", label: "Delayed deliveries sub-line 'avg'", where: "components/delivery-section.tsx", note: "Label says average; the number shown is a median." },
    { page: "Delivery", label: "Branch delivery scorecard summary sentence", where: "components/delivery-section.tsx", note: "Assembled in the component." },
  ],
};
