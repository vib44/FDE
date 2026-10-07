import type { Dataset, FilterState, Lead } from "../types.ts";

/** Leads matching branch/rep/source/model and, on the "created" basis, the date range on created_at.
 *  On the "event" basis the date range is applied by each metric to its own event date. */
export function filterLeads(ds: Dataset, f: FilterState, _asOf: number = ds.asOf): Lead[] {
  return ds.leads.filter((l) =>
    (!f.branch || l.branchId === f.branch) && (!f.rep || l.repId === f.rep) &&
    (!f.source || l.source === f.source) && (!f.model || l.model === f.model) &&
    (f.timeBasis === "event" || ((f.from === null || l.createdAt >= f.from) && (f.to === null || l.createdAt <= f.to))));
}
/** True when ts falls inside the filter's date range (null bounds are open). */
export const inRange = (ts: number, f: FilterState) =>
  (f.from === null || ts >= f.from) && (f.to === null || ts <= f.to);
