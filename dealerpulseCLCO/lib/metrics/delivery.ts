import { DELIVERY_AGE_BUCKETS, LOST, ORDER_STAGE, PRE_ORDER_STAGES } from "../config.ts";
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
  return { total: ds.length, delayed: delayed.length, delayRate: ratio(delayed.length, ds.length),
    avgDelayedDays: avg(delayed), avgOnTimeDays: avg(onTime), reasons };
}

/** (b) Orders awaiting delivery: status order_placed AND no delivery record.
 *  ageDays = (asOf - order_placed timestamp); idleDays = asOf - last_activity_at. */
export function awaitingOrders(leads: Lead[], asOf: number) {
  return leads.filter((l) => l.status === ORDER_STAGE && !l.delivery).map((l) => ({
    lead: l, ageDays: (asOf - (l.reached[ORDER_STAGE] ?? l.lastActivityAt)) / DAY,
    idleDays: (asOf - l.lastActivityAt) / DAY, value: l.dealValue }));
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
  const lost = candidates.filter((lead) => lead.status === LOST &&
    matchesEventRange(lead.history.filter((event) => event.status === LOST).at(-1)?.ts ?? lead.lastActivityAt));
  const delaySummary = delayStats(delivered);
  const onTimeDays = delaySummary.avgOnTimeDays;

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

  const aging = new Map<string, Map<number, { count: number; value: number; leadIds: string[] }>>();
  const bucketTotals = DELIVERY_AGE_BUCKETS.map((bucket) => ({
    label: bucket.label,
    count: 0,
    value: 0,
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
    delayedCount: delaySummary.delayed,
    delayRate: delaySummary.delayRate,
    averageDelayedDays: delaySummary.avgDelayedDays,
    averageOnTimeDays: delaySummary.avgOnTimeDays,
    awaitingCount: awaitingRows.length,
    awaitingValue: awaitingRows.reduce((sum, row) => sum + row.value, 0),
    closedLostCount: closedLostRows.length,
    closedLostValue: closedLostRows.reduce((sum, row) => sum + row.lead.dealValue, 0),
    closedLostRows,
    reasons: reasonRows,
    branchCycles: branchCycleRows,
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
