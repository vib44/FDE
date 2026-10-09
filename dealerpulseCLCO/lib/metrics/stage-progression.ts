import { DELIVERED_STAGE, LOST } from "../config.ts";
import type { Stage } from "../config.ts";
import { CONTROLLABLE_LOSS_REASONS } from "../config.ts";
import type { Lead } from "../types.ts";
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
