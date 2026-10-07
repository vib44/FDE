import data from "@/data/dealership_data.json";
import type { Dataset, MetricsInput, Lead, Delivery, DateRange } from "./types";

export const db = data as unknown as Dataset;
export const AS_OF = new Date(
  Math.max(
    ...db.leads.map((lead) => new Date(lead.created_at).getTime()),
    ...db.deliveries.map((delivery) => new Date(delivery.delivery_date).getTime()),
  ),
);

const inRange = (date: string, r: MetricsInput) => {
  const d = new Date(date);
  return d >= r.from && d <= r.to;
};
const scoped = (r: MetricsInput) =>
  db.leads.filter(
    (l) =>
      (!r.branchId || l.branch_id === r.branchId) && inRange(l.created_at, r),
  );
const delivered = (r: MetricsInput) =>
  db.deliveries.filter(
    (d) =>
      inRange(d.delivery_date, r) &&
      db.leads.some(
        (l) =>
          l.id === d.lead_id && (!r.branchId || l.branch_id === r.branchId),
      ),
  );

const startOfMonth = (date: Date) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
const endOfMonth = (date: Date) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 23, 59, 59, 999));
const endOfDay = (date: Date) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999));

export type DashboardPeriod = "all" | "last-six" | "quarter" | "30";

export function getPeriodRange(
  period: DashboardPeriod,
  asOf = AS_OF,
): DateRange {
  const latestMonth = startOfMonth(asOf);
  if (period === "all") {
    const first = new Date(
      Math.min(
        ...db.leads.map((lead) => new Date(lead.created_at).getTime()),
        ...db.deliveries.map((delivery) => new Date(delivery.delivery_date).getTime()),
      ),
    );
    return { from: startOfMonth(first), to: endOfDay(asOf) };
  }
  if (period === "last-six") {
    const from = new Date(Date.UTC(latestMonth.getUTCFullYear(), latestMonth.getUTCMonth() - 5, 1));
    return { from, to: endOfMonth(asOf) };
  }
  if (period === "quarter") {
    const from = new Date(Date.UTC(latestMonth.getUTCFullYear(), latestMonth.getUTCMonth() - 2, 1));
    return { from, to: endOfMonth(asOf) };
  }
  return {
    from: new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate() - 29)),
    to: endOfDay(asOf),
  };
}

export function getMonthlyTrend(r: MetricsInput) {
  const months = new Map<string, { units: number; revenue: number }>();
  const cursor = startOfMonth(r.from);
  const last = startOfMonth(r.to);
  while (cursor <= last) {
    const key = cursor.toISOString().slice(0, 7);
    months.set(key, { units: 0, revenue: 0 });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  delivered(r).forEach((delivery) => {
    const key = delivery.delivery_date.slice(0, 7);
    const month = months.get(key);
    if (month) {
      month.units += 1;
      month.revenue +=
        db.leads.find((lead) => lead.id === delivery.lead_id)?.deal_value ?? 0;
    }
  });
  return [...months.entries()].map(([month, values]) => ({
    name: new Intl.DateTimeFormat("en-IN", {
      month: "short",
      timeZone: "UTC",
    }).format(new Date(`${month}-01T00:00:00Z`)),
    ...values,
  }));
}

export function getDeliveryDistribution(r: MetricsInput) {
  const buckets = [
    { name: "0–15", value: 0 },
    { name: "16–30", value: 0 },
    { name: "31–45", value: 0 },
    { name: "46+", value: 0 },
  ];
  delivered(r).forEach((delivery) => {
    const days = delivery.days_to_deliver;
    if (days <= 15) buckets[0].value++;
    else if (days <= 30) buckets[1].value++;
    else if (days <= 45) buckets[2].value++;
    else buckets[3].value++;
  });
  return buckets;
}

export function getTargetAttainment(r: MetricsInput) {
  const targets = db.targets.filter(
    (target) =>
      (!r.branchId || target.branch_id === r.branchId) &&
      inRange(`${target.month}-01`, r),
  );
  const targetUnits = targets.reduce((sum, target) => sum + target.target_units, 0);
  const targetRevenue = targets.reduce((sum, target) => sum + target.target_revenue, 0);
  const kpis = getOverviewKPIs(r);
  return {
    units: targetUnits ? (kpis.units / targetUnits) * 100 : 0,
    revenue: targetRevenue ? (kpis.revenue / targetRevenue) * 100 : 0,
  };
}

export function getOverviewKPIs(r: MetricsInput) {
  const leads = scoped(r),
    ds = delivered(r),
    winBase = leads.filter((l) => ["delivered", "lost"].includes(l.status));
  return {
    units: ds.length,
    revenue: ds.reduce(
      (s, d) => s + (db.leads.find((l) => l.id === d.lead_id)?.deal_value ?? 0),
      0,
    ),
    winRate: winBase.length
      ? winBase.filter((l) => l.status === "delivered").length / winBase.length
      : 0,
    pipeline: leads
      .filter((l) => !["delivered", "lost"].includes(l.status))
      .reduce((s, l) => s + l.deal_value, 0),
    avgDelivery: ds.length
      ? ds.reduce((s, d) => s + d.days_to_deliver, 0) / ds.length
      : 0,
  };
}
export function getBranchSummaries(r: MetricsInput) {
  const network = getOverviewKPIs(r).winRate;
  return db.branches
    .filter((b) => !r.branchId || b.id === r.branchId)
    .map((b) => {
      const x = { ...r, branchId: b.id },
        k = getOverviewKPIs(x),
        leads = scoped(x),
        stale = getStaleLeads(x).length;
      return {
        ...b,
        leads: leads.length,
        units: k.units,
        revenue: k.revenue,
        winRate: k.winRate,
        pipeline: k.pipeline,
        stale,
        status:
          k.winRate >= network ? "Healthy" : stale > 10 ? "Critical" : "Watch",
      };
    });
}
export function getStaleLeads(r: MetricsInput) {
  return scoped(r).filter(
    (l) =>
      !["delivered", "lost"].includes(l.status) &&
      AS_OF.getTime() - new Date(l.last_activity_at).getTime() >= 7 * 86400000,
  );
}
export function getFunnel(r: MetricsInput) {
  const leads = scoped(r),
    stages = [
      "new",
      "contacted",
      "test_drive",
      "negotiation",
      "order_placed",
      "delivered",
    ] as const;
  return stages.map((stage) => ({
    stage,
    count: leads.filter((l) => l.status_history.some((h) => h.status === stage))
      .length,
  }));
}
export function getLostReasons(r: MetricsInput) {
  const m = new Map<string, { reason: string; count: number; value: number }>();
  scoped(r)
    .filter((l) => l.status === "lost")
    .forEach((l) => {
      const reason = l.lost_reason ?? "Not recorded",
        x = m.get(reason) || { reason, count: 0, value: 0 };
      x.count++;
      x.value += l.deal_value;
      m.set(reason, x);
    });
  return [...m.values()].sort((a, b) => b.value - a.value);
}
export function getNeverContactedLost(r: MetricsInput) {
  return scoped(r)
    .filter(
      (l) =>
        l.status === "lost" &&
        !l.status_history.some((h) => h.status === "contacted"),
    )
    .reduce((m, l) => {
      m.set(l.branch_id, (m.get(l.branch_id) || 0) + 1);
      return m;
    }, new Map<string, number>());
}

export function getNeverContactedLostValue(r: MetricsInput) {
  return scoped(r)
    .filter(
      (l) =>
        l.status === "lost" &&
        !l.status_history.some((h) => h.status === "contacted"),
    )
    .reduce((sum, lead) => sum + lead.deal_value, 0);
}

export function getRepLeaderboard(r: MetricsInput & { branchId: string }) {
  return db.sales_reps
    .filter(
      (rep) => rep.branch_id === r.branchId && rep.role === "sales_officer",
    )
    .map((rep) => {
      const leads = scoped(r).filter((l) => l.assigned_to === rep.id);
      return {
        ...rep,
        leads: leads.length,
        delivered: leads.filter((l) => l.status === "delivered").length,
        revenue: leads
          .filter((l) => l.status === "delivered")
          .reduce((s, l) => s + l.deal_value, 0),
      };
    })
    .sort((a, b) => b.revenue - a.revenue);
}
export function getDeliveryDelays(r: MetricsInput) {
  return delivered(r)
    .map((d) => ({
      ...d,
      branch: db.leads.find((l) => l.id === d.lead_id)?.branch_id,
    }))
    .sort((a, b) => b.days_to_deliver - a.days_to_deliver);
}
export function getSourceWinRates(r: MetricsInput) {
  return [...new Set(scoped(r).map((l) => l.source))].map((source) => {
    const ls = scoped(r).filter((l) => l.source === source),
      won = ls.filter((l) => l.status === "delivered").length;
    return { source, rate: ls.length ? won / ls.length : 0, count: ls.length };
  });
}
export const formatMoney = (n: number) =>
  n >= 10000000
    ? `₹${(n / 10000000).toFixed(1)} cr`
    : n >= 100000
      ? `₹${(n / 100000).toFixed(1)} L`
      : `₹${n.toLocaleString("en-IN")}`;
