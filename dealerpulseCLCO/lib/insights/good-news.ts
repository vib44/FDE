import { DELIVERED_STAGE, INSIGHT_CONFIG, INSIGHT_TEXT } from "../config.ts";
import { formatPercent, formatSourceName } from "../format.ts";
import { medianDaysToDeliver } from "../metrics/delivery.ts";
import { filterLeads } from "../metrics/filters.ts";
import { median } from "../metrics/stats.ts";
import { closedWinRate } from "../metrics/funnel.ts";
import type { Dataset, FilterState, Lead } from "../types.ts";
import { fillTemplate } from "./template.ts";
import type { GoodNewsItem } from "./types.ts";

interface Candidate { id: string; text: string; margin: number }

/** Best performer vs the peer median; null unless it strictly beats that median. */
function best<T>(items: T[], value: (item: T) => number, higherIsBetter: boolean): { item: T; v: number; peer: number } | null {
  if (items.length < 2) return null;
  const sign = higherIsBetter ? 1 : -1;
  const sorted = [...items].sort((a, b) => sign * (value(b) - value(a)));
  const top = sorted[0]!;
  const peer = median(items.map(value));
  if (peer === null || sign * (value(top) - peer) <= 0) return null;
  return { item: top, v: value(top), peer };
}

/** Up to a few computed positives that beat the peer median. */
export function buildGoodNews(ds: Dataset, filters: FilterState): GoodNewsItem[] {
  const text = INSIGHT_TEXT.goodNews;
  const peerScope = filterLeads(ds, { ...filters, branch: null });
  const found: Candidate[] = [];

  const delivery = ds.branches.flatMap((branch) => {
    const delivered = peerScope.filter((lead) => lead.branchId === branch.id && lead.delivery !== null);
    const days = delivered.length >= INSIGHT_CONFIG.minGoodNewsSample ? medianDaysToDeliver(delivered) : null;
    return days === null ? [] : [{ branch, days }];
  });
  const fastest = best(delivery, (row) => row.days, false);
  if (fastest) {
    found.push({
      id: "fastest-delivery",
      text: fillTemplate(text.fastestDelivery, {
        owner: fastest.item.branch.name,
        days: Math.round(fastest.v),
        peer: `${Math.round(fastest.peer)} days`,
      }),
      margin: (fastest.peer - fastest.v) / fastest.peer,
    });
  }

  const sources = ds.sources.flatMap((source) => {
    const leads = filterLeads(ds, { ...filters, source });
    const closed = leads.filter((lead: Lead) => lead.status === DELIVERED_STAGE || lead.status === "lost").length;
    const rate = closed >= INSIGHT_CONFIG.minGoodNewsSample ? closedWinRate(leads) : null;
    return rate === null ? [] : [{ source, rate }];
  });
  const source = best(sources, (row) => row.rate, true);
  if (source) {
    found.push({
      id: "best-source",
      text: fillTemplate(text.bestSource, {
        owner: formatSourceName(source.item.source),
        rate: formatPercent(source.v, 0),
        peer: formatPercent(source.peer, 0),
      }),
      margin: source.v - source.peer,
    });
  }

  const closing = ds.branches.flatMap((branch) => {
    const leads = peerScope.filter((lead) => lead.branchId === branch.id);
    const reached = leads.filter((lead) => lead.reached.negotiation !== null);
    if (reached.length < INSIGHT_CONFIG.minGoodNewsSample) return [];
    const rate = reached.filter((lead) => lead.reached.order_placed !== null).length / reached.length;
    return [{ branch, rate }];
  });
  const bestClosing = best(closing, (row) => row.rate, true);
  if (bestClosing) {
    found.push({
      id: "best-closing",
      text: fillTemplate(text.bestClosing, {
        owner: bestClosing.item.branch.name,
        rate: formatPercent(bestClosing.v, 0),
        peer: formatPercent(bestClosing.peer, 0),
      }),
      margin: bestClosing.v - bestClosing.peer,
    });
  }

  return found
    .sort((a, b) => b.margin - a.margin || a.id.localeCompare(b.id))
    .slice(0, INSIGHT_CONFIG.goodNewsMax)
    .map(({ id, text: line }) => ({ id, text: line }));
}
