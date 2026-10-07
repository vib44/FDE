import { ORDER_STAGE, PRE_ORDER_STAGES } from "../config.ts";
import { toDay } from "../dates.ts";
import type { Lead } from "../types.ts";
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
