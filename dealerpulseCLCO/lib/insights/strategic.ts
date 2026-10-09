import { INSIGHT_TEXT, PRE_ORDER_STAGES } from "../config.ts";
import { formatCurrency, formatPercent } from "../format.ts";
import { filterLeads } from "../metrics/filters.ts";
import { leadValueCeiling } from "../metrics/lead-value-ceiling.ts";
import { attainment } from "../metrics/targets.ts";
import type { Dataset, FilterState } from "../types.ts";
import { fillTemplate, plural } from "./template.ts";
import type { StrategicInsight } from "./types.ts";

/** Totals no single action can recover. They are shown, never ranked, and never carry a recoverable amount. */
export function buildStrategicInsights(ds: Dataset, filters: FilterState): StrategicInsight[] {
  const out: StrategicInsight[] = [];
  const text = INSIGHT_TEXT.strategic;
  const scope = filterLeads(ds, filters);
  const ceiling = leadValueCeiling(ds, filters);

  if (ceiling.ceilingPct !== null && ceiling.ceilingPct < 1) {
    const x = formatPercent(ceiling.ceilingPct, 0);
    out.push({
      id: "lead-volume",
      kind: "lead_volume",
      headline: fillTemplate(text.leadVolume.headline, { x }),
      standfirst: fillTemplate(text.leadVolume.standfirst, { x }),
      line: fillTemplate(text.leadVolume.line, { x }),
      number: ceiling.ceilingPct,
      numberFormat: "percent",
      numberLabel: text.leadVolume.label,
      leadIds: [],
    });
  }

  const rows = attainment(ds, filters, "deliveries").rows;
  const target = rows.reduce((total, row) => total + row.targetRevenue, 0);
  const actual = rows.reduce((total, row) => total + row.revenue, 0);
  if (target > actual) {
    const x = formatPercent(actual / target, 0);
    out.push({
      id: "target-gap",
      kind: "target_gap",
      headline: fillTemplate(text.targetGap.headline, { x }),
      standfirst: null,
      line: fillTemplate(text.targetGap.line, { gap: formatCurrency(target - actual), x }),
      number: target - actual,
      numberFormat: "currency",
      numberLabel: text.targetGap.label,
      leadIds: [],
    });
  }

  const empty = ds.branches
    .filter((branch) => !filters.branch || branch.id === filters.branch)
    .filter((branch) => !scope.some((lead) => lead.branchId === branch.id &&
      (PRE_ORDER_STAGES as readonly string[]).includes(lead.status)));
  if (empty.length) {
    const vars = { n: empty.length, branches: plural(empty.length, "branch"), names: empty.map((b) => b.name).join(", ") };
    out.push({
      id: "no-unordered",
      kind: "no_unordered",
      headline: fillTemplate(text.noUnordered.headline, vars),
      standfirst: null,
      line: fillTemplate(text.noUnordered.line, vars),
      number: empty.length,
      numberFormat: "count",
      numberLabel: fillTemplate(text.noUnordered.label, vars),
      leadIds: [],
    });
  }

  const lostEarly = scope.filter((lead) => lead.status === "lost" && lead.lostStage === "new");
  if (lostEarly.length) {
    const vars = { n: lostEarly.length, value: formatCurrency(lostEarly.reduce((t, l) => t + l.dealValue, 0)) };
    out.push({
      id: "lost-before-contact",
      kind: "lost_before_contact",
      headline: fillTemplate(text.lostBeforeContact.headline, vars),
      standfirst: null,
      line: fillTemplate(text.lostBeforeContact.line, vars),
      number: lostEarly.length,
      numberFormat: "count",
      numberLabel: text.lostBeforeContact.label,
      leadIds: lostEarly.map((lead) => lead.id),
    });
  }
  return out;
}
