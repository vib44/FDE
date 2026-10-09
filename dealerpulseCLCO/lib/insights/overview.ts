import { OVERVIEW_INSIGHTS } from "../config.ts";
import type { Dataset, FilterState } from "../types.ts";
import { buildAlerts } from "./alerts.ts";
import { buildGoodNews } from "./good-news.ts";
import { rankAlerts } from "./rank.ts";
import { buildStrategicInsights } from "./strategic.ts";
import type { GoodNewsItem, RankedItem, StrategicInsight } from "./types.ts";

export interface OverviewInsights {
  keyInsight: StrategicInsight | null;
  todo: RankedItem[];
  watch: StrategicInsight[];
  working: GoodNewsItem[];
}

const lookup = (map: Readonly<Record<string, string>>, key: string) => map[key];

/** Composes the Overview's bottom blocks so that each fact appears in exactly one of them. */
export function overviewInsights(ds: Dataset, filters: FilterState): OverviewInsights {
  const cfg = OVERVIEW_INSIGHTS;
  const todo = rankAlerts(buildAlerts(ds, filters));
  const strategic = buildStrategicInsights(ds, filters);

  const alertSubjects = new Set(
    todo.flatMap((item) => item.alerts.map((alert) => lookup(cfg.alertSubject, alert.kind) ?? alert.kind)),
  );
  const hidden = new Set<string>(cfg.hiddenInsightKinds);
  const watch = strategic.filter((insight) =>
    !hidden.has(insight.kind) && !alertSubjects.has(lookup(cfg.insightSubject, insight.kind) ?? insight.kind));

  const shown = new Set<string>(cfg.shownSubjects);
  const working = buildGoodNews(ds, filters).filter((item) => {
    const subject = lookup(cfg.workingSubject, item.id);
    return !subject || !shown.has(subject);
  });

  return {
    keyInsight: strategic.find((insight) => insight.kind === "lead_volume") ?? null,
    todo,
    watch,
    working,
  };
}

/** Every insight id the Overview shows; used to prove nothing is repeated. */
export function overviewInsightIds(overview: OverviewInsights): string[] {
  return [
    ...(overview.keyInsight ? [overview.keyInsight.id] : []),
    ...overview.todo.flatMap((item) => item.alerts.map((alert) => alert.id)),
    ...overview.watch.map((insight) => insight.id),
    ...overview.working.map((item) => item.id),
  ];
}
