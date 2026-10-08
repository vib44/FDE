import { STAGES } from "../config.ts";
import type { Stage } from "../config.ts";
import type { Branch, Dataset, Delivery, Lead, Rep, StatusEvent } from "../types.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
const uniq = (a: string[]) => [...new Set(a)].sort();

/** Parse dates once, join names, derive per-stage timestamps, drop phone numbers. */
export function normalize(raw: any): Dataset {
  const branches: Branch[] = raw.branches.map((b: any) => ({ id: b.id, name: b.name, city: b.city }));
  const reps: Rep[] = raw.sales_reps.map((r: any) => ({ id: r.id, name: r.name, branchId: r.branch_id, role: r.role }));
  const branchById = Object.fromEntries(branches.map((b) => [b.id, b]));
  const repById = Object.fromEntries(reps.map((r) => [r.id, r]));

  const deliveries = new Map<string, Delivery>();
  for (const d of raw.deliveries) {
    deliveries.set(d.lead_id, {
      leadId: d.lead_id, orderAt: Date.parse(d.order_date), deliveredAt: Date.parse(d.delivery_date),
      daysToDeliver: d.days_to_deliver, delayReason: d.delay_reason ?? null,
    });
  }

  const leads: Lead[] = raw.leads.map((l: any): Lead => {
    const history: StatusEvent[] = (l.status_history ?? l.history ?? [])
      .map((h: any) => ({
        status: h.status,
        ts: typeof h.ts === "number" ? h.ts : Date.parse(h.timestamp),
        note: h.note ?? "",
      }))
      .sort((a: StatusEvent, b: StatusEvent) => a.ts - b.ts);
    const reached = Object.fromEntries(STAGES.map((s) => [s, null])) as Record<Stage, number | null>;
    for (const h of history) {
      if ((STAGES as readonly string[]).includes(h.status) && reached[h.status as Stage] === null) {
        reached[h.status as Stage] = h.ts;
      }
    }
    const nonLost = history.filter((h) => h.status !== "lost");
    const hasLostEvent = history.some((h) => h.status === "lost");
    const latestStatus = l.status === "lost" && !hasLostEvent
      ? l.status
      : history.at(-1)?.status ?? l.status;
    return {
      id: l.id, customerName: l.customer_name, source: l.source, model: l.model_interested,
      status: latestStatus, repId: l.assigned_to, repName: repById[l.assigned_to]?.name ?? l.assigned_to,
      branchId: l.branch_id, branchName: branchById[l.branch_id]?.name ?? l.branch_id,
      createdAt: Date.parse(l.created_at), lastActivityAt: Date.parse(l.last_activity_at),
      expectedCloseAt: l.expected_close_date ? Date.parse(l.expected_close_date) : null,
      dealValue: l.deal_value ?? 0, lostReason: l.lost_reason ?? null, history, reached,
      lostStage: nonLost.length ? nonLost[nonLost.length - 1]!.status : null,
      hasLostEvent,
      delivery: deliveries.get(l.id) ?? null,
      // phone intentionally not copied
    };
  });

  let asOf = 0;
  for (const l of leads) asOf = Math.max(asOf, l.createdAt, l.lastActivityAt, ...l.history.map((h) => h.ts));
  for (const d of deliveries.values()) asOf = Math.max(asOf, d.deliveredAt, d.orderAt);

  const targets = raw.targets.map((x: any) => ({
    branchId: x.branch_id, month: x.month, units: x.target_units, revenue: x.target_revenue,
  }));
  return {
    asOf, branches, reps, targets, leads, branchById, repById,
    leadById: Object.fromEntries(leads.map((l) => [l.id, l])),
    sources: uniq(leads.map((l) => l.source)), models: uniq(leads.map((l) => l.model)),
    months: uniq(targets.map((x: any) => x.month)),
  };
}
