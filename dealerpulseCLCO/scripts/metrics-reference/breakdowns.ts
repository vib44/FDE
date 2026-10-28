import { DELIVERED_STAGE, LOST, ORDER_STAGE, PRE_ORDER_STAGES, STAGES, THRESHOLDS } from "../../lib/config.ts";
import type { Stage } from "../../lib/config.ts";
import { toMonth } from "../../lib/dates.ts";
import { formatSourceName } from "../../lib/format.ts";
import { awaitingOrders, coldLeads, delayStats, deliverySectionData, medianDaysToDeliver, overdueOpen } from "../../lib/metrics/delivery.ts";
import { filterLeads } from "../../lib/metrics/filters.ts";
import { closedWinRate } from "../../lib/metrics/funnel.ts";
import { sourceQuality } from "../../lib/metrics/funnel-charts.ts";
import { leadValueCeiling } from "../../lib/metrics/lead-value-ceiling.ts";
import {
  dealProgressionMetrics,
  inProgressPipeline,
  lostAtStage,
  openAtStage,
  overdueAtStage,
  stageConversion,
  timeToNextStage,
} from "../../lib/metrics/stage-progression.ts";
import { attainment } from "../../lib/metrics/targets.ts";
import { winProbability } from "../../lib/metrics/win-probability.ts";
import type { Ctx } from "./types.ts";

export type Kind = "text" | "cur" | "pct" | "int" | "days" | "dec";
export interface Column { header: string; width: number; kind: Kind }
export interface Table { columns: Column[]; rows: (string | number | null)[][]; totals?: (string | number | null)[]; note?: string }

const DAY = 86_400_000;
const c = (header: string, kind: Kind = "text", width = 16): Column => ({ header, kind, width });
const stageName = (stage: string) => stage.replaceAll("_", " ");
const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

export function byBranch({ ds, filters }: Ctx): Table {
  const scope = filterLeads(ds, filters);
  const delivery = deliverySectionData(ds, filters);
  const rev = attainment(ds, filters, "deliveries").rows;
  const ord = attainment(ds, filters, "orders").rows;
  const ceiling = leadValueCeiling(ds, filters).branches;
  const columns = [
    c("Branch", "text", 20), c("Manager", "text", 18), c("Reps in branch", "int", 10), c("Leads", "int", 10),
    c("Revenue delivered", "cur"), c("Target revenue", "cur"),
    c("Attainment: delivered revenue ÷ target revenue", "pct", 18),
    c("Attainment: orders booked ÷ target units", "pct", 18),
    c("Attainment: booked revenue ÷ target revenue", "pct", 18),
    c("Closed win rate", "pct"), c("Delivered (won)", "int"), c("Lost", "int"),
    c("Test-drive booking rate (contacted → test drive)", "pct", 20),
    c("Negotiation closing rate (negotiation → order)", "pct", 20),
    c("Unordered deal value", "cur"), c("Unordered deals (count)", "int"),
    c("Ordered deal value", "cur"), c("Ordered deals (count)", "int"),
    c("Deliveries done", "int"), c("Average days to deliver", "days"), c("Typical (median) days to deliver", "days"),
    c("Delay rate", "pct"), c("Leads per rep (leads ÷ reps in branch)", "dec", 16),
    c("Lead-volume ceiling (all lead value ÷ target revenue)", "pct", 20), c("Total deal value of all leads", "cur"),
    c("Overdue open deals (past expected close date)", "int", 16),
    c("Waiting too long for a test drive (past overdue threshold)", "int", 18),
    c("Negotiations past overdue threshold", "int", 16),
    c("Idle leads (no activity beyond the cold / stale limit)", "int", 18),
  ];
  const rows = ds.branches.map((branch) => {
    const leads = scope.filter((lead) => lead.branchId === branch.id);
    const reps = ds.reps.filter((rep) => rep.branchId === branch.id);
    const manager = reps.find((rep) => rep.role.trim().toLowerCase() === "branch_manager")?.name ?? null;
    const revenueRow = rev.find((row) => row.branchId === branch.id);
    const orderRow = ord.find((row) => row.branchId === branch.id);
    const card = delivery.scorecardRows.find((row) => row.branchId === branch.id);
    const delivered = leads.filter((lead) => lead.delivery !== null);
    const closed = leads.filter((lead) => lead.status === DELIVERED_STAGE || lead.status === LOST);
    const pipeline = inProgressPipeline(leads);
    const waiting = awaitingOrders(leads, ds.asOf);
    const progress = dealProgressionMetrics(leads, filters, ds.asOf);
    const ceilingRow = ceiling.find((row) => row.branchId === branch.id);
    const idle = leads.filter((lead) =>
      lead.status === ORDER_STAGE && lead.delivery === null
        ? Math.floor((ds.asOf - lead.lastActivityAt) / DAY) > THRESHOLDS.staleOrderDays
        : (PRE_ORDER_STAGES as readonly string[]).includes(lead.status) &&
          Math.floor((ds.asOf - lead.lastActivityAt) / DAY) > THRESHOLDS.coldLeadDays);
    return [
      branch.name, manager, reps.length, leads.length,
      revenueRow?.revenue ?? 0, revenueRow?.targetRevenue ?? 0,
      revenueRow?.revenuePct ?? null, orderRow?.unitsPct ?? null, orderRow?.revenuePct ?? null,
      closedWinRate(leads), closed.filter((lead) => lead.status === DELIVERED_STAGE).length,
      closed.filter((lead) => lead.status === LOST).length,
      stageConversion(leads, "contacted", "test_drive"), stageConversion(leads, "negotiation", "order_placed"),
      pipeline.value, pipeline.count,
      sum(waiting.map((row) => row.value)), waiting.length,
      card?.deliveries ?? 0, card?.averageDays ?? null, card?.medianDays ?? null,
      delayStats(delivered).delayRate, reps.length ? leads.length / reps.length : null,
      ceilingRow?.ceilingPct ?? null, ceilingRow?.leadValue ?? 0,
      overdueOpen(leads, ds.asOf).length,
      progress.bookingOverdueRows.length, progress.closingOverdueRows.length, idle.length,
    ];
  });
  const col = (index: number) => rows.reduce((total, row) => total + Number(row[index] ?? 0), 0);
  const all = scope;
  const allProgress = dealProgressionMetrics(all, filters, ds.asOf);
  const allPipeline = inProgressPipeline(all);
  const allCeiling = leadValueCeiling(ds, filters);
  const totalRev = rev.reduce((total, row) => total + row.revenue, 0);
  const totalTarget = rev.reduce((total, row) => total + row.targetRevenue, 0);
  const totalUnits = ord.reduce((total, row) => total + row.units, 0);
  const totalTargetUnits = ord.reduce((total, row) => total + row.targetUnits, 0);
  const totalBooked = ord.reduce((total, row) => total + row.revenue, 0);
  const totalOrdTarget = ord.reduce((total, row) => total + row.targetRevenue, 0);
  const closedAll = all.filter((lead) => lead.status === DELIVERED_STAGE || lead.status === LOST);
  const totals = [
    "All branches", null, col(2), col(3), totalRev, totalTarget,
    totalTarget ? totalRev / totalTarget : null, totalTargetUnits ? totalUnits / totalTargetUnits : null,
    totalOrdTarget ? totalBooked / totalOrdTarget : null,
    closedWinRate(all), closedAll.filter((lead) => lead.status === DELIVERED_STAGE).length,
    closedAll.filter((lead) => lead.status === LOST).length,
    stageConversion(all, "contacted", "test_drive"), stageConversion(all, "negotiation", "order_placed"),
    allPipeline.value, allPipeline.count, col(16), col(17), col(18),
    delivery.scorecardTotals.averageDays, medianDaysToDeliver(all),
    delayStats(all.filter((lead) => lead.delivery !== null)).delayRate,
    ds.reps.length ? all.length / ds.reps.length : null,
    allCeiling.ceilingPct, allCeiling.leadValue,
    overdueOpen(all, ds.asOf).length, allProgress.bookingOverdueRows.length, allProgress.closingOverdueRows.length, col(28),
  ];
  return {
    columns, rows, totals,
    note: "Totals row: rates are recomputed across the whole company (not averaged across branches). Targets attach to a branch only for months that have a target.",
  };
}

const STEPS: { from: Stage; to: Stage; label: string }[] = [
  { from: "new", to: "contacted", label: "New → Contacted" },
  { from: "contacted", to: "test_drive", label: "Contacted → Test drive" },
  { from: "test_drive", to: "negotiation", label: "Test drive → Negotiation" },
  { from: "negotiation", to: "order_placed", label: "Negotiation → Order" },
  { from: "order_placed", to: "delivered", label: "Order → Delivered" },
];

export function byStep({ ds, filters }: Ctx): Table {
  const leads = filterLeads(ds, filters);
  const columns = [
    c("Step", "text", 26), c("Leads that reached the start", "int", 14), c("Leads that reached the end", "int", 14),
    c("Move-on rate", "pct", 12), c("Lost at this step (count)", "int", 14), c("Lost at this step (₹)", "cur", 16),
    c("Still open (reached start, not moved on, not lost)", "int", 18), c("Typical days to move on (median)", "days", 16),
    c("Overdue threshold (75th percentile, days)", "days", 18), c("Open now (currently at the start stage)", "int", 16),
    c("Overdue now (open longer than threshold)", "int", 16),
  ];
  const rows = STEPS.map(({ from, to, label }) => {
    const reachedStart = leads.filter((lead) => lead.reached[from] !== null);
    const reachedEnd = reachedStart.filter((lead) => lead.reached[to] !== null);
    const lost = lostAtStage(leads, from);
    const time = timeToNextStage(leads, from, to);
    const open = openAtStage(leads, from, ds.asOf);
    return [
      label, reachedStart.length, reachedEnd.length, stageConversion(leads, from, to), lost.count, lost.value,
      reachedStart.filter((lead) => lead.reached[to] === null && lead.status !== LOST).length,
      time.medianDays, time.percentile75Days, open.length, overdueAtStage(open, time.percentile75Days).length,
    ];
  });
  return {
    columns, rows,
    note: "Every figure comes from leads' status history: 'reached' means the lead has a history event for that stage, in any order. 'Lost at this step' uses the last stage before the lead was lost.",
  };
}

export function bySource({ ds, filters }: Ctx): Table {
  const quality = sourceQuality(ds, filters).data;
  const pool = filterLeads(ds, { ...filters, branch: null, rep: null, source: null });
  const oddStages = STAGES.filter((stage) => stage !== DELIVERED_STAGE);
  const total = sum(quality.map((row) => row.leads));
  const columns = [
    c("Source", "text", 18), c("Leads", "int", 10), c("Share of leads", "pct", 12), c("Closed leads", "int", 12),
    c("Closed win rate", "pct", 12), c("Revenue delivered", "cur"), c("Revenue per lead", "cur"),
    c("Median first-response hours", "dec", 14),
    ...oddStages.map((stage) => c(`Chance to buy at ${stageName(stage)}`, "pct", 14)),
    c("Basis used (stage + source, or stage only)", "text", 30),
  ];
  const rows = quality.map((row) => {
    const chances = oddStages.map((stage) => winProbability(pool, stage, row.source));
    const basis = oddStages.map((stage, index) => `${stageName(stage)}: ${chances[index]!.basis}`).join("; ");
    return [
      formatSourceName(row.source), row.leads, total ? row.leads / total : null, row.closedLeads, row.winRate,
      row.revenue, row.leads ? row.revenue / row.leads : null, row.medianResponseHours,
      ...chances.map((chance) => chance.probability), basis,
    ];
  });
  const all = filterLeads(ds, filters);
  const totalRevenue = sum(quality.map((row) => row.revenue));
  const totals = [
    "All sources", total, total ? 1 : null, sum(quality.map((row) => row.closedLeads)), closedWinRate(all),
    totalRevenue, total ? totalRevenue / total : null, null,
    ...oddStages.map((stage) => winProbability(pool, stage, "").probability), "Company-wide stage-only chance (no source)",
  ];
  return {
    columns, rows, totals,
    note: `Chance to buy = share of closed leads (delivered or lost) that had reached the stage and were delivered. A source's own rate is used only when it has at least ${THRESHOLDS.minClosedLeadsForSourceWinProbability} closed leads at that stage; otherwise the all-source stage rate is used.`,
  };
}

export function byRep({ ds, filters }: Ctx): Table {
  const leads = filterLeads(ds, filters);
  const open = leads.filter((lead) =>
    (PRE_ORDER_STAGES as readonly string[]).includes(lead.status) || (lead.status === ORDER_STAGE && lead.delivery === null));
  const overdue = overdueOpen(open, ds.asOf);
  const columns = [
    c("Rep", "text", 20), c("Branch", "text", 18), c("Role", "text", 16), c("Leads", "int", 10),
    c("Closed win rate", "pct", 12), c("Revenue delivered", "cur"), c("Open leads", "int", 10), c("Overdue leads", "int", 10),
    c("In the Funnel page rep leaderboard?", "text", 22),
  ];
  const build = (rep: (typeof ds.reps)[number]) => {
    const own = leads.filter((lead) => lead.repId === rep.id);
    const isManager = rep.role.trim().toLowerCase() === "branch_manager";
    return {
      own,
      row: [
        rep.name, ds.branchById[rep.branchId]?.name ?? rep.branchId, rep.role.replaceAll("_", " "), own.length,
        closedWinRate(own), sum(own.filter((lead) => lead.status === DELIVERED_STAGE).map((lead) => lead.dealValue)),
        open.filter((lead) => lead.repId === rep.id).length, overdue.filter((lead) => lead.repId === rep.id).length,
        own.length === 0 ? "No (no leads)" : isManager ? "No (branch manager)" : "Yes",
      ] as (string | number | null)[],
    };
  };
  const built = ds.reps.map(build);
  const withLeads = built.filter((item) => item.own.length > 0);
  const without = built.filter((item) => item.own.length === 0);
  const rows = [
    ...withLeads.map((item) => item.row).sort((a, b) => Number(b[3]) - Number(a[3])),
    ...(without.length ? [["Reps with no leads in this view", null, null, null, null, null, null, null, null] as (string | number | null)[]] : []),
    ...without.map((item) => item.row),
  ];
  return {
    columns, rows,
    note: "Reps with no leads are listed separately at the bottom, as the app leaves them out of the leaderboard.",
  };
}

export function byMonth({ ds, filters }: Ctx): Table {
  const median = medianDaysToDeliver(filterLeads(ds, filters));
  const columns = [
    c("Month (UTC)", "text", 12), c("Target units", "int", 12), c("Orders booked (units)", "int", 14),
    c("Target revenue", "cur"), c("Actual revenue: orders booked (basis used for pacing on the Targets page)", "cur", 24),
    c("Actual revenue: cars delivered", "cur", 18),
    c("Pacing: booked revenue ÷ target revenue", "pct", 16), c("Delivered revenue ÷ target revenue", "pct", 16),
    c("Leads created", "int", 12), c("Cohort maturity", "text", 26),
  ];
  const rows = ds.months.map((month) => {
    const from = Date.parse(`${month}-01T00:00:00.000Z`);
    const next = new Date(from);
    next.setUTCMonth(next.getUTCMonth() + 1);
    const to = next.getTime() - 1;
    const scope = { ...filters, from, to };
    const booked = attainment(ds, scope, "orders").rows;
    const delivered = attainment(ds, scope, "deliveries").rows;
    const targetRevenue = sum(booked.map((row) => row.targetRevenue));
    const bookedRevenue = sum(booked.map((row) => row.revenue));
    const deliveredRevenue = sum(delivered.map((row) => row.revenue));
    const cohort = ds.leads.filter((lead) => toMonth(lead.createdAt) === month);
    const maturing = median !== null && ds.asOf - to < median * DAY;
    return [
      month, sum(booked.map((row) => row.targetUnits)), sum(booked.map((row) => row.units)),
      targetRevenue, bookedRevenue, deliveredRevenue,
      targetRevenue ? bookedRevenue / targetRevenue : null, targetRevenue ? deliveredRevenue / targetRevenue : null,
      cohort.length, maturing ? "Still maturing (not enough time to deliver)" : "Mature",
    ];
  });
  return {
    columns, rows,
    note: "A month's leads are 'still maturing' when less time has passed since the month ended than the typical (median) delivery time, so their orders and deliveries are not complete yet. This mirrors the rule the Targets page cohort chart uses; that rule lives inside the page component, so it is re-stated here using the same typical delivery time.",
  };
}
