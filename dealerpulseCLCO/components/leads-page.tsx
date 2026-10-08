"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { STAGES } from "../lib/config.ts";
import { periodLabel } from "../lib/period.ts";
import { filterLeads } from "../lib/metrics/filters.ts";
import type { FilterState, Lead } from "../lib/types.ts";
import { EMPTY_FILTERS } from "../lib/types.ts";
import { formatCurrency } from "../lib/format.ts";
import { useDataset } from "./dataset-provider.tsx";
import { PageContainer, PageHeader } from "./shared-ui.tsx";

const dateFormat = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
const sortFields = ["lastContact", "created", "dealValue", "customer", "representative"] as const;
type SortField = (typeof sortFields)[number];
type SortDirection = "asc" | "desc";

function dayStart(value: string | null): number | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function compareLeads(a: Lead, b: Lead, field: SortField): number {
  switch (field) {
    case "lastContact": return a.lastActivityAt - b.lastActivityAt;
    case "created": return a.createdAt - b.createdAt;
    case "dealValue": return a.dealValue - b.dealValue;
    case "customer": return a.customerName.localeCompare(b.customerName);
    case "representative": return a.repName.localeCompare(b.repName);
  }
}

function formatDate(timestamp: number): string {
  return dateFormat.format(timestamp);
}

export function LeadsPage() {
  const { dataset } = useDataset();
  const params = useSearchParams();
  const router = useRouter();
  const stageValue = params.get("stage");
  const stage = STAGES.find((item) => item === stageValue);
  const from = dayStart(params.get("from"));
  const toStart = dayStart(params.get("to"));
  const to = toStart === null ? null : toStart + 86_400_000 - 1;
  const branch = params.get("branch") ?? "";
  const statusValue = params.get("status") ?? "";
  const status = dataset.leads.some((lead) => lead.status === statusValue) ? statusValue : "";
  const rep = params.get("rep") ?? "";
  const source = params.get("source") ?? "";
  const model = params.get("model") ?? "";
  const leadIds = useMemo(() => {
    const value = params.get("leadIds");
    return value ? new Set(value.split(",").filter(Boolean)) : null;
  }, [params]);
  const filters = useMemo<FilterState>(() => ({
    ...EMPTY_FILTERS,
    from,
    to,
    branch: branch || null,
    rep: rep || null,
    source: source || null,
    model: model || null,
    timeBasis: params.get("basis") === "event" ? "event" : "created",
  }), [from, to, branch, rep, source, model, params]);
  const period = periodLabel(dataset, filters);
  const sortValue = params.get("sort");
  const sortField = sortFields.find((field) => field === sortValue) ?? "lastContact";
  const sortDirection: SortDirection = params.get("order") === "asc" ? "asc" : "desc";
  const statuses = useMemo(() => [...new Set(dataset.leads.map((lead) => lead.status))].sort(), [dataset.leads]);

  const leads = useMemo(() => {
    const filtered = filterLeads(dataset, filters).filter((lead) => {
      if (leadIds && !leadIds.has(lead.id)) return false;
      if (status && lead.status !== status) return false;
      if (!stage) return true;
      const reachedAt = lead.reached[stage];
      return reachedAt !== null && (filters.timeBasis !== "event" ||
        ((filters.from === null || reachedAt >= filters.from) &&
          (filters.to === null || reachedAt <= filters.to)));
    });
    return filtered.sort((a, b) => {
      const comparison = compareLeads(a, b, sortField);
      return (sortDirection === "asc" ? comparison : -comparison) ||
        a.customerName.localeCompare(b.customerName) || a.id.localeCompare(b.id);
    });
  }, [dataset, filters, leadIds, stage, status, sortField, sortDirection]);

  function updateParam(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.replace(`/leads?${next.toString()}`, { scroll: false });
  }

  const backParams = new URLSearchParams(params.toString());
  for (const key of ["stage", "status", "sort", "order"]) backParams.delete(key);
  const backHref = backParams.size ? `/?${backParams.toString()}` : "/";
  const branchName = branch
    ? dataset.branches.find((item) => item.id === branch)?.name ?? branch
    : null;

  return (
    <PageContainer className="leads-page">
      <PageHeader
        eyebrow="DEALERPULSE · LEAD DETAIL"
        title={stage ? `Leads that reached ${stage.replaceAll("_", " ")}` : "Filtered leads"}
        className="dashboard-header"
        actions={<Link className="insight-link" href={backHref}>← Dashboard</Link>}
      >
        <p className="as-of">
          {leads.length} {leads.length === 1 ? "lead" : "leads"} · {period} ·
          {" "}{branchName ? `Branch: ${branchName}` : "All branches"}
        </p>
      </PageHeader>

      <section className="leads-filter-bar" aria-label="Lead list filters">
        <label>
          <span>Lead status</span>
          <select aria-label="Lead status filter" value={status}
            onChange={(event) => updateParam("status", event.target.value)}>
            <option value="">All statuses</option>
            {statuses.map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}
          </select>
        </label>
        <label>
          <span>Representative</span>
          <select aria-label="Representative filter" value={rep}
            onChange={(event) => updateParam("rep", event.target.value)}>
            <option value="">All representatives</option>
            {dataset.reps.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <label>
          <span>Sort by</span>
          <select aria-label="Sort leads by" value={sortField}
            onChange={(event) => updateParam("sort", event.target.value)}>
            <option value="lastContact">Last contacted</option>
            <option value="created">Created date</option>
            <option value="dealValue">Deal value</option>
            <option value="customer">Customer name</option>
            <option value="representative">Representative</option>
          </select>
        </label>
        <label>
          <span>Sort order</span>
          <select aria-label="Lead sort order" value={sortDirection}
            onChange={(event) => updateParam("order", event.target.value)}>
            <option value="desc">Descending</option>
            <option value="asc">Ascending</option>
          </select>
        </label>
      </section>

      {leads.length ? (
        <div className="leads-table-wrap">
          <table className="leads-table">
            <thead>
              <tr>
                <th scope="col">Customer</th>
                <th scope="col">Branch</th>
                <th scope="col">Representative</th>
                <th scope="col">Source</th>
                <th scope="col">Model</th>
                <th scope="col">Current status</th>
                <th scope="col">Last contacted</th>
                <th scope="col">Deal value</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <tr key={lead.id}>
                  <td data-label="Customer">{lead.customerName}</td>
                  <td data-label="Branch">{lead.branchName}</td>
                  <td data-label="Representative">{lead.repName}</td>
                  <td data-label="Source">{lead.source.replaceAll("_", " ")}</td>
                  <td data-label="Model">{lead.model}</td>
                  <td data-label="Current status">{lead.status.replaceAll("_", " ")}</td>
                  <td data-label="Last contacted">{formatDate(lead.lastActivityAt)}</td>
                  <td data-label="Deal value">{formatCurrency(lead.dealValue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <section className="leads-empty" role="status">
          <span className="empty-state-icon" aria-hidden="true">⌕</span>
          <h2>No leads in this view</h2>
          <p>No lead records match this stage and filter combination. Try adjusting the lead filters.</p>
          <Link className="empty-state-link" href="/">Browse all leads</Link>
        </section>
      )}
    </PageContainer>
  );
}
