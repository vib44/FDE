import { DELIVERED_STAGE, LOST, ORDER_STAGE, PRE_ORDER_STAGES, THRESHOLDS } from "../config.ts";
import type { Dataset, FilterState } from "../types.ts";
import { awaitingOrders, coldLeads, overdueOpen } from "./delivery.ts";
import { filterLeads } from "./filters.ts";
import { attainment } from "./targets.ts";

export interface BranchAlertData {
  branchId: string;
  branchName: string;
  city: string;
  leadCount: number;
  openPipelineCount: number;
  openPipelineValue: number;
  stalePreOrderCount: number;
  stalePreOrderValue: number;
  awaitingDeliveryCount: number;
  awaitingDeliveryValue: number;
  overdueLeadCount: number;
  overdueLeadValue: number;
  deliveredCount: number;
  lostCount: number;
  deliveredRevenue: number;
  revenueTarget: number;
  revenueAttainment: number | null;
}

const isOpen = (status: string) =>
  (PRE_ORDER_STAGES as readonly string[]).includes(status) || status === ORDER_STAGE;

/** Build privacy-safe, branch-level aggregates for the AI alert service. */
export function branchAlertData(ds: Dataset, filters: FilterState): BranchAlertData[] {
  const scopedFilters = { ...filters, branch: null };
  const revenueTargets = new Map(
    attainment(ds, scopedFilters, "deliveries").rows.map((row) => [row.branchId, row]),
  );

  return ds.branches.map((branch) => {
    const leads = filterLeads(ds, { ...scopedFilters, branch: branch.id });
    const cold = coldLeads(leads, ds.asOf, THRESHOLDS.coldLeadDays);
    const waiting = awaitingOrders(leads, ds.asOf);
    const overdue = overdueOpen(leads, ds.asOf);
    const targets = revenueTargets.get(branch.id);

    return {
      branchId: branch.id,
      branchName: branch.name,
      city: branch.city,
      leadCount: leads.length,
      openPipelineCount: leads.filter((lead) => isOpen(lead.status)).length,
      openPipelineValue: leads.filter((lead) => isOpen(lead.status))
        .reduce((sum, lead) => sum + lead.dealValue, 0),
      stalePreOrderCount: cold.length,
      stalePreOrderValue: cold.reduce((sum, row) => sum + row.value, 0),
      awaitingDeliveryCount: waiting.length,
      awaitingDeliveryValue: waiting.reduce((sum, row) => sum + row.value, 0),
      overdueLeadCount: overdue.length,
      overdueLeadValue: overdue.reduce((sum, lead) => sum + lead.dealValue, 0),
      deliveredCount: leads.filter((lead) => lead.status === DELIVERED_STAGE).length,
      lostCount: leads.filter((lead) => lead.status === LOST).length,
      deliveredRevenue: targets?.revenue ?? 0,
      revenueTarget: targets?.targetRevenue ?? 0,
      revenueAttainment: targets?.revenuePct ?? null,
    };
  });
}
