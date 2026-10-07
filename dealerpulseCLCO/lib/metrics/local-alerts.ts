import type { BranchAlertData } from "./branch-alert-data.ts";

export interface LocalPriorityAlert {
  id: string;
  branchId: string;
  branchName: string;
  severity: "high" | "medium";
  task: string;
}

interface AlertScore {
  severity: LocalPriorityAlert["severity"];
  impact: number;
  order: number;
  alert: LocalPriorityAlert;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

function makeAlert(
  branch: BranchAlertData,
  id: string,
  severity: LocalPriorityAlert["severity"],
  task: string,
  impact: number,
  order: number,
): AlertScore {
  return {
    severity,
    impact,
    order,
    alert: {
      id,
      branchId: branch.branchId,
      branchName: branch.branchName,
      severity,
      task,
    },
  };
}

/** Build deterministic alerts from branch aggregates without external services. */
export function localPriorityAlerts(branches: BranchAlertData[]): LocalPriorityAlert[] {
  const alerts: AlertScore[] = [];

  for (const branch of branches) {
    if (branch.stalePreOrderCount > 0) {
      alerts.push(makeAlert(
        branch,
        `stale-${branch.branchId}`,
        "high",
        `${branch.stalePreOrderCount} pre-order lead${branch.stalePreOrderCount === 1 ? "" : "s"} have gone stale with ${formatCurrency(branch.stalePreOrderValue)} in pipeline value. Assign an owner and make a same-day follow-up attempt.`,
        branch.stalePreOrderValue,
        0,
      ));
    }

    if (branch.awaitingDeliveryCount > 0) {
      alerts.push(makeAlert(
        branch,
        `delivery-${branch.branchId}`,
        branch.awaitingDeliveryValue > 0 ? "high" : "medium",
        `${branch.awaitingDeliveryCount} order${branch.awaitingDeliveryCount === 1 ? "" : "s"} are awaiting delivery with ${formatCurrency(branch.awaitingDeliveryValue)} in value. Confirm vehicle allocation and delivery dates with the branch.`,
        branch.awaitingDeliveryValue,
        1,
      ));
    }

    if (branch.overdueLeadCount > 0) {
      alerts.push(makeAlert(
        branch,
        `overdue-${branch.branchId}`,
        "high",
        `${branch.overdueLeadCount} open lead${branch.overdueLeadCount === 1 ? "" : "s"} are overdue with ${formatCurrency(branch.overdueLeadValue)} in pipeline value. Escalate the branch's follow-up queue and set a recovery deadline.`,
        branch.overdueLeadValue,
        2,
      ));
    }

    if (branch.lostCount > 0 && branch.revenueTarget > 0 && branch.revenueAttainment !== null) {
      const targetGap = Math.max(0, branch.revenueTarget - branch.deliveredRevenue);
      if (targetGap > 0) {
        alerts.push(makeAlert(
          branch,
          `target-${branch.branchId}`,
          branch.revenueAttainment < 0.5 ? "high" : "medium",
          `${branch.branchName} is at ${Math.round(branch.revenueAttainment * 100)}% of its delivery target. Review the pipeline and agree a recovery plan for the ${formatCurrency(targetGap)} gap.`,
          targetGap,
          3,
        ));
      }
    }
  }

  return alerts
    .sort((a, b) =>
      (b.severity === "high" ? 1 : 0) - (a.severity === "high" ? 1 : 0) ||
      b.impact - a.impact ||
      a.order - b.order ||
      a.alert.branchName.localeCompare(b.alert.branchName),
    )
    .slice(0, 10)
    .map((item) => item.alert);
}
