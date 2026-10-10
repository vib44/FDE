import type { ActNowInsight } from "../lib/metrics/insights.ts";
import { buildHref } from "../lib/navigation.ts";
import { InsightCard } from "./shared-ui.tsx";

export function InsightStrip({
  insights,
  query,
  emptyMessage,
  title = "Priority alerts",
}: {
  insights: ActNowInsight[];
  query: string;
  emptyMessage: string;
  title?: string;
}) {
  return (
    <section className="section-insight-strip" aria-label="Section insights">
      <h2>{title}</h2>
      {insights.length ? (
        <ul className="section-insight-list">
          {insights.map((insight) => {
            const targetParams: Record<string, string> = { leadIds: insight.leadIds.join(",") };
            for (const key of ["branch", "source", "model"] as const) {
              const value = insight.filters[key];
              if (value) targetParams[key] = value;
            }
            return (
              <InsightCard key={insight.id} insight={insight} href={buildHref("/leads", query, targetParams)} linkLabel="Review leads" />
            );
          })}
        </ul>
      ) : (
        <p>{emptyMessage}</p>
      )}
    </section>
  );
}
