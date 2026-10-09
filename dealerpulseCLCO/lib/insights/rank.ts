import { EFFORT_LEVELS, INSIGHT_CONFIG } from "../config.ts";
import type { Rankable, RankedItem } from "./types.ts";

/** Round to the ranking step. Used for comparison only; displayed amounts stay exact. */
export function roundImpact(impact: number, step: number = INSIGHT_CONFIG.impactRoundingStep): number {
  return step > 0 ? Math.round(impact / step) * step : impact;
}

/**
 * The one ranking rule for alerts: rounded impact (highest first), then quicker effort.
 * Alerts with the same rounded impact and the same effort are grouped into one equal-priority item.
 */
export function rankAlerts<T extends Rankable>(
  alerts: T[],
  step: number = INSIGHT_CONFIG.impactRoundingStep,
): RankedItem<T>[] {
  const groups = new Map<string, { roundedImpact: number; effort: Rankable["effort"]; alerts: T[] }>();
  for (const alert of alerts) {
    const roundedImpact = roundImpact(alert.impact, step);
    const key = `${roundedImpact}|${alert.effort}`;
    const group = groups.get(key) ?? { roundedImpact, effort: alert.effort, alerts: [] };
    group.alerts.push(alert);
    groups.set(key, group);
  }
  return [...groups.values()]
    .sort((a, b) => b.roundedImpact - a.roundedImpact ||
      EFFORT_LEVELS[a.effort].order - EFFORT_LEVELS[b.effort].order)
    .map((group, index) => {
      const members = [...group.alerts].sort((a, b) => b.impact - a.impact || a.id.localeCompare(b.id));
      return {
        rank: index + 1,
        impact: members.reduce((sum, alert) => sum + alert.impact, 0),
        roundedImpact: group.roundedImpact,
        effort: group.effort,
        alerts: members,
        equalPriority: members.length > 1,
      };
    });
}
