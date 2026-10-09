import type { EffortLevel } from "../config.ts";
import type { FilterState } from "../types.ts";

export type AlertKind =
  | "first_contact"
  | "overdue_leads"
  | "test_drive_wait"
  | "stalled_negotiation"
  | "idle_orders"
  | "booking_rate"
  | "closing_rate"
  | "test_drive_to_order"
  | "financing"
  | "dissatisfaction"
  | "delay_cause";

export interface AlertClient {
  leadId: string;
  customerName: string;
  stage: string;
  source: string;
  dealValue: number;
  probability: number | null;
  impact: number;
  detail: string;
}

export interface Alert {
  id: string;
  kind: AlertKind;
  owner: string;
  ownerType: "rep" | "branch";
  headline: string;
  summary: string;
  action: string;
  /** Optional second line, e.g. what delivering idle orders does to target attainment. */
  secondary: string | null;
  effort: EffortLevel;
  /** Recoverable rupees; the only number used to rank. */
  impact: number;
  clients: AlertClient[];
  leadIds: string[];
  /** Client-level alerts own their clients: a lead is counted in at most one such alert. */
  claimsLeads: boolean;
  why: string;
  filters: Partial<Pick<FilterState, "branch" | "rep">>;
}

export interface Rankable {
  id: string;
  impact: number;
  effort: EffortLevel;
}

export interface RankedItem<T extends Rankable = Alert> {
  rank: number;
  /** Exact sum of the alerts' impact. */
  impact: number;
  /** Impact rounded to the ranking step; this is what was compared. */
  roundedImpact: number;
  effort: EffortLevel;
  alerts: T[];
  equalPriority: boolean;
}

export type StrategicKind = "lead_volume" | "target_gap" | "no_unordered" | "lost_before_contact";

/** Totals no single action can recover. Never ranked and never given a recoverable amount. */
export interface StrategicInsight {
  id: string;
  kind: StrategicKind;
  headline: string;
  standfirst: string | null;
  line: string;
  number: number;
  numberFormat: "percent" | "currency" | "count";
  numberLabel: string;
  leadIds: string[];
}

export interface GoodNewsItem {
  id: string;
  text: string;
}
