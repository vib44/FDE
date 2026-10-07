import { FIRST_RESPONSE_STAGE } from "../config.ts";
import type { Lead } from "../types.ts";
import { HOUR, median } from "./stats.ts";

/** First-response hours = first "contacted" timestamp - created_at. Null if never contacted. */
export function firstResponseHours(l: Lead): number | null {
  const t = l.reached[FIRST_RESPONSE_STAGE];
  return t === null ? null : (t - l.createdAt) / HOUR;
}
export const medianFirstResponse = (leads: Lead[]) =>
  median(leads.map(firstResponseHours).filter((x): x is number => x !== null));
