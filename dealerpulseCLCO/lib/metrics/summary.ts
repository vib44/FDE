import type { Lead } from "../types.ts";

/** Summarize the size and branch coverage of a filtered lead scope. */
export function scopeSummary(leads: Lead[]) {
  return {
    leadCount: leads.length,
    branchCount: new Set(leads.map((lead) => lead.branchId)).size,
  };
}
