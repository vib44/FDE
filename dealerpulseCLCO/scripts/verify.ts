import { readFileSync } from "node:fs";
import { normalize } from "../lib/data/normalize.ts";
import { closedWinRate, funnel, stageConversion, lostWithoutEvent } from "../lib/metrics/funnel.ts";
import { medianFirstResponse } from "../lib/metrics/response.ts";
import { awaitingOrders, delayStats, overdueOpen } from "../lib/metrics/delivery.ts";
import { attainment } from "../lib/metrics/targets.ts";
import { EMPTY_FILTERS } from "../lib/types.ts";

const ds = normalize(JSON.parse(readFileSync("data/dealership_data.json", "utf8")));
const L = ds.leads, p = (k: string, v: unknown) => console.log(k.padEnd(34), v);
const n = (s: string) => L.filter((l) => l.status === s).length;
p("asOf", new Date(ds.asOf).toISOString());
p("leads/delivered/lost/open", [L.length, n("delivered"), n("lost"), L.length - n("delivered") - n("lost")].join(" / "));
p("delivered revenue", L.filter((l) => l.status === "delivered").reduce((s, l) => s + l.dealValue, 0));
p("orders ever", funnel(L).find((r) => r.stage === "order_placed")!.count);
for (const b of ds.branches) {
  const ls = L.filter((l) => l.branchId === b.id);
  p(b.name, `win ${(closedWinRate(ls)! * 100).toFixed(1)}%  TD->order ${(stageConversion(ls, "test_drive", "order_placed")! * 100).toFixed(0)}%  medFR ${medianFirstResponse(ls)!.toFixed(1)}h  delay ${(delayStats(ls).delayRate! * 100).toFixed(0)}%`);
}
for (const s of ["walk_in", "social_media"]) p("win " + s, (closedWinRate(L.filter((l) => l.source === s))! * 100).toFixed(1) + "%");
const aw = awaitingOrders(L, ds.asOf), d = delayStats(L);
p("awaiting orders / value", `${aw.length} / ${aw.reduce((s, a) => s + a.value, 0)}`);
p("awaiting idle 30d+", aw.filter((a) => a.idleDays >= 30).length);
p("avg delayed / on-time days", `${d.avgDelayedDays!.toFixed(1)} / ${d.avgOnTimeDays!.toFixed(1)}`);
p("lost w/o lost event", lostWithoutEvent(L).length);
p("open past expected close", overdueOpen(L, ds.asOf).length);
const at = attainment(ds, EMPTY_FILTERS, "deliveries");
p("targets units/revenue", `${ds.targets.reduce((s, t) => s + t.units, 0)} / ${ds.targets.reduce((s, t) => s + t.revenue, 0)}`);
p("best branch rev attainment", ((at.bestRevenuePct ?? 0) * 100).toFixed(1) + "%");
