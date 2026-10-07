import { DELIVERED_STAGE, ORDER_STAGE } from "../config.ts";
import { toMonth } from "../dates.ts";
import type { Dataset, FilterState } from "../types.ts";
import { ratio } from "./stats.ts";

export type TargetBasis = "orders" | "deliveries";

/** Attainment per branch-month: actual units & revenue (deal_value) vs target.
 *  basis "orders" -> order_placed timestamp; "deliveries" -> delivery_date. Always event dates. */
export function attainment(ds: Dataset, f: FilterState, basis: TargetBasis) {
  const rows = ds.targets.filter((t) => (!f.branch || t.branchId === f.branch) &&
    (f.from === null || t.month >= toMonth(f.from)) && (f.to === null || t.month <= toMonth(f.to)));
  const key = (b: string, m: string) => `${b}|${m}`;
  const actual = new Map<string, { units: number; revenue: number }>();
  for (const l of ds.leads) {
    if ((f.source && l.source !== f.source) || (f.model && l.model !== f.model) || (f.rep && l.repId !== f.rep)) continue;
    const ts = basis === "orders" ? l.reached[ORDER_STAGE] : l.status === DELIVERED_STAGE ? l.delivery?.deliveredAt ?? null : null;
    if (ts === null) continue;
    const k = key(l.branchId, toMonth(ts)), a = actual.get(k) ?? { units: 0, revenue: 0 };
    a.units += 1; a.revenue += l.dealValue; actual.set(k, a);
  }
  const perBranch: Record<string, { units: number; revenue: number; targetUnits: number; targetRevenue: number }> = {};
  for (const t of rows) {
    const a = actual.get(key(t.branchId, t.month)) ?? { units: 0, revenue: 0 };
    const p = (perBranch[t.branchId] ??= { units: 0, revenue: 0, targetUnits: 0, targetRevenue: 0 });
    p.units += a.units; p.revenue += a.revenue; p.targetUnits += t.units; p.targetRevenue += t.revenue;
  }
  const out = Object.entries(perBranch).map(([branchId, p]) => ({ branchId, ...p,
    unitsPct: ratio(p.units, p.targetUnits), revenuePct: ratio(p.revenue, p.targetRevenue) }));
  const best = out.reduce<number | null>((m, r) => (r.revenuePct !== null && (m === null || r.revenuePct > m) ? r.revenuePct : m), null);
  return { rows: out, bestRevenuePct: best };
}
