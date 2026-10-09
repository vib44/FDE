import { ORDER_STAGE, PRE_ORDER_STAGES } from "../config.ts";
import type { Dataset, FilterState, Lead } from "../types.ts";
import { filterLeads, inRange } from "./filters.ts";

const DAY = 86_400_000;

export const OPEN_LEAD_AGE_BUCKETS = [
  { key: "today", label: "0 days", min: 0, max: 0 },
  { key: "1-3", label: "1–3 days", min: 1, max: 3 },
  { key: "4-8", label: "4–8 days", min: 4, max: 8 },
  { key: "9-12", label: "9–12 days", min: 9, max: 12 },
  { key: "13-20", label: "13–20 days", min: 13, max: 20 },
  { key: "over-20", label: "> 20 days", min: 21, max: Infinity },
] as const;

export type OpenLeadAgeBucketKey = (typeof OPEN_LEAD_AGE_BUCKETS)[number]["key"];

export interface OpenLeadBucket {
  ageBucketKey: OpenLeadAgeBucketKey;
  ageBucketLabel: string;
  lastStatus: string;
  count: number;
  cumulativeDealValue: number;
}

export interface OpenLeadBranchSummary {
  branchId: string;
  count: number;
  cumulativeDealValue: number;
  lastStatuses: string[];
}

export function filterOpenLeads(dataset: Dataset, filters: FilterState): Lead[] {
  return filterLeads(dataset, filters).filter((lead) =>
    ((PRE_ORDER_STAGES as readonly string[]).includes(lead.status) || lead.status === ORDER_STAGE) &&
    (filters.timeBasis !== "event" || inRange(lead.lastActivityAt, filters)));
}

export function openLeadBuckets(
  leads: Lead[],
  asOf: number,
  selectedAgeBuckets: readonly OpenLeadAgeBucketKey[],
  status: string | null,
): OpenLeadBucket[] {
  const selected = new Set(selectedAgeBuckets);
  const rows = new Map<string, OpenLeadBucket>();

  for (const lead of leads) {
    if (status && lead.status !== status) continue;
    const ageDays = Math.floor((asOf - lead.lastActivityAt) / DAY);
    const ageBucket = OPEN_LEAD_AGE_BUCKETS.find((bucket) => ageDays >= bucket.min && ageDays <= bucket.max);
    if (!ageBucket || !selected.has(ageBucket.key)) continue;

    const key = `${ageBucket.key}:${lead.status}`;
    const row = rows.get(key) ?? {
      ageBucketKey: ageBucket.key,
      ageBucketLabel: ageBucket.label,
      lastStatus: lead.status,
      count: 0,
      cumulativeDealValue: 0,
    };
    row.count += 1;
    row.cumulativeDealValue += lead.dealValue;
    rows.set(key, row);
  }

  const bucketOrder = new Map(OPEN_LEAD_AGE_BUCKETS.map((bucket, index) => [bucket.key, index]));
  return [...rows.values()].sort((a, b) =>
    bucketOrder.get(a.ageBucketKey)! - bucketOrder.get(b.ageBucketKey)! ||
    a.lastStatus.localeCompare(b.lastStatus));
}

export function openLeadsByBranch(
  leads: Lead[],
  asOf: number,
  selectedAgeBuckets: readonly OpenLeadAgeBucketKey[],
  status: string | null,
): OpenLeadBranchSummary[] {
  const selected = new Set(selectedAgeBuckets);
  const branches = new Map<string, OpenLeadBranchSummary>();

  for (const lead of leads) {
    if (status && lead.status !== status) continue;
    const ageDays = Math.floor((asOf - lead.lastActivityAt) / DAY);
    const ageBucket = OPEN_LEAD_AGE_BUCKETS.find((bucket) => ageDays >= bucket.min && ageDays <= bucket.max);
    if (!ageBucket || !selected.has(ageBucket.key)) continue;

    const row = branches.get(lead.branchId) ?? {
      branchId: lead.branchId,
      count: 0,
      cumulativeDealValue: 0,
      lastStatuses: [],
    };
    row.count += 1;
    row.cumulativeDealValue += lead.dealValue;
    if (!row.lastStatuses.includes(lead.status)) row.lastStatuses.push(lead.status);
    branches.set(lead.branchId, row);
  }

  return [...branches.values()].map((row) => ({
    ...row,
    lastStatuses: row.lastStatuses.sort((a, b) => a.localeCompare(b)),
  }));
}
