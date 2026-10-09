import { DELIVERED_STAGE, LOST, STAGES, THRESHOLDS } from "../config.ts";
import type { Stage } from "../config.ts";
import type { Lead } from "../types.ts";
import { ratio } from "./stats.ts";

export type WinProbabilityBasis = "stage + source" | "stage only";

export interface WinProbability {
  probability: number | null;
  basis: WinProbabilityBasis;
}

function closedAtStage(leads: Lead[], stage: Stage): Lead[] {
  return leads.filter((lead) =>
    (lead.status === DELIVERED_STAGE || lead.status === LOST) &&
    lead.reached[stage] !== null);
}

function deliveredShare(leads: Lead[]): number | null {
  return ratio(leads.filter((lead) => lead.status === DELIVERED_STAGE).length, leads.length);
}

export function winProbability(leads: Lead[], stage: Stage, source: string): WinProbability {
  const closedAtSource = closedAtStage(leads, stage)
    .filter((lead) => lead.source === source);
  if (closedAtSource.length >= THRESHOLDS.minClosedLeadsForSourceWinProbability) {
    return { probability: deliveredShare(closedAtSource), basis: "stage + source" };
  }
  return { probability: deliveredShare(closedAtStage(leads, stage)), basis: "stage only" };
}

export function expectedValue(lead: Lead, leads: Lead[]): number | null {
  if (lead.status === DELIVERED_STAGE || lead.status === LOST ||
    !STAGES.includes(lead.status as Stage)) {
    return null;
  }
  const { probability } = winProbability(leads, lead.status as Stage, lead.source);
  return probability === null ? null : lead.dealValue * probability;
}
