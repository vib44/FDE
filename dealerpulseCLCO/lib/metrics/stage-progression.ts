import { DELIVERED_STAGE, LOST, PRE_ORDER_STAGES } from "../config.ts";
import type { Stage } from "../config.ts";
import { CONTROLLABLE_LOSS_REASONS } from "../config.ts";
import type { Lead } from "../types.ts";
import type { FilterState } from "../types.ts";
import { median, ratio } from "./stats.ts";

const dayInMs = 86_400_000;

function closedLeads(leads: Lead[]): Lead[] {
  return leads.filter((lead) => lead.status === DELIVERED_STAGE || lead.status === LOST);
}

function canonicalReason(reason: string): string {
  return reason.trim().toLowerCase().replaceAll("_", " ");
}

function isControllable(reason: string): boolean {
  return CONTROLLABLE_LOSS_REASONS.includes(
    canonicalReason(reason) as (typeof CONTROLLABLE_LOSS_REASONS)[number],
  );
}

function latestStageTimestamp(lead: Lead, stage: Stage): number | null {
  return lead.history.filter((event) => event.status === stage).at(-1)?.ts ?? lead.reached[stage];
}

function percentile(values: number[], fraction: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(fraction * sorted.length) - 1]!;
}

/** Share of leads reaching `from` that also reached `to`. */
export function stageConversion(leads: Lead[], from: Stage, to: Stage): number | null {
  const reachedFrom = leads.filter((lead) => lead.reached[from] !== null);
  return ratio(reachedFrom.filter((lead) => lead.reached[to] !== null).length, reachedFrom.length);
}

export function inProgressPipeline(leads: Lead[]) {
  const unordered = leads.filter((lead) =>
    (PRE_ORDER_STAGES as readonly string[]).includes(lead.status));
  return {
    count: unordered.length,
    value: unordered.reduce((sum, lead) => sum + lead.dealValue, 0),
  };
}

export function weakestSalesStep(
  bookingRate: number | null,
  closingRate: number | null,
): { label: string; rate: number | null } {
  if (bookingRate === null && closingRate === null) {
    return { label: "not available", rate: null };
  }
  if (closingRate !== null && (bookingRate === null || closingRate < bookingRate)) {
    return { label: "moving from negotiation to an order", rate: closingRate };
  }
  return { label: "booking a test drive", rate: bookingRate };
}

/** Elapsed days between stage timestamps for leads that reached both stages. */
export function timeToNextStage(leads: Lead[], from: Stage, to: Stage) {
  const durations = leads.flatMap((lead) => {
    const fromAt = lead.reached[from];
    const toAt = lead.reached[to];
    return fromAt === null || toAt === null || toAt < fromAt
      ? []
      : [(toAt - fromAt) / dayInMs];
  });
  return {
    count: durations.length,
    medianDays: median(durations),
    percentile75Days: percentile(durations, 0.75),
  };
}

/** Delivered share among closed leads that reached the stage. */
export function winRateFromStage(leads: Lead[], stage: Stage): number | null {
  const closedAtStage = closedLeads(leads).filter((lead) => lead.reached[stage] !== null);
  return ratio(closedAtStage.filter((lead) => lead.status === DELIVERED_STAGE).length, closedAtStage.length);
}

/** Difference in delivered probability for closed leads reaching test drive vs contact. */
export function testDriveLift(leads: Lead[]): number | null {
  const testDriveRate = winRateFromStage(leads, "test_drive");
  const contactedRate = winRateFromStage(leads, "contacted");
  return testDriveRate === null || contactedRate === null
    ? null
    : testDriveRate - contactedRate;
}

/** Lost leads whose last non-lost status was `stage`, grouped by reason and branch. */
export function lostAtStage(leads: Lead[], stage: Stage) {
  const losses = leads.filter((lead) => lead.status === LOST && lead.lostStage === stage);
  const reasons = new Map<string, { reason: string; count: number; value: number; controllable: boolean }>();
  const branches = new Map<string, { branchId: string; branchName: string; count: number; value: number }>();

  for (const lead of losses) {
    const reason = lead.lostReason ?? "Uncategorized";
    const reasonRow = reasons.get(reason) ?? {
      reason, count: 0, value: 0, controllable: isControllable(reason),
    };
    reasonRow.count += 1;
    reasonRow.value += lead.dealValue;
    reasons.set(reason, reasonRow);

    const branchRow = branches.get(lead.branchId) ?? {
      branchId: lead.branchId, branchName: lead.branchName, count: 0, value: 0,
    };
    branchRow.count += 1;
    branchRow.value += lead.dealValue;
    branches.set(lead.branchId, branchRow);
  }

  return {
    count: losses.length,
    value: losses.reduce((sum, lead) => sum + lead.dealValue, 0),
    reasons: [...reasons.values()].sort((a, b) => b.count - a.count || b.value - a.value ||
      a.reason.localeCompare(b.reason)),
    branches: [...branches.values()].sort((a, b) => b.count - a.count || b.value - a.value ||
      a.branchName.localeCompare(b.branchName)),
  };
}

/** Leads currently in `stage`, with elapsed days in that stage and since activity. */
export function openAtStage(leads: Lead[], stage: Stage, asOf: number) {
  return leads.filter((lead) => lead.status === stage).map((lead) => {
    const enteredAt = latestStageTimestamp(lead, stage) ?? lead.lastActivityAt;
    return {
      lead,
      daysInStage: Math.max(0, (asOf - enteredAt) / dayInMs),
      daysSinceLastActivity: Math.max(0, (asOf - lead.lastActivityAt) / dayInMs),
    };
  }).sort((a, b) => b.lead.dealValue - a.lead.dealValue ||
    b.daysInStage - a.daysInStage || a.lead.customerName.localeCompare(b.lead.customerName));
}

/** Open rows beyond the same 75th-percentile threshold marked by the stage table's Overdue chip. */
export function overdueAtStage<T extends { daysInStage: number }>(
  rows: T[],
  percentile75Days: number | null,
): T[] {
  return percentile75Days === null
    ? []
    : rows.filter((row) => row.daysInStage > percentile75Days);
}

function isInRange(timestamp: number, filters: FilterState): boolean {
  return (filters.from === null || timestamp >= filters.from) &&
    (filters.to === null || timestamp <= filters.to);
}

function stageTimestamp(lead: Lead, stage: Stage): number | null {
  return lead.history.filter((event) => event.status === stage).at(-1)?.ts ?? lead.reached[stage];
}

function stageEventCohort(leads: Lead[], stage: Stage, filters: FilterState): Lead[] {
  const reached = leads.filter((lead) => lead.reached[stage] !== null);
  if (filters.timeBasis !== "event" || (filters.from === null && filters.to === null)) return reached;
  return reached.filter((lead) => {
    const reachedAt = lead.reached[stage];
    return reachedAt !== null && isInRange(reachedAt, filters);
  });
}

function openStageCohort(leads: Lead[], stage: Stage, filters: FilterState, asOf: number) {
  const rows = openAtStage(leads, stage, asOf);
  return filters.timeBasis !== "event"
    ? rows
    : rows.filter(({ lead }) => isInRange(
      stageTimestamp(lead, stage) ?? lead.lastActivityAt,
      filters,
    ));
}

/** Shared data for the Deals in progress KPI cards and Step 2/Step 4 tables. */
export function dealProgressionMetrics(leads: Lead[], filters: FilterState, asOf: number) {
  const contacted = stageEventCohort(leads, "contacted", filters);
  const testDrives = stageEventCohort(leads, "test_drive", filters);
  const negotiations = stageEventCohort(leads, "negotiation", filters);
  const orders = stageEventCohort(leads, "order_placed", filters);
  const bookingTime = timeToNextStage(contacted, "contacted", "test_drive");
  const testDriveOrderTime = timeToNextStage(testDrives, "test_drive", "order_placed");
  const closingTime = timeToNextStage(negotiations, "negotiation", "order_placed");
  const bookingOpenRows = openStageCohort(leads, "contacted", filters, asOf);
  const closingOpenRows = openStageCohort(leads, "negotiation", filters, asOf);

  return {
    testDriveCount: testDrives.length,
    negotiationCount: negotiations.length,
    orderCount: orders.length,
    orderValue: orders.reduce((sum, lead) => sum + lead.dealValue, 0),
    bookingRate: stageConversion(contacted, "contacted", "test_drive"),
    testDriveOrderRate: stageConversion(testDrives, "test_drive", "order_placed"),
    closingRate: stageConversion(negotiations, "negotiation", "order_placed"),
    bookingTime,
    testDriveOrderTime,
    closingTime,
    bookingOpenRows,
    closingOpenRows,
    bookingOverdueRows: overdueAtStage(bookingOpenRows, bookingTime.percentile75Days),
    closingOverdueRows: overdueAtStage(closingOpenRows, closingTime.percentile75Days),
  };
}
