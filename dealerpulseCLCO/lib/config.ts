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
export const TEST_DRIVE_STAGE: Stage = "test_drive";

export const STAGE_COLORS: Record<Stage, string> = {
  new: "#6b7a99", contacted: "#5b8def", test_drive: "#3fb8c9",
  negotiation: "#e0a53a", order_placed: "#9b7bea", delivered: "#3fb97f",
};

export const THRESHOLDS = {
  coldLeadDays: 14,           // pre-order lead idle longer than this is "cold"
  staleOrderDays: 30,         // order with no activity this long is "stale"
  anomalyZ: 2.0,              // robust z-score cut-off
  lowAttainmentPct: 0.5,      // branch below this share of target is flagged
  recalibrationPct: 0.35,     // best branch below this => "targets may need recalibration"
  slowResponseHours: 24,      // first-response benchmark line
  minLeadsForOutlier: 10,
} as const;
