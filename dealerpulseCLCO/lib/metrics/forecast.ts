import { DELIVERED_STAGE } from "../config.ts";
import type { Stage } from "../config.ts";
import type { Lead } from "../types.ts";

export interface LeadConversionBaseline {
  leadCount: number;
  deliveredCount: number;
  /** Delivered leads ÷ all leads in scope (open and lost leads count in the denominator). */
  conversionRatio: number | null;
  averageDealValue: number | null;
  revenue: number;
}

export interface LeadConversionForecast {
  ratio: number;
  deliveries: number;
  revenue: number;
  revenueDelta: number;
}

/** Current lead conversion for a lead cohort, using delivered deal value as the revenue basis. */
export function leadConversionBaseline(leads: Lead[]): LeadConversionBaseline {
  const delivered = leads.filter((lead) => lead.status === DELIVERED_STAGE);
  const revenue = delivered.reduce((sum, lead) => sum + lead.dealValue, 0);
  return {
    leadCount: leads.length,
    deliveredCount: delivered.length,
    conversionRatio: leads.length ? delivered.length / leads.length : null,
    averageDealValue: delivered.length ? revenue / delivered.length : null,
    revenue,
  };
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

/** Current conversion between two funnel stages, plus the delivered revenue it feeds. */
export function stepConversionBaseline(leads: Lead[], from: Stage, to: Stage): StepConversionBaseline {
  const fromCount = leads.filter((lead) => lead.reached[from] !== null).length;
  const toCount = leads.filter((lead) => lead.reached[to] !== null).length;
  const delivered = leads.filter((lead) => lead.status === DELIVERED_STAGE);
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

/** Revenue if the same lead volume converted at `ratio`, holding average delivered deal value constant. */
export function forecastLeadConversion(
  baseline: LeadConversionBaseline,
  ratio: number,
): LeadConversionForecast {
  const clamped = Math.min(1, Math.max(0, ratio));
  const deliveries = baseline.leadCount * clamped;
  const revenue = deliveries * (baseline.averageDealValue ?? 0);
  return { ratio: clamped, deliveries, revenue, revenueDelta: revenue - baseline.revenue };
}
