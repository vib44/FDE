import type { Dataset, FilterState } from "../types.ts";
import { filterLeads, inRange } from "./filters.ts";

export const LAST_CONTACT_BUCKETS = [
  { key: "1-3", label: "1–3 days", min: 1, max: 3 },
  { key: "4-8", label: "4–8 days", min: 4, max: 8 },
  { key: "9-12", label: "9–12 days", min: 9, max: 12 },
  { key: "13-20", label: "13–20 days", min: 13, max: 20 },
  { key: "over-20", label: "> 20 days", min: 21, max: Infinity },
] as const;

export type LastContactBucketKey = (typeof LAST_CONTACT_BUCKETS)[number]["key"];

export interface LastContactBucketPoint {
  key: LastContactBucketKey;
  label: string;
  count: number;
}

export interface LastContactRepPoint {
  repId: string;
  repName: string;
  branchId: string;
  branchName: string;
  counts: Record<LastContactBucketKey, number>;
}

export interface LastContactBranchPoint {
  branchId: string;
  branchName: string;
  reps: { repId: string; repName: string; counts: Record<LastContactBucketKey, number> }[];
}

export interface LastContactVM {
  buckets: LastContactBucketPoint[];
  reps: LastContactRepPoint[];
  branches: LastContactBranchPoint[];
}

function ageBucket(days: number): LastContactBucketKey | null {
  return LAST_CONTACT_BUCKETS.find((bucket) => days >= bucket.min && days <= bucket.max)?.key ?? null;
}

export function lastContactByRepresentative(
  dataset: Dataset,
  filters: FilterState,
  status: string | null = null,
): LastContactVM {
  const leads = filterLeads(dataset, filters).filter((lead) =>
    (!status || lead.status === status) &&
    (filters.timeBasis !== "event" || inRange(lead.lastActivityAt, filters)));
  const emptyCounts = (): Record<LastContactBucketKey, number> => ({
    "1-3": 0, "4-8": 0, "9-12": 0, "13-20": 0, "over-20": 0,
  });
  const repRows = new Map(dataset.reps.map((rep) => {
    const branch = dataset.branchById[rep.branchId];
    return [rep.id, {
      repId: rep.id,
      repName: rep.name,
      branchId: rep.branchId,
      branchName: branch?.name ?? rep.branchId,
      counts: emptyCounts(),
    }] as const;
  }));
  const branchReps = new Map(dataset.branches.map((branch) =>
    [branch.id, new Map<string, Record<LastContactBucketKey, number>>()] as const));

  for (const lead of leads) {
    const ageDays = Math.floor((dataset.asOf - lead.lastActivityAt) / 86_400_000);
    const bucket = ageBucket(ageDays);
    if (!bucket) continue;
    const rep = repRows.get(lead.repId);
    if (rep) rep.counts[bucket] += 1;
    const assignedReps = branchReps.get(lead.branchId);
    if (assignedReps) {
      const counts = assignedReps.get(lead.repId) ?? emptyCounts();
      counts[bucket] += 1;
      assignedReps.set(lead.repId, counts);
    }
  }

  const reps = [...repRows.values()];
  return {
    buckets: LAST_CONTACT_BUCKETS.map(({ key, label }) => ({
      key,
      label,
      count: reps.reduce((sum, rep) => sum + rep.counts[key], 0),
    })),
    reps,
    branches: dataset.branches.map((branch) => ({
      branchId: branch.id,
      branchName: branch.name,
      reps: [...(branchReps.get(branch.id) ?? new Map<string, Record<LastContactBucketKey, number>>()).entries()]
        .map(([repId, count]) => ({
          repId,
          repName: dataset.repById[repId]?.name ?? repId,
          counts: count,
        }))
        .sort((a, b) =>
          Object.values(b.counts).reduce((sum, count) => sum + count, 0) -
            Object.values(a.counts).reduce((sum, count) => sum + count, 0) ||
          a.repName.localeCompare(b.repName)),
    })),
  };
}
