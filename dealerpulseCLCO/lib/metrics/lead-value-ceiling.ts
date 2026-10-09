import { toMonth } from "../dates.ts";
import type { Dataset, FilterState, Lead } from "../types.ts";

function matchesDimensions(lead: Lead, filters: FilterState): boolean {
  return (!filters.branch || lead.branchId === filters.branch) &&
    (!filters.rep || lead.repId === filters.rep) &&
    (!filters.source || lead.source === filters.source) &&
    (!filters.model || lead.model === filters.model);
}

function targetMonthInRange(month: string, filters: FilterState): boolean {
  return (filters.from === null || month >= toMonth(filters.from)) &&
    (filters.to === null || month <= toMonth(filters.to));
}

export interface LeadValueCeilingRow {
  branchId: string;
  branchName: string;
  leadCount: number;
  leadValue: number;
  targetUnits: number;
  targetRevenue: number;
  ceilingPct: number | null;
}

/** Best-case lead value and volume compared with revenue and unit targets in scope. */
export function leadValueCeiling(ds: Dataset, filters: FilterState) {
  const targets = ds.targets.filter((target) =>
    (!filters.branch || target.branchId === filters.branch) && targetMonthInRange(target.month, filters));
  const branchMap = new Map<string, LeadValueCeilingRow>(ds.branches
    .filter((branch) => !filters.branch || branch.id === filters.branch)
    .map((branch) => [branch.id, {
      branchId: branch.id,
      branchName: branch.name,
      leadCount: 0,
      leadValue: 0,
      targetUnits: 0,
      targetRevenue: 0,
      ceilingPct: null,
    }]));

  for (const target of targets) {
    const row = branchMap.get(target.branchId) ?? {
      branchId: target.branchId,
      branchName: ds.branchById[target.branchId]?.name ?? target.branchId,
      leadCount: 0,
      leadValue: 0,
      targetUnits: 0,
      targetRevenue: 0,
      ceilingPct: null,
    };
    row.targetUnits += target.units;
    row.targetRevenue += target.revenue;
    branchMap.set(target.branchId, row);
  }

  for (const lead of ds.leads) {
    if (!matchesDimensions(lead, filters) ||
        (filters.from !== null && lead.createdAt < filters.from) ||
        (filters.to !== null && lead.createdAt > filters.to)) continue;
    const row = branchMap.get(lead.branchId);
    if (!row) continue;
    row.leadCount += 1;
    row.leadValue += lead.dealValue;
  }

  const branches = [...branchMap.values()].map((row) => ({
    ...row,
    ceilingPct: row.targetRevenue > 0 ? row.leadValue / row.targetRevenue : null,
  })).sort((a, b) =>
    (a.ceilingPct ?? Number.POSITIVE_INFINITY) - (b.ceilingPct ?? Number.POSITIVE_INFINITY) ||
    a.branchName.localeCompare(b.branchName));

  const overall = branches.reduce((sum, row) => ({
    leadCount: sum.leadCount + row.leadCount,
    leadValue: sum.leadValue + row.leadValue,
    targetUnits: sum.targetUnits + row.targetUnits,
    targetRevenue: sum.targetRevenue + row.targetRevenue,
  }), { leadCount: 0, leadValue: 0, targetUnits: 0, targetRevenue: 0 });

  return {
    ...overall,
    ceilingPct: overall.targetRevenue > 0 ? overall.leadValue / overall.targetRevenue : null,
    branches,
  };
}
