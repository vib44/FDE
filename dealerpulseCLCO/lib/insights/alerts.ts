import {
  DELIVERED_STAGE,
  EFFORT_BY_ACTION,
  EFFORT_LEVELS,
  INSIGHT_CONFIG,
  INSIGHT_TEXT,
  LOST,
  ORDER_STAGE,
  RATE_GAP_STEPS,
  THRESHOLDS,
} from "../config.ts";
import type { ActionKey, Stage } from "../config.ts";
import { formatCurrency, formatPercent, formatSourceName } from "../format.ts";
import { awaitingOrders, medianDaysToDeliver, overdueOpen } from "../metrics/delivery.ts";
import { filterLeads } from "../metrics/filters.ts";
import { lostAtStage, openAtStage, timeToNextStage, winRateFromStage } from "../metrics/stage-progression.ts";
import { DAY, median } from "../metrics/stats.ts";
import { attainment } from "../metrics/targets.ts";
import { winProbability } from "../metrics/win-probability.ts";
import type { Dataset, FilterState, Lead } from "../types.ts";
import { fillTemplate, plural } from "./template.ts";
import type { Alert, AlertClient, AlertKind } from "./types.ts";

interface Context {
  ds: Dataset;
  filters: FilterState;
  /** Leads inside the global filters. */
  scope: Lead[];
  /** Same filters but across all branches, for peer comparisons. */
  peerScope: Lead[];
  /** Leads used for win probabilities: filters apply except branch, rep and source. */
  pool: Lead[];
  chance: (lead: Lead) => number | null;
}

interface ClientCandidate {
  id: string;
  leads: Lead[];
  build: (leads: Lead[]) => Alert | null;
}

const effortOf = (action: ActionKey) => EFFORT_BY_ACTION[action];
const effortWord = (effort: Alert["effort"]) => EFFORT_LEVELS[effort].label.toLowerCase();
const stageWord = (value: string) => value.replaceAll("_", " ");
const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
const distinct = (values: string[]) => [...new Set(values)];

function makeContext(ds: Dataset, filters: FilterState): Context {
  const pool = filterLeads(ds, { ...filters, branch: null, rep: null, source: null });
  const cache = new Map<string, number | null>();
  return {
    ds,
    filters,
    scope: filterLeads(ds, filters),
    peerScope: filterLeads(ds, { ...filters, branch: null }),
    pool,
    chance: (lead) => {
      const key = `${lead.status}|${lead.source}`;
      if (!cache.has(key)) cache.set(key, winProbability(pool, lead.status as Stage, lead.source).probability);
      return cache.get(key) ?? null;
    },
  };
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const group = groups.get(key(item)) ?? [];
    group.push(item);
    groups.set(key(item), group);
  }
  return groups;
}

function toClient(ctx: Context, lead: Lead, detail: string): AlertClient {
  const probability = ctx.chance(lead);
  return {
    leadId: lead.id,
    customerName: lead.customerName,
    stage: lead.status,
    source: lead.source,
    dealValue: lead.dealValue,
    probability,
    impact: lead.dealValue * (probability ?? 0),
    detail,
  };
}

function clientAlert(ctx: Context, input: {
  id: string;
  kind: AlertKind;
  ownerType: "rep" | "branch";
  owner: string;
  filters: Alert["filters"];
  leads: Lead[];
  detail: (lead: Lead) => string;
  effort: Alert["effort"];
  texts: { headline: string; summary: string; action: string };
  vars?: Record<string, string | number>;
  secondary?: (leads: Lead[]) => string | null;
}): Alert | null {
  const clients = input.leads
    .map((lead) => toClient(ctx, lead, input.detail(lead)))
    .sort((a, b) => b.impact - a.impact || a.customerName.localeCompare(b.customerName));
  const impact = sum(clients.map((client) => client.impact));
  if (!clients.length || impact <= 0) return null;
  const value = sum(clients.map((client) => client.dealValue));
  const n = clients.length;
  const vars = {
    n,
    owner: input.owner,
    value: formatCurrency(value),
    leads: plural(n, "lead"),
    clients: plural(n, "customer"),
    deals: plural(n, "deal"),
    orders: plural(n, "order"),
    ...input.vars,
  };
  return {
    id: input.id,
    kind: input.kind,
    owner: input.owner,
    ownerType: input.ownerType,
    headline: fillTemplate(input.texts.headline, vars),
    summary: fillTemplate(input.texts.summary, vars),
    action: fillTemplate(input.texts.action, vars),
    secondary: input.secondary?.(input.leads) ?? null,
    effort: input.effort,
    impact,
    clients,
    leadIds: clients.map((client) => client.leadId),
    claimsLeads: true,
    why: fillTemplate(INSIGHT_TEXT.clientWhy, {
      value: formatCurrency(value),
      p: formatPercent(value > 0 ? impact / value : 0, 0),
      stages: distinct(clients.map((client) => stageWord(client.stage))).join(", "),
      sources: distinct(clients.map((client) => formatSourceName(client.source))).join(", "),
      effort: effortWord(input.effort),
    }),
    filters: input.filters,
  };
}

function repCandidates(
  ctx: Context,
  leads: Lead[],
  idPrefix: string,
  make: (leads: Lead[], repName: string, repId: string, branchId: string) => Alert | null,
): ClientCandidate[] {
  return [...groupBy(leads, (lead) => lead.repId)].map(([repId, group]) => ({
    id: `${idPrefix}-${repId}`,
    leads: group,
    build: (remaining) => {
      const first = remaining[0];
      return first ? make(remaining, first.repName, repId, first.branchId) : null;
    },
  }));
}

function firstContact(ctx: Context): ClientCandidate[] {
  const text = INSIGHT_TEXT.firstContact;
  return repCandidates(ctx, ctx.scope.filter((lead) => lead.status === "new"), "first-contact",
    (leads, owner, repId, branchId) => clientAlert(ctx, {
      id: `first-contact-${repId}`,
      kind: "first_contact",
      ownerType: "rep",
      owner,
      filters: { rep: repId, branch: branchId },
      leads,
      detail: (lead) => `Waiting ${Math.floor((ctx.ds.asOf - lead.createdAt) / DAY)} days`,
      effort: effortOf("contactNewLeads"),
      texts: text,
      vars: { days: Math.floor(Math.max(...leads.map((lead) => (ctx.ds.asOf - lead.createdAt) / DAY))) },
    }));
}

function overdue(ctx: Context): ClientCandidate[] {
  const text = INSIGHT_TEXT.overdue;
  return repCandidates(ctx, overdueOpen(ctx.scope, ctx.ds.asOf), "overdue",
    (leads, owner, repId, branchId) => {
      if (leads.length < INSIGHT_CONFIG.minOverdueLeadsPerRep) return null;
      const reassign = leads.length >= INSIGHT_CONFIG.reassignOverdueAt;
      return clientAlert(ctx, {
        id: `overdue-${repId}`,
        kind: "overdue_leads",
        ownerType: "rep",
        owner,
        filters: { rep: repId, branch: branchId },
        leads,
        detail: (lead) => `${stageWord(lead.status)}, ${Math.floor((ctx.ds.asOf - (lead.expectedCloseAt ?? ctx.ds.asOf)) / DAY)} days overdue`,
        effort: effortOf(reassign ? "reassignLeads" : "chaseOverdueLeads"),
        texts: { headline: text.headline, summary: text.summary, action: reassign ? text.reassignAction : text.chaseAction },
      });
    });
}

function testDriveWait(ctx: Context): ClientCandidate[] {
  const typical = timeToNextStage(ctx.pool, "contacted", "test_drive").medianDays;
  if (typical === null) return [];
  const waiting = openAtStage(ctx.scope, "contacted", ctx.ds.asOf).filter((row) => row.daysInStage > typical);
  const days = new Map(waiting.map((row) => [row.lead.id, row.daysInStage]));
  const text = INSIGHT_TEXT.testDriveWait;
  return repCandidates(ctx, waiting.map((row) => row.lead), "test-drive-wait",
    (leads, owner, repId, branchId) => clientAlert(ctx, {
      id: `test-drive-wait-${repId}`,
      kind: "test_drive_wait",
      ownerType: "rep",
      owner,
      filters: { rep: repId, branch: branchId },
      leads,
      detail: (lead) => `Waiting ${Math.floor(days.get(lead.id) ?? 0)} days since first contact`,
      effort: effortOf("bookTestDrives"),
      texts: text,
      vars: { typical: Math.max(1, Math.round(typical)) },
    }));
}

function stalledNegotiations(ctx: Context): ClientCandidate[] {
  const typical = timeToNextStage(ctx.pool, "negotiation", "order_placed").medianDays ??
    INSIGHT_CONFIG.fallbackNegotiationDays;
  const stalled = openAtStage(ctx.scope, "negotiation", ctx.ds.asOf).filter((row) => row.daysInStage > typical);
  const days = new Map(stalled.map((row) => [row.lead.id, row.daysInStage]));
  const text = INSIGHT_TEXT.stalledNegotiation;
  return repCandidates(ctx, stalled.map((row) => row.lead), "stalled-negotiation",
    (leads, owner, repId, branchId) => clientAlert(ctx, {
      id: `stalled-negotiation-${repId}`,
      kind: "stalled_negotiation",
      ownerType: "rep",
      owner,
      filters: { rep: repId, branch: branchId },
      leads,
      detail: (lead) => `In negotiation ${Math.floor(days.get(lead.id) ?? 0)} days`,
      effort: effortOf("chaseStalledNegotiations"),
      texts: text,
      vars: { typical: Math.max(1, Math.round(typical)) },
    }));
}

function idleOrders(ctx: Context): ClientCandidate[] {
  const idle = awaitingOrders(ctx.scope, ctx.ds.asOf).filter((row) => row.idleDays > INSIGHT_CONFIG.idleOrderDays);
  const idleDays = new Map(idle.map((row) => [row.lead.id, row.idleDays]));
  const branchAttainment = attainment(ctx.ds, ctx.filters, "deliveries").rows;
  const text = INSIGHT_TEXT.idleOrders;
  return [...groupBy(idle.map((row) => row.lead), (lead) => lead.branchId)].map(([branchId, group]) => ({
    id: `idle-orders-${branchId}`,
    leads: group,
    build: (leads) => {
      const first = leads[0];
      if (!first) return null;
      const row = branchAttainment.find((item) => item.branchId === branchId);
      return clientAlert(ctx, {
        id: `idle-orders-${branchId}`,
        kind: "idle_orders",
        ownerType: "branch",
        owner: first.branchName,
        filters: { branch: branchId },
        leads,
        detail: (lead) => `No activity for ${Math.floor(idleDays.get(lead.id) ?? 0)} days`,
        effort: effortOf("chaseIdleOrders"),
        texts: text,
        vars: { days: INSIGHT_CONFIG.idleOrderDays },
        secondary: (items) => {
          if (!row || row.targetRevenue <= 0) return null;
          return fillTemplate(text.attainment, {
            branch: first.branchName,
            from: formatPercent(row.revenue / row.targetRevenue, 0),
            to: formatPercent((row.revenue + sum(items.map((lead) => lead.dealValue))) / row.targetRevenue, 0),
          });
        },
      });
    },
  }));
}

/** Each lead is kept by the highest-impact alert that wants it; the others lose it. */
function dedupe(ctx: Context, candidates: ClientCandidate[]): Alert[] {
  const ranked = candidates
    .map((candidate) => ({
      candidate,
      impact: sum(candidate.leads.map((lead) => lead.dealValue * (ctx.chance(lead) ?? 0))),
    }))
    .sort((a, b) => b.impact - a.impact || a.candidate.id.localeCompare(b.candidate.id));
  const claimed = new Set<string>();
  const alerts: Alert[] = [];
  for (const { candidate } of ranked) {
    const remaining = candidate.leads.filter((lead) => !claimed.has(lead.id));
    if (!remaining.length) continue;
    const alert = candidate.build(remaining);
    if (!alert) continue;
    for (const lead of remaining) claimed.add(lead.id);
    alerts.push(alert);
  }
  return alerts;
}

function topByImpact(alerts: Alert[], limit: number): Alert[] {
  return [...alerts].sort((a, b) => b.impact - a.impact || a.id.localeCompare(b.id)).slice(0, limit);
}

function averageDeliveredValue(leads: Lead[]): number | null {
  const delivered = leads.filter((lead) => lead.status === DELIVERED_STAGE);
  return delivered.length ? sum(delivered.map((lead) => lead.dealValue)) / delivered.length : null;
}

function branchRates(ctx: Context, from: Stage, to: Stage) {
  return ctx.ds.branches.flatMap((branch) => {
    const reached = ctx.peerScope.filter((lead) => lead.branchId === branch.id && lead.reached[from] !== null);
    if (reached.length < THRESHOLDS.minLeadsForOutlier) return [];
    const progressed = reached.filter((lead) => lead.reached[to] !== null).length;
    return [{
      branch,
      denominator: reached.length,
      rate: progressed / reached.length,
      stalled: reached.filter((lead) => lead.reached[to] === null),
    }];
  });
}

function rateGaps(ctx: Context): Alert[] {
  const average = averageDeliveredValue(ctx.peerScope);
  if (average === null) return [];
  const kinds: Record<keyof typeof RATE_GAP_STEPS, AlertKind> = {
    booking: "booking_rate",
    closing: "closing_rate",
    testDriveToOrder: "test_drive_to_order",
  };
  const alerts: Alert[] = [];
  for (const key of Object.keys(RATE_GAP_STEPS) as (keyof typeof RATE_GAP_STEPS)[]) {
    const step = RATE_GAP_STEPS[key];
    const fromRate = winRateFromStage(ctx.peerScope, step.from);
    const toRate = winRateFromStage(ctx.peerScope, step.to);
    if (fromRate === null || toRate === null || toRate - fromRate <= 0) continue;
    const gain = toRate - fromRate;
    const rows = branchRates(ctx, step.from, step.to);
    const found: Alert[] = [];
    for (const row of rows) {
      if (ctx.filters.branch && row.branch.id !== ctx.filters.branch) continue;
      const peers = rows.filter((other) => other.branch.id !== row.branch.id);
      if (peers.length < INSIGHT_CONFIG.minPeerBranches) continue;
      const peerMedian = median(peers.map((other) => other.rate));
      if (peerMedian === null || peerMedian - row.rate < INSIGHT_CONFIG.minRateGap) continue;
      const extra = (peerMedian - row.rate) * row.denominator;
      const effort = effortOf(step.action);
      const text = INSIGHT_TEXT.rateGap[key];
      const vars = {
        owner: row.branch.name,
        rate: formatPercent(row.rate, 0),
        peer: formatPercent(peerMedian, 0),
        extra: Math.max(1, Math.round(extra)),
      };
      found.push({
        id: `${kinds[key]}-${row.branch.id}`,
        kind: kinds[key],
        owner: row.branch.name,
        ownerType: "branch",
        headline: fillTemplate(text.headline, vars),
        summary: fillTemplate(text.summary, vars),
        action: fillTemplate(text.action, vars),
        secondary: null,
        effort,
        impact: extra * gain * average,
        clients: [],
        leadIds: row.stalled.map((lead) => lead.id),
        claimsLeads: false,
        why: fillTemplate(INSIGHT_TEXT.rateGap.why, {
          extra: extra.toFixed(1),
          gain: formatPercent(gain, 0),
          average: formatCurrency(average),
          effort: effortWord(effort),
        }),
        filters: { branch: row.branch.id },
      });
    }
    alerts.push(...topByImpact(found, INSIGHT_CONFIG.maxAlertsPerType));
  }
  return alerts;
}

const matchesAny = (value: string | null, keywords: readonly string[]) => {
  const text = (value ?? "").toLowerCase();
  return keywords.some((keyword) => text.includes(keyword));
};

function financing(ctx: Context): Alert[] {
  const losses = lostAtStage(ctx.scope, "negotiation");
  const topReasons = losses.reasons.slice(0, INSIGHT_CONFIG.topLossReasonRank);
  if (!topReasons.some((row) => matchesAny(row.reason, INSIGHT_CONFIG.financingKeywords))) return [];
  const leads = ctx.scope.filter((lead) => lead.status === LOST && lead.lostStage === "negotiation" &&
    matchesAny(lead.lostReason, INSIGHT_CONFIG.financingKeywords));
  const byBranch = [...groupBy(leads, (lead) => lead.branchId)]
    .sort((a, b) => b[1].length - a[1].length || sum(b[1].map((l) => l.dealValue)) - sum(a[1].map((l) => l.dealValue)) ||
      a[0].localeCompare(b[0]));
  const owner = byBranch[0];
  if (!owner) return [];
  const probability = (lead: Lead) => winProbability(ctx.pool, "negotiation", lead.source).probability ?? 0;
  const impact = sum(leads.map((lead) => lead.dealValue * probability(lead)));
  if (impact <= 0) return [];
  const value = sum(leads.map((lead) => lead.dealValue));
  const text = INSIGHT_TEXT.financing;
  const effort = effortOf("financePartner");
  const ownerBranch = ctx.ds.branchById[owner[0]]?.name ?? owner[0];
  const vars = {
    n: leads.length,
    deals: plural(leads.length, "deal"),
    rank: INSIGHT_CONFIG.topLossReasonRank,
    owner: ownerBranch,
  };
  return [{
    id: "financing-rejections",
    kind: "financing",
    owner: ownerBranch,
    ownerType: "branch",
    headline: fillTemplate(text.headline, vars),
    summary: fillTemplate(text.summary, vars),
    action: fillTemplate(text.action, vars),
    secondary: null,
    effort,
    impact,
    clients: [],
    leadIds: leads.map((lead) => lead.id),
    claimsLeads: false,
    why: fillTemplate(text.why, {
      value: formatCurrency(value),
      p: formatPercent(impact / value, 0),
      effort: effortWord(effort),
    }),
    filters: { branch: owner[0] },
  }];
}

function dissatisfaction(ctx: Context): Alert[] {
  const average = averageDeliveredValue(ctx.peerScope);
  const base = winRateFromStage(ctx.peerScope, "test_drive");
  const next = winRateFromStage(ctx.peerScope, "negotiation");
  if (average === null || base === null || next === null || next - base <= 0) return [];
  const gain = next - base;
  const rows = ctx.ds.branches.flatMap((branch) => {
    const reached = ctx.peerScope.filter((lead) => lead.branchId === branch.id && lead.reached.test_drive !== null);
    if (reached.length < THRESHOLDS.minLeadsForOutlier) return [];
    const unhappy = reached.filter((lead) => lead.status === LOST && lead.lostStage === "test_drive" &&
      matchesAny(lead.lostReason, INSIGHT_CONFIG.dissatisfactionKeywords));
    return [{ branch, denominator: reached.length, unhappy, rate: unhappy.length / reached.length }];
  });
  const found: Alert[] = [];
  for (const row of rows) {
    if (ctx.filters.branch && row.branch.id !== ctx.filters.branch) continue;
    const peers = rows.filter((other) => other.branch.id !== row.branch.id);
    if (peers.length < INSIGHT_CONFIG.minPeerBranches) continue;
    const peerMedian = median(peers.map((other) => other.rate));
    if (peerMedian === null || row.unhappy.length < INSIGHT_CONFIG.minDissatisfiedLosses ||
        row.rate < peerMedian * INSIGHT_CONFIG.dissatisfactionPeerMultiple ||
        row.rate - peerMedian < INSIGHT_CONFIG.minDissatisfactionGap) continue;
    const extra = (row.rate - peerMedian) * row.denominator;
    const effort = effortOf("fixTestDriveExperience");
    const text = INSIGHT_TEXT.dissatisfaction;
    const vars = {
      owner: row.branch.name,
      rate: formatPercent(row.rate, 0),
      peer: formatPercent(peerMedian, 0),
      extra: Math.max(1, Math.round(extra)),
    };
    found.push({
      id: `dissatisfaction-${row.branch.id}`,
      kind: "dissatisfaction",
      owner: row.branch.name,
      ownerType: "branch",
      headline: fillTemplate(text.headline, vars),
      summary: fillTemplate(text.summary, vars),
      action: fillTemplate(text.action, vars),
      secondary: null,
      effort,
      impact: extra * gain * average,
      clients: [],
      leadIds: row.unhappy.map((lead) => lead.id),
      claimsLeads: false,
      why: fillTemplate(INSIGHT_TEXT.rateGap.why, {
        extra: extra.toFixed(1),
        gain: formatPercent(gain, 0),
        average: formatCurrency(average),
        effort: effortWord(effort),
      }),
      filters: { branch: row.branch.id },
    });
  }
  return topByImpact(found, INSIGHT_CONFIG.maxAlertsPerType);
}

function delayCauses(ctx: Context): Alert[] {
  const delivered = ctx.scope.filter((lead) => lead.delivery !== null);
  const onTimeMedian = median(delivered
    .filter((lead) => lead.delivery!.delayReason === null)
    .map((lead) => lead.delivery!.daysToDeliver)) ?? medianDaysToDeliver(delivered) ?? 0;
  const found: Alert[] = [];
  for (const branch of ctx.ds.branches) {
    const branchDelivered = delivered.filter((lead) => lead.branchId === branch.id);
    const controllable = branchDelivered.filter((lead) =>
      matchesAny(lead.delivery!.delayReason, INSIGHT_CONFIG.controllableDelayKeywords));
    const reasons = [...groupBy(controllable, (lead) => lead.delivery!.delayReason!)]
      .filter(([, leads]) => leads.length >= INSIGHT_CONFIG.minDelayedOrdersForCause)
      .map(([reason, leads]) => ({
        reason,
        leads,
        excessDays: sum(leads.map((lead) => Math.max(0, lead.delivery!.daysToDeliver - onTimeMedian))),
      }))
      .sort((a, b) => b.excessDays - a.excessDays || a.reason.localeCompare(b.reason));
    const costliest = reasons[0];
    if (!costliest || costliest.excessDays <= 0) continue;
    const openOrders = ctx.scope.filter((lead) => lead.branchId === branch.id &&
      lead.status === ORDER_STAGE && lead.delivery === null);
    const openValue = sum(openOrders.map((lead) => lead.dealValue));
    const openExpected = sum(openOrders.map((lead) => lead.dealValue * (ctx.chance(lead) ?? 0)));
    const share = costliest.leads.length / branchDelivered.length;
    const impact = openExpected * share;
    if (impact <= 0) continue;
    const text = INSIGHT_TEXT.delayCause;
    const effort = effortOf("fixControllableDelay");
    const vars = {
      owner: branch.name,
      reason: costliest.reason,
      count: costliest.leads.length,
      total: branchDelivered.length,
      days: Math.round(costliest.excessDays),
    };
    found.push({
      id: `delay-cause-${branch.id}`,
      kind: "delay_cause",
      owner: branch.name,
      ownerType: "branch",
      headline: fillTemplate(text.headline, vars),
      summary: fillTemplate(text.summary, vars),
      action: fillTemplate(text.action, vars),
      secondary: null,
      effort,
      impact,
      clients: [],
      leadIds: costliest.leads.map((lead) => lead.id),
      claimsLeads: false,
      why: fillTemplate(text.why, {
        value: formatCurrency(openValue),
        p: formatPercent(openValue > 0 ? openExpected / openValue : 0, 0),
        share: formatPercent(share, 0),
        effort: effortWord(effort),
      }),
      filters: { branch: branch.id },
    });
  }
  return topByImpact(found, INSIGHT_CONFIG.maxAlertsPerType);
}

/** All priority alerts inside the global filters, with impact in recoverable rupees. Unranked. */
export function buildAlerts(ds: Dataset, filters: FilterState): Alert[] {
  const ctx = makeContext(ds, filters);
  const clientAlerts = dedupe(ctx, [
    ...firstContact(ctx),
    ...overdue(ctx),
    ...testDriveWait(ctx),
    ...stalledNegotiations(ctx),
    ...idleOrders(ctx),
  ]);
  const overdueTop = topByImpact(clientAlerts.filter((alert) => alert.kind === "overdue_leads")
    .sort((a, b) => b.clients.length - a.clients.length), Number.POSITIVE_INFINITY)
    .sort((a, b) => b.clients.length - a.clients.length || b.impact - a.impact)
    .slice(0, INSIGHT_CONFIG.maxOverdueReps);
  return [
    ...clientAlerts.filter((alert) => alert.kind !== "overdue_leads"),
    ...overdueTop,
    ...rateGaps(ctx),
    ...financing(ctx),
    ...dissatisfaction(ctx),
    ...delayCauses(ctx),
  ].filter((alert) => alert.impact > 0);
}
