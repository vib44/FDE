import {
  DELIVERED_STAGE,
  LOST,
  STAGES,
  THRESHOLDS,
} from "../config.ts";
import type { Stage } from "../config.ts";
import type { Dataset, FilterState, Insight, Lead } from "../types.ts";
import { awaitingOrders, coldLeads, medianDaysToDeliver } from "./delivery.ts";
import { filterLeads } from "./filters.ts";
import { closedWinRate } from "./funnel.ts";
import { attainment } from "./targets.ts";
import { median, robustZ } from "./stats.ts";

export interface ActNowInsight extends Insight {
  impactLabel: string | null;
  filters: Partial<Pick<FilterState, "branch" | "source" | "model">>;
}

const severityRank: Record<Insight["severity"], number> = { high: 3, medium: 2, low: 1 };

function ownerFor(leads: Lead[], fallback: string): string {
  const owners = [...new Set(leads.map((lead) => lead.repName))];
  return owners.length === 1 ? owners[0]! : fallback;
}

function weakStageConversion(ds: Dataset, filters: FilterState): ActNowInsight | null {
  const leads = filterLeads(ds, { ...filters, branch: null });
  const candidates: {
    branchId: string;
    branchName: string;
    from: Stage;
    to: Stage;
    rate: number;
    peerMedian: number;
    z: number;
    denominator: number;
    stalled: Lead[];
  }[] = [];

  for (let stageIndex = 0; stageIndex < STAGES.length - 1; stageIndex += 1) {
    const from = STAGES[stageIndex]!;
    const to = STAGES[stageIndex + 1]!;
    const rates = ds.branches.flatMap((branch) => {
      const reachedFrom = leads.filter((lead) =>
        lead.branchId === branch.id && lead.reached[from] !== null);
      if (reachedFrom.length < THRESHOLDS.minLeadsForOutlier) return [];
      const progressed = reachedFrom.filter((lead) => lead.reached[to] !== null).length;
      return [{
        branchId: branch.id,
        branchName: branch.name,
        from,
        to,
        rate: progressed / reachedFrom.length,
        denominator: reachedFrom.length,
        stalled: reachedFrom.filter((lead) => lead.reached[to] === null),
      }];
    });

    for (const candidate of rates) {
      const peers = rates.filter((row) => row.branchId !== candidate.branchId);
      if (peers.length < 3) continue;
      const peerMedian = median(peers.map((row) => row.rate));
      const z = robustZ(candidate.rate, peers.map((row) => row.rate));
      if (peerMedian === null || z > -THRESHOLDS.anomalyZ) continue;
      candidates.push({ ...candidate, peerMedian, z });
    }
  }

  candidates.sort((a, b) => a.z - b.z || b.stalled.reduce((sum, lead) => sum + lead.dealValue, 0) -
    a.stalled.reduce((sum, lead) => sum + lead.dealValue, 0));
  const selected = candidates[0];
  if (!selected) return null;
  const impact = selected.stalled.reduce((sum, lead) => sum + lead.dealValue, 0);
  return {
    id: `conversion-${selected.branchId}-${selected.from}-${selected.to}`,
    severity: "high",
    headline: `${selected.branchName} converts unusually few ${selected.from.replaceAll("_", " ")} leads to ${selected.to.replaceAll("_", " ")}`,
    evidence: `${Math.round(selected.rate * 100)}% converted (${selected.denominator} leads), versus a ${Math.round(selected.peerMedian * 100)}% peer median.`,
    owner: selected.branchName,
    rupeeImpact: impact,
    impactLabel: "Value in leads not yet advanced",
    action: `Review ${selected.branchName}'s ${selected.from.replaceAll("_", " ")} follow-up and coach the team on moving qualified leads to ${selected.to.replaceAll("_", " ")}.`,
    leadIds: selected.stalled.map((lead) => lead.id),
    filters: { branch: selected.branchId },
  };
}

function weakSourceQuality(ds: Dataset, filters: FilterState): ActNowInsight | null {
  const leads = filterLeads(ds, { ...filters, source: null });
  const closedBySource = ds.sources.flatMap((source) => {
    const closed = leads.filter((lead) =>
      lead.source === source && (lead.status === DELIVERED_STAGE || lead.status === LOST));
    const rate = closedWinRate(closed);
    return closed.length < THRESHOLDS.minLeadsForOutlier || rate === null
      ? []
      : [{ source, closed, rate }];
  });
  const outliers = closedBySource.flatMap((candidate) => {
    const peers = closedBySource.filter((row) => row.source !== candidate.source);
    if (peers.length < 3) return [];
    const peerMedian = median(peers.map((row) => row.rate));
    const z = robustZ(candidate.rate, peers.map((row) => row.rate));
    return peerMedian !== null && z <= -THRESHOLDS.anomalyZ
      ? [{ ...candidate, peerMedian, z }]
      : [];
  }).sort((a, b) => a.z - b.z || b.closed.length - a.closed.length);
  const selected = outliers[0];
  if (!selected) return null;
  const lostValue = selected.closed
    .filter((lead) => lead.status === LOST)
    .reduce((sum, lead) => sum + lead.dealValue, 0);
  return {
    id: `source-quality-${selected.source}`,
    severity: "high",
    headline: `${selected.source.replaceAll("_", " ")} leads are closing well below peer sources`,
    evidence: `${Math.round(selected.rate * 100)}% closed win rate across ${selected.closed.length} closed leads, versus a ${Math.round(selected.peerMedian * 100)}% peer median.`,
    owner: "Marketing",
    rupeeImpact: lostValue,
    impactLabel: "Value in lost deals",
    action: `Review ${selected.source.replaceAll("_", " ")} lead qualification and campaign targeting before increasing spend.`,
    leadIds: selected.closed.map((lead) => lead.id),
    filters: { source: selected.source },
  };
}

/** Build a small, deterministic set of ranked actions from the existing metric layer. */
export function actNowInsights(ds: Dataset, filters: FilterState): ActNowInsight[] {
  const candidates = filterLeads(ds, filters);
  const insights: ActNowInsight[] = [];
  const cold = coldLeads(candidates, ds.asOf, THRESHOLDS.coldLeadDays);
  if (cold.length) {
    const leads = cold.map((row) => row.lead);
    const value = cold.reduce((sum, row) => sum + row.value, 0);
    const oldest = Math.max(...cold.map((row) => row.idleDays));
    insights.push({
      id: "cold-preorder-leads",
      severity: "high",
      headline: `${cold.length} pre-order leads have gone stale`,
      evidence: `${cold.length} leads have been idle for more than ${THRESHOLDS.coldLeadDays} days; the oldest has been idle ${Math.floor(oldest)} days.`,
      owner: ownerFor(leads, "Sales team"),
      rupeeImpact: value,
      impactLabel: "Pipeline value",
      action: "Assign an owner to each lead and make a same-day follow-up attempt.",
      leadIds: leads.map((lead) => lead.id),
      filters: {},
    });
  }

  const typicalDeliveryDays = medianDaysToDeliver(candidates);
  if (typicalDeliveryDays !== null) {
    const waiting = awaitingOrders(candidates, ds.asOf)
      .filter((row) => row.ageDays > typicalDeliveryDays);
    if (waiting.length) {
      const leads = waiting.map((row) => row.lead);
      const value = waiting.reduce((sum, row) => sum + row.value, 0);
      const oldest = Math.max(...waiting.map((row) => row.ageDays));
      insights.push({
        id: "orders-beyond-median-delivery",
        severity: oldest >= THRESHOLDS.staleOrderDays ? "high" : "medium",
        headline: `${waiting.length} orders are waiting longer than the usual delivery time`,
        evidence: `These orders have been open beyond the ${typicalDeliveryDays.toFixed(0)}-day median delivery lead time; the oldest is ${Math.floor(oldest)} days old.`,
        owner: ownerFor(leads, "Sales team"),
        rupeeImpact: value,
        impactLabel: "Value awaiting delivery",
        action: "Confirm vehicle allocation and delivery dates with the branch, then update each customer.",
        leadIds: leads.map((lead) => lead.id),
        filters: {},
      });
    }
  }

  const branchAttainment = attainment(ds, filters, "deliveries");
  const belowTarget = branchAttainment.rows
    .filter((row) => row.revenuePct !== null && row.revenuePct < THRESHOLDS.lowAttainmentPct)
    .sort((a, b) => a.revenuePct! - b.revenuePct!);
  if (belowTarget.length) {
    const examples = belowTarget.slice(0, 3).map((row) => {
      const branch = ds.branchById[row.branchId];
      return `${branch?.name ?? row.branchId} ${Math.round(row.revenuePct! * 100)}%`;
    });
    const gap = belowTarget.reduce((sum, row) => sum + Math.max(0, row.targetRevenue - row.revenue), 0);
    const leads = candidates.filter((lead) => belowTarget.some((row) => row.branchId === lead.branchId));
    const hasSevereGap = belowTarget.some((row) => row.revenuePct! < THRESHOLDS.recalibrationPct);
    const branchFilters = belowTarget.length === 1 ? { branch: belowTarget[0]!.branchId } : {};
    insights.push({
      id: "branches-below-target",
      severity: hasSevereGap ? "high" : "medium",
      headline: `${belowTarget.length} ${belowTarget.length === 1 ? "branch is" : "branches are"} materially below delivery target`,
      evidence: `${examples.join("; ")}${belowTarget.length > examples.length ? `; and ${belowTarget.length - examples.length} more` : ""}.`,
      owner: belowTarget.length === 1 ? (ds.branchById[belowTarget[0]!.branchId]?.name ?? belowTarget[0]!.branchId) : "Branch managers",
      rupeeImpact: gap,
      impactLabel: "Revenue target gap",
      action: "Review this month's delivery pipeline and agree a recovery plan with each flagged branch.",
      leadIds: leads.map((lead) => lead.id),
      filters: branchFilters,
    });
  }

  const conversion = weakStageConversion(ds, filters);
  if (conversion) insights.push(conversion);
  const sourceQuality = weakSourceQuality(ds, filters);
  if (sourceQuality) insights.push(sourceQuality);

  return insights
    .sort((a, b) => severityRank[b.severity] - severityRank[a.severity] ||
      (b.rupeeImpact ?? 0) - (a.rupeeImpact ?? 0) ||
      a.headline.localeCompare(b.headline))
    .slice(0, 5);
}
