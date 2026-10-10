"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { STAGES } from "../lib/config.ts";
import { buildHref, selectPageParams } from "../lib/navigation.ts";
import { periodLabel } from "../lib/period.ts";
import { filterLeads } from "../lib/metrics/filters.ts";
import type { FilterState, Lead } from "../lib/types.ts";
import { EMPTY_FILTERS } from "../lib/types.ts";
import { expectedValue, winProbability } from "../lib/metrics/win-probability.ts";
import { formatCurrency, formatPercent, formatSourceName } from "../lib/format.ts";
import { useDataset } from "./dataset-provider.tsx";
import { CompactMultiSelect, PageContainer, PageHeader } from "./shared-ui.tsx";

const dateFormat = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
const sortFields = ["expectedValue", "lastContact", "created", "dealValue", "customer", "representative"] as const;
type SortField = (typeof sortFields)[number];
type SortDirection = "asc" | "desc";

function dayStart(value: string | null): number | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function compareLeads(a: Lead, b: Lead, field: SortField, leads: Lead[]): number {
  switch (field) {
    case "expectedValue":
      return (expectedValue(a, leads) ?? -1) - (expectedValue(b, leads) ?? -1);
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
  const selectedSources = useMemo(() => {
    const available = new Set(dataset.sources);
    return (params.get("leadSources") ?? "").split(",").filter((item) => available.has(item));
  }, [dataset.sources, params]);
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
  const probabilityPool = useMemo(
    () => filterLeads(dataset, { ...filters, source: null }),
    [dataset, filters],
  );
  const period = periodLabel(dataset, filters);
  const sortValue = params.get("sort");
  const sortField = sortFields.find((field) => field === sortValue) ?? "expectedValue";
  const sortDirection: SortDirection = params.get("order") === "asc" ? "asc" : "desc";
  const statuses = useMemo(() => [...new Set(dataset.leads.map((lead) => lead.status))].sort(), [dataset.leads]);

  const leads = useMemo(() => {
    const filtered = filterLeads(dataset, filters).filter((lead) => {
      if (leadIds && !leadIds.has(lead.id)) return false;
      if (status && lead.status !== status) return false;
      if (selectedSources.length && !selectedSources.includes(lead.source)) return false;
      if (!stage) return true;
      const reachedAt = lead.reached[stage];
      return reachedAt !== null && (filters.timeBasis !== "event" ||
        ((filters.from === null || reachedAt >= filters.from) &&
          (filters.to === null || reachedAt <= filters.to)));
    });
    return filtered.sort((a, b) => {
      const comparison = compareLeads(a, b, sortField, probabilityPool);
      return (sortDirection === "asc" ? comparison : -comparison) ||
        a.customerName.localeCompare(b.customerName) || a.id.localeCompare(b.id);
    });
  }, [dataset, filters, leadIds, stage, status, selectedSources, sortField, sortDirection, probabilityPool]);

  function updateParam(key: string, value: string) {
    const next = selectPageParams("leads", params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.replace(`/leads?${next.toString()}`, { scroll: false });
  }

  function updateSources(values: string[]) {
    updateParam("leadSources", values.join(","));
  }

  const activeLocalFilters = [
    stage && { key: "stage", label: `Stage: ${stage.replaceAll("_", " ")}` },
    status && { key: "status", label: `Status: ${status.replaceAll("_", " ")}` },
    rep && { key: "rep", label: `Rep: ${dataset.reps.find((item) => item.id === rep)?.name ?? rep}` },
    ...selectedSources.map((item) => ({ key: "leadSources", value: item, label: `Source: ${formatSourceName(item)}` })),
    leadIds && { key: "leadIds", label: `Selected leads: ${leadIds.size}` },
    params.has("sort") && { key: "sort", label: `Sort: ${sortField.replaceAll(/([A-Z])/g, " $1").toLowerCase()}` },
    params.has("order") && { key: "order", label: `Order: ${sortDirection === "asc" ? "Ascending" : "Descending"}` },
  ].filter((item): item is { key: string; label: string; value?: string } => Boolean(item));
  const backHref = buildHref("/", params.toString());

  function clearLocalFilters() {
    const next = selectPageParams("leads", params.toString());
    for (const key of ["rep", "stage", "status", "leadIds", "leadSources", "sort", "order"]) next.delete(key);
    router.replace(next.size ? `/leads?${next.toString()}` : "/leads", { scroll: false });
  }
  const branchName = branch
    ? dataset.branches.find((item) => item.id === branch)?.name ?? branch
    : null;

  return (
    <PageContainer className="leads-page">
      <PageHeader
        eyebrow="DEALERPULSE · LEAD DETAIL"
        title={stage ? `Leads that reached ${stage.replaceAll("_", " ")}` : "Filtered leads"}
        tagline="Every lead, one clear next step."
        className="dashboard-header"
        actions={<Link className="insight-link" href={backHref}>← Dashboard</Link>}
      >
        <p className="as-of">
          {leads.length} {leads.length === 1 ? "lead" : "leads"} · {period} ·
          {" "}{branchName ? `Branch: ${branchName}` : "All branches"}
        </p>
      </PageHeader>

      <section className="leads-filter-bar" aria-label="Lead list filters">
        <CompactMultiSelect
          label="Source"
          options={dataset.sources.map((item) => ({ value: item, label: formatSourceName(item) }))}
          selected={selectedSources}
          onChange={updateSources}
        />
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
            <option value="expectedValue">Expected value</option>
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
      {activeLocalFilters.length > 0 && (
        <section className="filter-chips leads-active-filters" aria-label="Active lead filters">
          {activeLocalFilters.map((filter) => (
            <button
              key={`${filter.key}:${filter.value ?? ""}`}
              type="button"
              onClick={() => filter.key === "leadSources" && filter.value
                ? updateSources(selectedSources.filter((item) => item !== filter.value))
                : updateParam(filter.key, "")}
              aria-label={`Remove ${filter.label} filter`}
            >
              <span>{filter.label}</span><span aria-hidden="true">×</span>
            </button>
          ))}
          <button type="button" onClick={clearLocalFilters}>Clear all</button>
        </section>
      )}

      {leads.length ? (
        <div className="leads-table-wrap">
          <table className="leads-table">
            <thead>
              <tr>
                <th scope="col">Customer</th>
                <th scope="col">Stage</th>
                <th scope="col" className="is-numeric">Deal value</th>
                <th scope="col" title="Probability of delivery among closed leads that reached the current stage. The tooltip on each value identifies whether the rate used source-specific or stage-only data.">Chance to buy</th>
                <th scope="col" className="is-numeric">Expected value</th>
                <th scope="col">Branch</th>
                <th scope="col">Representative</th>
                <th scope="col">Source</th>
                <th scope="col">Model</th>
                <th scope="col">Last contacted</th>
                <th
                  scope="col"
                  className="leads-date-heading"
                  title="Expected close date from the supplied dealership data. An open lead is overdue when this date is before the dataset as-of date."
                >
                  Expected close date
                </th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => {
                const currentStage = STAGES.includes(lead.status as (typeof STAGES)[number])
                  ? lead.status as (typeof STAGES)[number]
                  : [...STAGES].reverse().find((item) => item !== "delivered" && lead.reached[item] !== null)
                    ?? "new";
                const chance = winProbability(probabilityPool, currentStage, lead.source);
                const value = expectedValue(lead, probabilityPool);
                return (
                <tr key={lead.id}>
                  <td data-label="Customer">{lead.customerName}</td>
                  <td data-label="Stage">{lead.status.replaceAll("_", " ")}</td>
                  <td data-label="Deal value" className="is-numeric">{formatCurrency(lead.dealValue)}</td>
                  <td data-label="Chance to buy" title={`${chance.basis}; based on closed leads reaching ${currentStage.replaceAll("_", " ")}.`}>
                    {chance.probability === null ? "—" : formatPercent(chance.probability)}
                  </td>
                  <td data-label="Expected value" className="is-numeric">
                    {value === null ? "—" : formatCurrency(value)}
                  </td>
                  <td data-label="Branch"><Link href={buildHref("/targets", params.toString(), { branch: lead.branchId })}>{lead.branchName}</Link></td>
                  <td data-label="Representative"><Link href={buildHref("/leads", params.toString(), { rep: lead.repId })}>{lead.repName}</Link></td>
                  <td data-label="Source">{formatSourceName(lead.source)}</td>
                  <td data-label="Model">{lead.model}</td>
                  <td data-label="Last contacted">
                    <span className="tag lead-date-tag">{formatDate(lead.lastActivityAt)}</span>
                  </td>
                  <td data-label="Expected close date">
                    {lead.expectedCloseAt === null
                      ? "—"
                      : <span className="tag lead-date-tag">{formatDate(lead.expectedCloseAt)}</span>}
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <section className="leads-empty" role="status">
          <span className="empty-state-icon" aria-hidden="true">⌕</span>
          <h2>No leads in this view</h2>
          <p>No lead records match this stage and filter combination. Try adjusting the lead filters.</p>
          <Link className="empty-state-link" href={buildHref("/leads", params.toString(), { stage: null, status: null, rep: null, leadIds: null, leadSources: null })}>Browse all leads</Link>
        </section>
      )}
    </PageContainer>
  );
}
