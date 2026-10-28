import { EFFORT_BY_ACTION, EFFORT_LEVELS, INSIGHT_CONFIG, THRESHOLDS } from "../../lib/config.ts";
import { buildAlerts } from "../../lib/insights/alerts.ts";
import { rankAlerts, roundImpact } from "../../lib/insights/rank.ts";
import { buildStrategicInsights } from "../../lib/insights/strategic.ts";
import type { AlertKind } from "../../lib/insights/types.ts";
import { formatCurrency } from "../../lib/format.ts";
import type { Ctx } from "./types.ts";

interface AlertDef {
  kind: AlertKind;
  name: string;
  owner: "Rep" | "Branch";
  trigger: string;
  impact: string;
  meaning: string;
}

const DEFS: AlertDef[] = [
  { kind: "first_contact", name: "First contact overdue", owner: "Rep", trigger: "A rep has leads still at 'new' (never contacted).", impact: "Sum of each lead's deal value × its chance to buy.", meaning: "Fresh enquiries nobody has called yet; the quickest money to win back." },
  { kind: "overdue_leads", name: "Overdue leads", owner: "Rep", trigger: `A rep has at least ${INSIGHT_CONFIG.minOverdueLeadsPerRep} open leads whose expected close date is before the as-of day; the ${INSIGHT_CONFIG.maxOverdueReps} reps with the most are shown. Effort is quick to chase, or medium (reassign) from ${INSIGHT_CONFIG.reassignOverdueAt} overdue leads.`, impact: "Sum of deal value × chance to buy over the rep's overdue leads.", meaning: "Deals that have slipped past their promised close date and need a push or a new owner." },
  { kind: "test_drive_wait", name: "Test drive not booked", owner: "Rep", trigger: "Contacted leads that have waited longer than the typical (median) contacted → test drive time.", impact: "Sum of deal value × chance to buy over those leads.", meaning: "Customers who were called but never brought in." },
  { kind: "stalled_negotiation", name: "Stalled negotiation", owner: "Rep", trigger: "Leads in negotiation for longer than the typical (median) negotiation → order time (14 days if no history).", impact: "Sum of deal value × chance to buy over those leads.", meaning: "Deals stuck in price talk that need a manager's help to close." },
  { kind: "idle_orders", name: "Idle orders", owner: "Branch", trigger: `Orders placed but not delivered, with no activity for more than ${INSIGHT_CONFIG.idleOrderDays} days.`, impact: "Sum of deal value of those orders (already sold, so chance to buy counts as certain).", meaning: "Sold cars sitting undelivered; delivering them adds revenue immediately." },
  { kind: "booking_rate", name: "Low test-drive booking rate", owner: "Branch", trigger: `Peer-branch median booking rate minus this branch's rate is at least ${INSIGHT_CONFIG.minRateGap * 100} points, with at least ${INSIGHT_CONFIG.minPeerBranches} peer branches and ${THRESHOLDS.minLeadsForOutlier} leads. Top ${INSIGHT_CONFIG.maxAlertsPerType} branches shown.`, impact: "Extra test drives if the branch matched the peer median × the chance those customers buy × average delivered deal value.", meaning: "A branch that converts calls into test drives worse than its peers." },
  { kind: "closing_rate", name: "Low negotiation closing rate", owner: "Branch", trigger: "Same gap rule as above, applied to negotiation → order.", impact: "Extra orders if the branch matched the peer median × chance to buy × average delivered deal value.", meaning: "A branch that loses more negotiations than its peers." },
  { kind: "test_drive_to_order", name: "Weak test drive → order conversion", owner: "Branch", trigger: "Same gap rule as above, applied to test drive → order.", impact: "Extra orders if the branch matched the peer median × chance to buy × average delivered deal value.", meaning: "Customers drive the car but do not buy; a longer-term sales skills issue." },
  { kind: "financing", name: "Financing losses", owner: "Branch", trigger: `Financing is among the top ${INSIGHT_CONFIG.topLossReasonRank} reasons for losing deals at negotiation. Owner is the branch with the most such losses.`, impact: "Sum of deal value × negotiation-stage chance to buy for open negotiations.", meaning: "Customers walking away over loan approval; a finance-partner fix." },
  { kind: "dissatisfaction", name: "Unhappy after test drive", owner: "Branch", trigger: `At least ${INSIGHT_CONFIG.minDissatisfiedLosses} test-drive losses for dissatisfaction, at ${INSIGHT_CONFIG.dissatisfactionPeerMultiple}× the peer median rate or more, and a gap of at least ${INSIGHT_CONFIG.minDissatisfactionGap * 100} points.`, impact: "Value of test-drive-stage open deals the gap puts at risk × chance to buy.", meaning: "A branch's test-drive experience is putting customers off." },
  { kind: "delay_cause", name: "Controllable delivery delay", owner: "Branch", trigger: `A delay reason the branch can control (for example paperwork or stock allocation) appears on at least ${INSIGHT_CONFIG.minDelayedOrdersForCause} delayed orders.`, impact: "Expected value of open orders × that cause's share of deliveries.", meaning: "Delays the dealership could fix itself." },
];

const effortOf = (kind: AlertKind): string => {
  const map: Record<AlertKind, string[]> = {
    first_contact: ["contactNewLeads"], overdue_leads: ["chaseOverdueLeads", "reassignLeads"],
    test_drive_wait: ["bookTestDrives"], stalled_negotiation: ["chaseStalledNegotiations"],
    idle_orders: ["chaseIdleOrders"], booking_rate: ["liftStepRate"], closing_rate: ["liftStepRate"],
    test_drive_to_order: ["fixOverallConversion"], financing: ["financePartner"],
    dissatisfaction: ["fixTestDriveExperience"], delay_cause: ["fixControllableDelay"],
  };
  const actions = map[kind];
  const by = EFFORT_BY_ACTION as Record<string, keyof typeof EFFORT_LEVELS>;
  const levels = [...new Set(actions.map((action) => by[action]!))];
  return levels.join(" / ");
};

export const ALERT_HEADERS = [
  "Alert type", "Home page", "Owner level (branch/rep)", "Trigger condition", "Recoverable impact formula",
  "Effort (quick/medium/long)", "Current count and top example", "What it tells the CEO",
];

export function alertRows({ ds, filters }: Ctx): string[][] {
  const alerts = buildAlerts(ds, filters);
  return DEFS.map((def) => {
    const mine = alerts.filter((alert) => alert.kind === def.kind);
    const top = [...mine].sort((a, b) => b.impact - a.impact)[0];
    const example = top
      ? `${mine.length} shown. Top: ${top.owner} — ${top.headline} (recoverable ${formatCurrency(top.impact)}, ${top.clients.length} customers, effort ${top.effort})`
      : "0 shown right now (trigger not met)";
    return [def.name, "Overview (What to do first)", def.owner === "Rep" ? "Rep" : "Branch", def.trigger, def.impact, effortOf(def.kind), example, def.meaning];
  });
}

export function rankingBlock({ ds, filters }: Ctx): { title: string; lines: string[] } {
  const alerts = buildAlerts(ds, filters);
  const ranked = rankAlerts(alerts);
  const strategic = buildStrategicInsights(ds, filters);
  const step = INSIGHT_CONFIG.impactRoundingStep;
  const first = ranked[0];
  return {
    title: "How alerts are ranked",
    lines: [
      `Rule: each alert's recoverable amount is rounded to the nearest ${formatCurrency(step)} for comparison only. Alerts are sorted by that rounded amount (largest first); ties go to the quicker effort (quick, then medium, then long). Alerts with the same rounded amount and the same effort are shown together as one "equal priority" item. The amount displayed is always the exact one.`,
      `Today: ${alerts.length} alerts form ${ranked.length} ranked items.${first ? ` Rank 1 is worth ${formatCurrency(first.impact)} exact (${formatCurrency(first.roundedImpact)} rounded), effort ${first.effort}, ${first.alerts.length} alert(s). Example: ${formatCurrency(alerts[0] ? roundImpact(alerts[0].impact) : 0)} is the rounded value of the first alert built.` : ""}`,
      `Strategic insights (${strategic.length} today: ${strategic.map((item) => item.kind.replaceAll("_", " ")).join(", ") || "none"}) are not ranked and carry no recoverable amount, because they are company-wide totals (for example all unordered deal value or the gap to target) that no single action can win back. Adding them to a ranked list would double count the deals the alerts already cover.`,
    ],
  };
}
