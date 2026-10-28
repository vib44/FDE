import { DELIVERED_STAGE } from "../config.ts";
import type { Stage } from "../config.ts";
import type { Lead } from "../types.ts";

export interface LeadConversionForecast {
  ratio: number;
  deliveries: number;
  revenue: number;
  revenueDelta: number;
}

export interface StepConversionBaseline {
  fromCount: number;
  toCount: number;
  /** Leads that reached `to` ÷ leads that reached `from`; null when nobody reached `from`. */
  stepRatio: number | null;
  deliveredCount: number;
  averageDealValue: number | null;
  revenue: number;
}

/** Current conversion from a stage into `to`, plus the delivered revenue of leads that reached `from`. */
export function stepConversionBaseline(leads: Lead[], from: Stage, to: Stage): StepConversionBaseline {
  const cohort = leads.filter((lead) => lead.reached[from] !== null);
  const fromCount = cohort.length;
  const toCount = cohort.filter((lead) => lead.reached[to] !== null).length;
  const delivered = cohort.filter((lead) => lead.status === DELIVERED_STAGE);
  const revenue = delivered.reduce((sum, lead) => sum + lead.dealValue, 0);
  return {
    fromCount,
    toCount,
    stepRatio: fromCount ? toCount / fromCount : null,
    deliveredCount: delivered.length,
    averageDealValue: delivered.length ? revenue / delivered.length : null,
    revenue,
  };
}

/**
 * Revenue if this step converted at `ratio`, with every other step and the average
 * deal value unchanged. Deliveries scale in proportion to the step ratio.
 */
export function forecastStepConversion(
  baseline: StepConversionBaseline & { stepRatio: number; averageDealValue: number },
  ratio: number,
): LeadConversionForecast & { toCount: number } {
  const clamped = Math.min(1, Math.max(0, ratio));
  const factor = clamped / baseline.stepRatio;
  const deliveries = baseline.deliveredCount * factor;
  const revenue = deliveries * baseline.averageDealValue;
  return { ratio: clamped, deliveries, revenue, revenueDelta: revenue - baseline.revenue, toCount: baseline.fromCount * clamped };
}
