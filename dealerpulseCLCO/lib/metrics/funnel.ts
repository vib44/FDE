import { STAGES, DELIVERED_STAGE, LOST } from "../config.ts";
import type { Stage } from "../config.ts";
import type { Lead } from "../types.ts";
import { ratio } from "./stats.ts";

/** Closed win rate = delivered / (delivered + lost). Null when nothing has closed. */
export function closedWinRate(leads: Lead[]): number | null {
  const won = leads.filter((l) => l.status === DELIVERED_STAGE).length;
  const lost = leads.filter((l) => l.status === LOST).length;
  return ratio(won, won + lost);
}
/** Funnel: count (and deal value) of leads that REACHED each stage per status_history. */
export function funnel(leads: Lead[]) {
  const rows = STAGES.map((stage) => {
    const hit = leads.filter((l) => l.reached[stage] !== null);
    return { stage, count: hit.length, value: hit.reduce((s, l) => s + l.dealValue, 0) };
  });
  return rows.map((r, i) => {
    const prev = rows[i - 1];
    return { ...r, conversionFromPrev: prev ? ratio(r.count, prev.count) : null,
      dropOff: prev ? (ratio(r.count, prev.count) === null ? null : 1 - r.count / prev.count) : null };
  });
}
/** Stage-to-stage conversion = reached(to) / reached(from). */
export function stageConversion(leads: Lead[], from: Stage, to: Stage): number | null {
  return ratio(leads.filter((l) => l.reached[to] !== null).length, leads.filter((l) => l.reached[from] !== null).length);
}
/** Data quality: lost leads that have no "lost" history event. */
export const lostWithoutEvent = (leads: Lead[]) => leads.filter((l) => l.status === LOST && !l.hasLostEvent);
