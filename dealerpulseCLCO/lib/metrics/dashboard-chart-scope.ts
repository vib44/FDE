import { toMonth } from "../dates.ts";
import type { Dataset, FilterState } from "../types.ts";

export const dimensionMatch = (ds: Dataset, filters: FilterState, leadId: string) => {
  const lead = ds.leadById[leadId];
  return Boolean(lead && (!filters.branch || lead.branchId === filters.branch) &&
    (!filters.rep || lead.repId === filters.rep) && (!filters.source || lead.source === filters.source) &&
    (!filters.model || lead.model === filters.model));
};

export const withinRange = (timestamp: number | null, filters: FilterState) =>
  timestamp !== null && (filters.from === null || timestamp >= filters.from) &&
  (filters.to === null || timestamp <= filters.to);

export const leadInCreatedScope = (lead: Dataset["leads"][number], filters: FilterState) =>
  filters.timeBasis === "event" || withinRange(lead.createdAt, filters);

export const inMonthRange = (month: string, filters: FilterState) =>
  (filters.from === null || month >= toMonth(filters.from)) &&
  (filters.to === null || month <= toMonth(filters.to));
