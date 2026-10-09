import { DELIVERED_STAGE, HEALTH_KEY_NUMBER, KPI_SUBLINES, LOST, ORDER_STAGE, PRE_ORDER_STAGES } from "../config.ts";
import { formatNumber, formatPercent } from "../format.ts";
import { fillTemplate } from "../insights/template.ts";
import type { Dataset, FilterState } from "../types.ts";
import { medianDaysToDeliver, overdueOpen } from "./delivery.ts";
import { filterLeads } from "./filters.ts";
import { ratio } from "./stats.ts";
import { attainment } from "./targets.ts";

export type HealthArea = "targets" | "funnel" | "delivery" | "deals" | "team";
export type HealthStatus = "good" | "watch" | "act";

export function healthStatus(area: HealthArea, severity: "high" | "medium" | "low" | undefined, overdueLeadCount: number): HealthStatus {
  if (severity === "high") return "act";
  if (severity === "medium") return "watch";
  if ((area === "deals" || area === "team") && overdueLeadCount > 0) return "watch";
  return "good";
}

/** Short computed sublines for the Overview KPI cards; each adds a fact the card value does not show. */
export function kpiSublines(ds: Dataset, filters: FilterState) {
  const leads = filterLeads(ds, filters);
  const unitsRows = attainment(ds, filters, "orders").rows;
  const unitsPct = ratio(
    unitsRows.reduce((sum, row) => sum + row.units, 0),
    unitsRows.reduce((sum, row) => sum + row.targetUnits, 0),
  );
  const closed = leads.filter((lead) => lead.status === DELIVERED_STAGE || lead.status === LOST).length;
  const unordered = leads.filter((lead) => (PRE_ORDER_STAGES as readonly string[]).includes(lead.status)).length;
  const ordered = leads.filter((lead) => lead.status === ORDER_STAGE && lead.delivery === null).length;
  return {
    orders: unitsPct === null ? null : fillTemplate(KPI_SUBLINES.orders, { x: formatPercent(unitsPct, 0) }),
    winRate: fillTemplate(KPI_SUBLINES.winRate, { n: formatNumber(closed) }),
    pipelineValue: fillTemplate(KPI_SUBLINES.unordered, { n: formatNumber(unordered) }),
    awaitingDeliveryValue: fillTemplate(KPI_SUBLINES.ordered, { n: formatNumber(ordered) }),
  };
}

/** One computed key number per health-check area. */
export function healthKeyNumbers(ds: Dataset, filters: FilterState): Record<HealthArea, string> {
  const none = HEALTH_KEY_NUMBER.none;
  const leads = filterLeads(ds, filters);

  const rows = attainment(ds, filters, "deliveries").rows.filter((row) => row.revenuePct !== null);
  const below = rows.filter((row) => row.revenuePct! < 1).length;

  const contacted = leads.filter((lead) => lead.reached.contacted !== null).length;
  const contactedPct = ratio(contacted, leads.length);

  const days = medianDaysToDeliver(leads.filter((lead) => lead.delivery !== null));
  const overdue = overdueOpen(leads, ds.asOf);

  return {
    targets: rows.length
      ? fillTemplate(HEALTH_KEY_NUMBER.targets, { n: below, total: rows.length })
      : none,
    funnel: contactedPct === null ? none : fillTemplate(HEALTH_KEY_NUMBER.funnel, { x: formatPercent(contactedPct, 0) }),
    delivery: days === null ? none : fillTemplate(HEALTH_KEY_NUMBER.delivery, { days: Math.round(days) }),
    deals: fillTemplate(HEALTH_KEY_NUMBER.deals, { n: formatNumber(overdue.length) }),
    team: fillTemplate(HEALTH_KEY_NUMBER.team, { n: new Set(overdue.map((lead) => lead.repId)).size }),
  };
}
