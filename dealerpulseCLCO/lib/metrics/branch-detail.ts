import { DELIVERED_STAGE, LOST, STAGES, THRESHOLDS } from "../config.ts";
import type { Stage } from "../config.ts";
import { toMonth } from "../dates.ts";
import type { Dataset, FilterState, Lead } from "../types.ts";
import { coldLeads, awaitingOrders } from "./delivery.ts";
import { filterLeads } from "./filters.ts";
import { firstResponseHours } from "./response.ts";
import { median, ratio } from "./stats.ts";

const lostAt = (lead: Lead) => lead.history.filter((event) => event.status === LOST).at(-1)?.ts ?? null;

export interface BranchDetailMetricSet {
  contactRate: number | null;
  testDriveToOrder: number | null;
  winRate: number | null;
  delayRate: number | null;
  workload: number | null;
  firstResponseHours: number | null;
}

function inEventRange(timestamp: number | null, filters: FilterState): boolean {
  return timestamp !== null && (filters.from === null || timestamp >= filters.from) &&
    (filters.to === null || timestamp <= filters.to);
}

function stageLeads(leads: Lead[], stage: Stage, filters: FilterState): Lead[] {
  return leads.filter((lead) => lead.reached[stage] !== null &&
    (filters.timeBasis !== "event" || inEventRange(lead.reached[stage], filters)));
}

function scopedLeads(ds: Dataset, filters: FilterState, branchId: string): Lead[] {
  return filterLeads(ds, { ...filters, branch: branchId });
}

function branchMetrics(ds: Dataset, filters: FilterState, branchId: string): BranchDetailMetricSet {
  const leads = scopedLeads(ds, filters, branchId);
  const created = leads.filter((lead) => lead.reached.new !== null &&
    (filters.timeBasis !== "event" || inEventRange(lead.reached.new, filters)));
  const contacted = stageLeads(leads, "contacted", filters);
  const testDrives = stageLeads(leads, "test_drive", filters);
  const orderedFromTestDrive = testDrives.filter((lead) => lead.reached.order_placed !== null &&
    (filters.timeBasis !== "event" || inEventRange(lead.reached.order_placed, filters)));
  const closed = leads.filter((lead) =>
    (lead.status === DELIVERED_STAGE && lead.delivery !== null &&
      (filters.timeBasis !== "event" || inEventRange(lead.delivery.deliveredAt, filters))) ||
    (lead.status === LOST && (filters.timeBasis !== "event" || inEventRange(lostAt(lead), filters))));
  const won = closed.filter((lead) => lead.status === DELIVERED_STAGE);
  const delivered = leads.filter((lead) => lead.delivery !== null &&
    (filters.timeBasis !== "event" || inEventRange(lead.delivery.deliveredAt, filters)));
  const delayed = delivered.filter((lead) => lead.delivery?.delayReason !== null);
  const reps = ds.reps.filter((rep) => rep.branchId === branchId);

  return {
    contactRate: ratio(contacted.length, created.length),
    testDriveToOrder: ratio(orderedFromTestDrive.length, testDrives.length),
    winRate: ratio(won.length, closed.length),
    delayRate: ratio(delayed.length, delivered.length),
    workload: reps.length ? leads.length / reps.length : null,
    firstResponseHours: median(contacted
      .map(firstResponseHours).filter((hours): hours is number => hours !== null)),
  };
}

function medianMetrics(metrics: BranchDetailMetricSet[]): BranchDetailMetricSet {
  const value = (key: keyof BranchDetailMetricSet) =>
    median(metrics.map((item) => item[key]).filter((item): item is number => item !== null));
  return {
    contactRate: value("contactRate"),
    testDriveToOrder: value("testDriveToOrder"),
    winRate: value("winRate"),
    delayRate: value("delayRate"),
    workload: value("workload"),
    firstResponseHours: value("firstResponseHours"),
  };
}

export function branchDetailData(ds: Dataset, branchId: string, filters: FilterState) {
  const branch = ds.branchById[branchId];
  if (!branch) return null;

  const selectedLeads = scopedLeads(ds, filters, branchId);
  const stats = branchMetrics(ds, filters, branchId);
  const peerFilters = { ...filters, branch: null, rep: null };
  const peers = ds.branches.filter((item) => item.id !== branchId)
    .map((item) => branchMetrics(ds, peerFilters, item.id));
  const peerMedian = medianMetrics(peers);
  const funnelRows = STAGES.map((stage, index) => {
    const reached = stageLeads(selectedLeads, stage, filters);
    const previous = index ? stageLeads(selectedLeads, STAGES[index - 1]!, filters) : null;
    return {
      stage,
      count: reached.length,
      value: reached.reduce((sum, lead) => sum + lead.dealValue, 0),
      conversion: previous ? ratio(reached.length, previous.length) : null,
    };
  });

  const lossGroups = new Map<string, { reason: string; stage: string; count: number; value: number }>();
  const losses = selectedLeads.filter((lead) => lead.status === LOST &&
    (filters.timeBasis !== "event" || inEventRange(lostAt(lead), filters)));
  for (const lead of losses) {
    const reason = lead.lostReason ?? "Uncategorized";
    const stage = lead.lostStage ?? "Unknown";
    const key = `${reason}\u0000${stage}`;
    const group = lossGroups.get(key) ?? { reason, stage, count: 0, value: 0 };
    group.count += 1;
    group.value += lead.dealValue;
    lossGroups.set(key, group);
  }
  const lossRows = [...lossGroups.values()].sort((a, b) =>
    b.count - a.count || b.value - a.value || a.reason.localeCompare(b.reason));

  const coldRows = coldLeads(selectedLeads, ds.asOf, THRESHOLDS.coldLeadDays)
    .sort((a, b) => b.idleDays - a.idleDays || b.value - a.value);
  const undeliveredRows = awaitingOrders(selectedLeads, ds.asOf)
    .sort((a, b) => b.ageDays - a.ageDays || b.value - a.value);

  const branchReps = ds.reps.filter((rep) => rep.branchId === branchId);
  const repRows = branchReps.map((rep) => {
    const repLeads = selectedLeads.filter((lead) => lead.repId === rep.id);
    const closedRepLeads = repLeads.filter((lead) => lead.status === DELIVERED_STAGE || lead.status === LOST);
    const wonRepLeads = closedRepLeads.filter((lead) => lead.status === DELIVERED_STAGE);
    const repCold = coldRows.filter((row) => row.lead.repId === rep.id);
    return {
      rep,
      leadCount: repLeads.length,
      winRate: ratio(wonRepLeads.length, closedRepLeads.length),
      revenue: wonRepLeads.reduce((sum, lead) => sum + lead.dealValue, 0),
      coldCount: repCold.length,
    };
  }).filter((row) => row.leadCount > 0)
    .sort((a, b) => (a.winRate ?? Number.POSITIVE_INFINITY) - (b.winRate ?? Number.POSITIVE_INFINITY) ||
      b.leadCount - a.leadCount);

  const sourceRows = ds.sources.flatMap((source) => {
    const sourceLeads = selectedLeads.filter((lead) => lead.source === source);
    const sourceClosed = sourceLeads.filter((lead) =>
      (lead.status === DELIVERED_STAGE && lead.delivery !== null &&
        (filters.timeBasis !== "event" || inEventRange(lead.delivery.deliveredAt, filters))) ||
      (lead.status === LOST && (filters.timeBasis !== "event" || inEventRange(lostAt(lead), filters))));
    const sourceWon = sourceClosed.filter((lead) => lead.status === DELIVERED_STAGE);
    return sourceLeads.length ? [{
      source,
      volume: sourceLeads.length,
      winRate: ratio(sourceWon.length, sourceClosed.length),
      revenue: sourceWon.reduce((sum, lead) => sum + lead.dealValue, 0),
      highVolumeLowConverting: false,
    }] : [];
  });
  const sourceVolumeMedian = median(sourceRows.map((row) => row.volume));
  const sourceWinRateMedian = median(sourceRows.map((row) => row.winRate)
    .filter((rate): rate is number => rate !== null));
  for (const row of sourceRows) {
    row.highVolumeLowConverting = sourceVolumeMedian !== null && sourceWinRateMedian !== null &&
      row.volume > sourceVolumeMedian && row.winRate !== null && row.winRate < sourceWinRateMedian;
  }
  sourceRows.sort((a, b) =>
    Number(b.highVolumeLowConverting) - Number(a.highVolumeLowConverting) ||
    b.volume - a.volume || (a.winRate ?? Number.POSITIVE_INFINITY) - (b.winRate ?? Number.POSITIVE_INFINITY));

  const currentMonth = toMonth(ds.asOf);
  const target = ds.targets.find((item) => item.branchId === branchId && item.month === currentMonth);
  const allCurrentLeads = ds.leads.filter((lead) => lead.branchId === branchId &&
    (!filters.source || lead.source === filters.source) && (!filters.model || lead.model === filters.model) &&
    (!filters.rep || lead.repId === filters.rep));
  const deliveredThisMonth = allCurrentLeads.filter((lead) => lead.status === DELIVERED_STAGE &&
    lead.delivery && toMonth(lead.delivery.deliveredAt) === currentMonth);
  const openPipeline = allCurrentLeads.filter((lead) => lead.status !== DELIVERED_STAGE && lead.status !== LOST)
    .reduce((sum, lead) => sum + lead.dealValue, 0);
  const pipeline = {
    targetUnits: target?.units ?? null,
    targetRevenue: target?.revenue ?? null,
    remainingUnits: target ? Math.max(0, target.units - deliveredThisMonth.length) : null,
    remainingRevenue: target ? Math.max(0, target.revenue -
      deliveredThisMonth.reduce((sum, lead) => sum + lead.dealValue, 0)) : null,
    openValue: openPipeline,
    coverage: target ? ratio(openPipeline, Math.max(0, target.revenue -
      deliveredThisMonth.reduce((sum, lead) => sum + lead.dealValue, 0))) : null,
  };

  return {
    branch,
    leads: selectedLeads,
    stats,
    peerMedian,
    funnelRows,
    lossRows,
    lossCount: losses.length,
    coldRows,
    undeliveredRows,
    repRows,
    sourceRows,
    pipeline,
    month: currentMonth,
  };
}
