import type { BranchAlertData } from "../../../lib/metrics/branch-alert-data.ts";
import { localPriorityAlerts } from "../../../lib/metrics/local-alerts.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isBranchAlertData(value: unknown): value is BranchAlertData {
  if (!isRecord(value)) return false;
  const numericFields = [
    "leadCount", "openPipelineCount", "openPipelineValue", "stalePreOrderCount",
    "stalePreOrderValue", "awaitingDeliveryCount", "awaitingDeliveryValue",
    "overdueLeadCount", "overdueLeadValue", "deliveredCount", "lostCount",
    "deliveredRevenue", "revenueTarget",
  ];
  return typeof value.branchId === "string" && value.branchId.length > 0 && value.branchId.length <= 200 &&
    typeof value.branchName === "string" && value.branchName.length > 0 && value.branchName.length <= 200 &&
    typeof value.city === "string" && value.city.length <= 200 &&
    numericFields.every((field) =>
      typeof value[field] === "number" && Number.isFinite(value[field]) && value[field] >= 0) &&
    (value.revenueAttainment === null ||
      (typeof value.revenueAttainment === "number" && Number.isFinite(value.revenueAttainment)));
}

function isBranchAlertDataArray(value: unknown): value is BranchAlertData[] {
  return Array.isArray(value) && value.every(isBranchAlertData);
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  if (!isRecord(body) || !isBranchAlertDataArray(body.branches) ||
      body.branches.length === 0 || body.branches.length > 500 ||
      new Set(body.branches.map((branch) => branch.branchId)).size !== body.branches.length ||
      typeof body.instruction !== "string" || body.instruction.trim().length === 0 ||
      body.instruction.length > 1000) {
    return Response.json(
      { error: "Request must include valid branch data and a leadership-action instruction." },
      { status: 400 },
    );
  }

  const alerts = localPriorityAlerts(body.branches);
  return Response.json({ alerts });
}
