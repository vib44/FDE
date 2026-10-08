/** The only place for business constants: stage order/colors and thresholds.
 *  Entities (branches, reps, sources, models, reasons, months) are derived from data. */
export const STAGES = ["new", "contacted", "test_drive", "negotiation", "order_placed", "delivered"] as const;
export type Stage = (typeof STAGES)[number];
export const LOST = "lost" as const;
/** Open pre-order stages (leads here can "go cold"). */
export const PRE_ORDER_STAGES: readonly Stage[] = ["new", "contacted", "test_drive", "negotiation"];
export const ORDER_STAGE: Stage = "order_placed";
export const DELIVERED_STAGE: Stage = "delivered";
export const FIRST_RESPONSE_STAGE: Stage = "contacted";

export const THRESHOLDS = {
  coldLeadDays: 14,           // pre-order lead idle longer than this is "cold"
  staleOrderDays: 30,         // order with no activity this long is "stale"
  anomalyZ: 2.0,              // robust z-score cut-off
  lowAttainmentPct: 0.5,      // branch below this share of target is flagged
  recalibrationPct: 0.35,     // best branch below this => "targets may need recalibration"
  slowResponseHours: 24,      // first-response benchmark line
  minLeadsForOutlier: 10,
} as const;

export const DELIVERY_AGE_BUCKETS = [
  { label: "0–6 days", upperDays: 7, inclusive: false },
  { label: "7–14 days", upperDays: 15, inclusive: false },
  { label: "15–30 days", upperDays: 30, inclusive: true },
  { label: "Over 30 days", upperDays: null, inclusive: false },
] as const;
