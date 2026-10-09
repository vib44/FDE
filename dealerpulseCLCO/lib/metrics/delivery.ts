import { DELIVERY_AGE_BUCKETS, LOST, ORDER_STAGE, PRE_ORDER_STAGES, THRESHOLDS } from "../config.ts";
import { toDay } from "../dates.ts";
import type { Dataset, FilterState, Lead } from "../types.ts";
import { filterLeads, inRange } from "./filters.ts";
import { DAY, median, ratio } from "./stats.ts";

/** Median days_to_deliver across delivered leads in scope. */
export const medianDaysToDeliver = (leads: Lead[]) =>
  median(leads.flatMap((l) => (l.delivery ? [l.delivery.daysToDeliver] : [])));

/** Delayed = delivery has a delay_reason. Delay rate = delayed / deliveries. */
export function delayStats(leads: Lead[]) {
  const ds = leads.flatMap((l) => (l.delivery ? [l.delivery] : []));
  const delayed = ds.filter((d) => d.delayReason !== null), onTime = ds.filter((d) => d.delayReason === null);
  const avg = (a: typeof ds) => (a.length ? a.reduce((s, d) => s + d.daysToDeliver, 0) / a.length : null);
  const reasons: Record<string, number> = {};
  for (const d of delayed) reasons[d.delayReason!] = (reasons[d.delayReason!] ?? 0) + 1;
  const medianDays = (a: typeof ds) => median(a.map((d) => d.daysToDeliver));
  return { total: ds.length, delayed: delayed.length, delayRate: ratio(delayed.length, ds.length),
    avgDelayedDays: avg(delayed), avgOnTimeDays: avg(onTime),
    medianDelayedDays: medianDays(delayed), medianOnTimeDays: medianDays(onTime), reasons };
}

/** (b) Orders awaiting delivery: status order_placed AND no delivery record.
 *  ageDays = (asOf - order_placed timestamp); idleDays = asOf - last_activity_at. */
export function awaitingOrders(leads: Lead[], asOf: number) {
  return leads.filter((lead) => lead.status === ORDER_STAGE && lead.delivery === null).map((l) => ({
    lead: l, ageDays: (asOf - (l.reached[ORDER_STAGE] ?? l.lastActivityAt)) / DAY,
    idleDays: (asOf - l.lastActivityAt) / DAY, value: l.dealValue }));
}

export interface BranchDeliveryScorecardRow {
  branchId: string;
  branchName: string;
  managerName: string | null;
  deliveries: number;
  averageDays: number | null;
  medianDays: number | null;
  revenueDelivered: number;
  ordersAwaiting: number;
  valueAwaiting: number;
}

export function branchDeliveryScorecard(
  dataset: Dataset,
  delivered: Lead[],
  waiting: ReturnType<typeof awaitingOrders>,
  branchFilter: string | null = null,
): BranchDeliveryScorecardRow[] {
  const branches = dataset.branches.filter((branch) => !branchFilter || branch.id === branchFilter);
  const deliveryByBranch = new Map<string, { days: number[]; revenue: number }>();
  for (const lead of delivered) {
    if (!lead.delivery) continue;
    const totals = deliveryByBranch.get(lead.branchId) ?? { days: [], revenue: 0 };
    totals.days.push(lead.delivery.daysToDeliver);
    totals.revenue += lead.dealValue;
    deliveryByBranch.set(lead.branchId, totals);
  }

  const waitingByBranch = new Map<string, { count: number; value: number }>();
  for (const order of waiting) {
    const totals = waitingByBranch.get(order.lead.branchId) ?? { count: 0, value: 0 };
    totals.count += 1;
    totals.value += order.value;
    waitingByBranch.set(order.lead.branchId, totals);
  }

  return branches.map((branch) => {
    const deliveryTotals = deliveryByBranch.get(branch.id);
    const waitingTotals = waitingByBranch.get(branch.id);
    return {
      branchId: branch.id,
      branchName: branch.name,
      managerName: dataset.reps.find((rep) =>
        rep.branchId === branch.id && rep.role.trim().toLowerCase() === "branch_manager")?.name ?? null,
      deliveries: deliveryTotals?.days.length ?? 0,
      averageDays: deliveryTotals ? deliveryTotals.days.reduce((sum, days) => sum + days, 0) / deliveryTotals.days.length : null,
      medianDays: deliveryTotals ? median(deliveryTotals.days) : null,
      revenueDelivered: deliveryTotals?.revenue ?? 0,
      ordersAwaiting: waitingTotals?.count ?? 0,
      valueAwaiting: waitingTotals?.value ?? 0,
    };
  });
}

export function branchDeliveryScorecardTotals(rows: BranchDeliveryScorecardRow[]) {
  const deliveries = rows.reduce((sum, row) => sum + row.deliveries, 0);
  return {
    deliveries,
    averageDays: deliveries
      ? rows.reduce((sum, row) => sum + (row.averageDays ?? 0) * row.deliveries, 0) / deliveries
      : null,
    revenueDelivered: rows.reduce((sum, row) => sum + row.revenueDelivered, 0),
    ordersAwaiting: rows.reduce((sum, row) => sum + row.ordersAwaiting, 0),
    valueAwaiting: rows.reduce((sum, row) => sum + row.valueAwaiting, 0),
  };
}

export function deliverySectionData(dataset: Dataset, filters: FilterState) {
  const candidates = filterLeads(dataset, filters);
  const matchesEventRange = (timestamp: number) =>
    filters.timeBasis !== "event" || inRange(timestamp, filters);
  const delivered = candidates.filter((lead) =>
    lead.delivery && matchesEventRange(lead.delivery.deliveredAt));
  const waiting = awaitingOrders(candidates, dataset.asOf)
    .filter(({ lead }) => matchesEventRange(lead.reached[ORDER_STAGE] ?? lead.lastActivityAt))
    .map((row) => ({ ...row, ageDays: Math.max(0, row.ageDays) }));
  const scorecardRows = branchDeliveryScorecard(
    dataset,
    delivered,
    waiting,
    filters.branch,
  );
  const lost = candidates.filter((lead) => lead.status === LOST &&
    matchesEventRange(lead.history.filter((event) => event.status === LOST).at(-1)?.ts ?? lead.lastActivityAt));
  const delaySummary = delayStats(delivered);
  const onTimeDays = delaySummary.avgOnTimeDays;
  const deliveredWithTiming = delivered.flatMap((lead) =>
    lead.delivery ? [{ lead, delivery: lead.delivery }] : []);
  const medianDeliveryDays = median(deliveredWithTiming.map(({ delivery }) => delivery.daysToDeliver));
  const fastestDeliveryDays = deliveredWithTiming.length
    ? Math.min(...deliveredWithTiming.map(({ delivery }) => delivery.daysToDeliver))
    : null;
  const fastestDeliveries = fastestDeliveryDays === null ? [] : deliveredWithTiming
    .filter(({ delivery }) => delivery.daysToDeliver === fastestDeliveryDays)
    .map(({ lead }) => ({ leadId: lead.id, model: lead.model, branchName: lead.branchName }));
  const highestDeliveryValue = deliveredWithTiming.length
    ? Math.max(...deliveredWithTiming.map(({ lead }) => lead.dealValue))
    : null;
  const highestValueDeliveries = highestDeliveryValue === null ? [] : deliveredWithTiming
    .filter(({ lead }) => lead.dealValue === highestDeliveryValue)
    .map(({ lead }) => ({ leadId: lead.id, model: lead.model, branchName: lead.branchName }));
  const deliveredByModel = new Map<string, number>();
  for (const { lead } of deliveredWithTiming) {
    deliveredByModel.set(lead.model, (deliveredByModel.get(lead.model) ?? 0) + 1);
  }
  const mostDeliveredModel = [...deliveredByModel]
    .map(([model, count]) => ({ model, count }))
    .sort((a, b) => b.count - a.count || a.model.localeCompare(b.model))[0] ?? null;
  const awaitingIdleCount = waiting.filter(({ idleDays }) => idleDays >= THRESHOLDS.staleOrderDays).length;

  const closedLostRows = lost.map((lead) => ({
    lead,
    lostAt: lead.history.filter((event) => event.status === LOST).at(-1)?.ts ?? lead.lastActivityAt,
  })).sort((a, b) => b.lostAt - a.lostAt || b.lead.dealValue - a.lead.dealValue);

  const reasons = new Map<string, { count: number; totalDays: number; leadIds: string[] }>();
  for (const lead of delivered) {
    const delivery = lead.delivery;
    if (!delivery || delivery.delayReason === null) continue;
    const reason = delivery.delayReason;
    const row = reasons.get(reason) ?? { count: 0, totalDays: 0, leadIds: [] };
    row.count += 1;
    row.totalDays += delivery.daysToDeliver;
    row.leadIds.push(lead.id);
    reasons.set(reason, row);
  }

  const reasonRows = [...reasons].map(([reason, row]) => ({
    reason,
    count: row.count,
    averageExtraDays: onTimeDays === null ? null : row.totalDays / row.count - onTimeDays,
    leadIds: row.leadIds,
  })).sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason));

  const branchDeliveries = new Map<string, { totalDays: number; leadIds: string[] }>();
  for (const lead of delivered) {
    if (!lead.delivery) continue;
    const row = branchDeliveries.get(lead.branchId) ?? { totalDays: 0, leadIds: [] };
    row.totalDays += lead.delivery.daysToDeliver;
    row.leadIds.push(lead.id);
    branchDeliveries.set(lead.branchId, row);
  }
  const branchCycleRows = [...branchDeliveries].map(([branchId, row]) => ({
    branchId,
    branchName: dataset.branchById[branchId]?.name ?? branchId,
    count: row.leadIds.length,
    averageDays: row.totalDays / row.leadIds.length,
    leadIds: row.leadIds,
  })).sort((a, b) => b.averageDays - a.averageDays || a.branchName.localeCompare(b.branchName));

  const branchSpeedRows = [...new Set([...dataset.branches.map((branch) => branch.id), ...branchDeliveries.keys()])]
    .filter((branchId) => !filters.branch || branchId === filters.branch)
    .flatMap((branchId) => {
      const branchLeads = delivered.filter((lead) => lead.branchId === branchId && lead.delivery);
      if (!branchLeads.length) return [];
      const days = branchLeads.map((lead) => lead.delivery!.daysToDeliver);
      const delayedCount = branchLeads.filter((lead) => lead.delivery!.delayReason !== null).length;
      return [{
        branchId,
        branchName: dataset.branchById[branchId]?.name ?? branchId,
        count: branchLeads.length,
        medianDays: median(days)!,
        delayRate: ratio(delayedCount, branchLeads.length)!,
        leadIds: branchLeads.map((lead) => lead.id),
        belowMinimumSample: branchLeads.length < THRESHOLDS.minDeliveriesForBranchRank,
      }];
    })
    .sort((a, b) => a.medianDays - b.medianDays ||
      a.delayRate - b.delayRate || a.branchName.localeCompare(b.branchName))
    .slice(0, 5);

  const aging = new Map<string, Map<number, { count: number; value: number; leadIds: string[] }>>();
  const bucketTotals = DELIVERY_AGE_BUCKETS.map((bucket) => ({
    label: bucket.label,
    count: 0,
    value: 0,
    oldestDaysWaiting: null as number | null,
  }));
  for (const order of waiting) {
    const bucketIndex = DELIVERY_AGE_BUCKETS.findIndex(({ upperDays, inclusive }) =>
      upperDays === null || (inclusive ? order.ageDays <= upperDays : order.ageDays < upperDays));
    if (bucketIndex < 0) continue;
    const branchBuckets = aging.get(order.lead.branchId) ?? new Map();
    const row = branchBuckets.get(bucketIndex) ?? { count: 0, value: 0, leadIds: [] };
    row.count += 1;
    row.value += order.value;
    row.leadIds.push(order.lead.id);
    branchBuckets.set(bucketIndex, row);
    aging.set(order.lead.branchId, branchBuckets);
    bucketTotals[bucketIndex]!.count += 1;
    bucketTotals[bucketIndex]!.value += order.value;
    bucketTotals[bucketIndex]!.oldestDaysWaiting = Math.max(
      bucketTotals[bucketIndex]!.oldestDaysWaiting ?? 0,
      Math.floor(order.ageDays),
    );
  }

  const agingRows = [...aging].flatMap(([branchId, buckets]) =>
    [...buckets].map(([bucketIndex, row]) => ({
      branchId,
      branchName: dataset.branchById[branchId]?.name ?? branchId,
      bucket: DELIVERY_AGE_BUCKETS[bucketIndex]!.label,
      bucketIndex,
      count: row.count,
      value: row.value,
      leadIds: row.leadIds,
    }))).sort((a, b) => b.bucketIndex - a.bucketIndex || b.value - a.value ||
      a.branchName.localeCompare(b.branchName));

  const awaitingRows = waiting.map((row) => ({
    lead: row.lead,
    daysWaiting: Math.floor(row.ageDays),
    value: row.value,
  })).sort((a, b) => b.daysWaiting - a.daysWaiting ||
    b.value - a.value || a.lead.customerName.localeCompare(b.lead.customerName));

  return {
    deliveredCount: delivered.length,
    medianDeliveryDays,
    fastestDeliveryDays,
    fastestDeliveries,
    highestDeliveryValue,
    highestValueDeliveries,
    mostDeliveredModel,
    awaitingIdleCount,
    delayedCount: delaySummary.delayed,
    delayRate: delaySummary.delayRate,
    averageDelayedDays: delaySummary.avgDelayedDays,
    averageOnTimeDays: delaySummary.avgOnTimeDays,
    medianDelayedDays: delaySummary.medianDelayedDays,
    medianOnTimeDays: delaySummary.medianOnTimeDays,
    awaitingCount: awaitingRows.length,
    awaitingValue: awaitingRows.reduce((sum, row) => sum + row.value, 0),
    closedLostCount: closedLostRows.length,
    closedLostValue: closedLostRows.reduce((sum, row) => sum + row.lead.dealValue, 0),
    closedLostRows,
    reasons: reasonRows,
    branchCycles: branchCycleRows,
    scorecardRows,
    scorecardTotals: branchDeliveryScorecardTotals(scorecardRows),
    branchSpeedRows,
    agingRows,
    ageBuckets: bucketTotals,
    awaitingRows,
  };
}

/** (a) Pre-order leads going cold: open in new/contacted/test_drive/negotiation, idle > minIdleDays. */
export function coldLeads(leads: Lead[], asOf: number, minIdleDays: number) {
  return leads.filter((l) => (PRE_ORDER_STAGES as readonly string[]).includes(l.status))
    .map((l) => ({ lead: l, idleDays: (asOf - l.lastActivityAt) / DAY, value: l.dealValue }))
    .filter((x) => x.idleDays > minIdleDays);
}
/** Open leads past expected_close_date: due date strictly before the calendar day (UTC) of asOf,
 *  so a lead due today is not yet overdue. */
export const overdueOpen = (leads: Lead[], asOf: number) =>
  leads.filter((l) => (PRE_ORDER_STAGES as readonly string[]).includes(l.status) || l.status === ORDER_STAGE)
    .filter((l) => l.expectedCloseAt !== null &&
      toDay(l.expectedCloseAt) < toDay(asOf));
