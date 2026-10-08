import type { Stage } from "./config.ts";

export interface Branch { id: string; name: string; city: string }
export interface Rep { id: string; name: string; branchId: string; role: string }
export interface Target { branchId: string; month: string; units: number; revenue: number }
export interface Delivery {
  leadId: string; orderAt: number; deliveredAt: number;
  daysToDeliver: number; delayReason: string | null;
}
export interface StatusEvent { status: string; ts: number; note: string }
export interface Lead {
  id: string; customerName: string; source: string; model: string; status: string;
  repId: string; repName: string; branchId: string; branchName: string;
  createdAt: number; lastActivityAt: number; expectedCloseAt: number | null;
  dealValue: number; lostReason: string | null;
  history: StatusEvent[];
  /** first timestamp each stage was reached (from history), null if never */
  reached: Record<Stage, number | null>;
  /** last non-lost status in history (meaningful for lost leads) */
  lostStage: string | null;
  hasLostEvent: boolean;
  delivery: Delivery | null;
}
export interface Dataset {
  asOf: number;
  branches: Branch[]; reps: Rep[]; targets: Target[]; leads: Lead[];
  branchById: Record<string, Branch>; repById: Record<string, Rep>;
  leadById: Record<string, Lead>;
  sources: string[]; models: string[]; months: string[];
}
export type TimeBasis = "created" | "event";
export interface FilterState {
  from: number | null; to: number | null; // ms, inclusive
  branch: string | null; rep: string | null; source: string | null; model: string | null;
  timeBasis: TimeBasis;
}
export const EMPTY_FILTERS: FilterState = {
  from: null, to: null, branch: null, rep: null, source: null, model: null, timeBasis: "created",
};
export interface Insight {
  id: string; severity: "high" | "medium" | "low"; headline: string; evidence: string;
  owner: string; rupeeImpact: number; action: string; leadIds: string[];
}
export type OverviewStatus = "good" | "watch" | "risk" | "neutral";
export type OverviewFormat = "currency" | "number" | "percent" | "days";
export interface OverviewKPI {
  id: "revenue" | "deliveries" | "orders" | "winRate" | "pipelineValue" | "deliveryDays" | "attainment";
  label: string;
  value: number | null;
  previousValue: number | null;
  delta: number | null;
  deltaPct: number | null;
  format: OverviewFormat;
  trend: (number | null)[];
  status: OverviewStatus;
  note: string;
}
export interface OverviewVM {
  kpis: OverviewKPI[];
  verdict: {
    status: OverviewStatus;
    title: string;
    summary: string;
  };
}
export interface ChartViewModel<T> {
  title: string;
  takeaway: string;
  data: T[];
}
export interface TargetActualPoint {
  branchId: string;
  branchName: string;
  actual: number;
  target: number;
  attainment: number | null;
}
export type TargetActualVM = ChartViewModel<TargetActualPoint>;
export interface ScorecardMetric {
  key: "leadVolume" | "winRate" | "orderAttainment" | "onTimeDelivery";
  label: string;
}
export interface ScorecardPoint {
  branchId: string;
  branchName: string;
  leadCount: number;
  values: (number | null)[];
}
export interface BranchScorecardVM extends ChartViewModel<ScorecardPoint> {
  metrics: ScorecardMetric[];
  summary: ScorecardPoint;
}
export interface FunnelPoint {
  stage: string;
  count: number;
  conversion: number | null;
}
export type FunnelVM = ChartViewModel<FunnelPoint>;
export interface MonthlyLeadFlowPoint {
  month: string;
  count: number;
}
export type MonthlyLeadFlowVM = ChartViewModel<MonthlyLeadFlowPoint>;
export interface OrderAgingPoint {
  branchId: string;
  branchName: string;
  under7: number;
  days7to14: number;
  days15to30: number;
  over30: number;
}
export type OrderAgingVM = ChartViewModel<OrderAgingPoint>;
export interface DelayReasonPoint {
  reason: string;
  count: number;
  cumulativePct: number;
}
export type DelayParetoVM = ChartViewModel<DelayReasonPoint>;
export interface SourceQualityPoint {
  source: string;
  leads: number;
  winRate: number | null;
  medianResponseHours: number | null;
  revenue: number;
}
export type SourceQualityVM = ChartViewModel<SourceQualityPoint>;
