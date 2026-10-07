"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { STAGES } from "../lib/config.ts";
import { filterLeads } from "../lib/metrics/filters.ts";
import { useDataset } from "./dataset-provider.tsx";

const currency = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

function dayStart(value: string | null): number | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function LeadsPage() {
  const { dataset } = useDataset();
  const params = useSearchParams();
  const stageValue = params.get("stage");
  const stage = STAGES.find((item) => item === stageValue);
  const from = dayStart(params.get("from"));
  const toStart = dayStart(params.get("to"));
  const to = toStart === null ? null : toStart + 86_400_000 - 1;
  const filters = useMemo(() => ({
    from,
    to,
    branch: params.get("branch"),
    rep: params.get("rep"),
    source: params.get("source"),
    model: params.get("model"),
    timeBasis: params.get("basis") === "event" ? "event" as const : "created" as const,
  }), [from, to, params]);
  const leads = useMemo(() => {
    const filtered = filterLeads(dataset, filters);
    return stage ? filtered.filter((lead) => {
      const reachedAt = lead.reached[stage];
      return reachedAt !== null && (filters.timeBasis !== "event" ||
        ((filters.from === null || reachedAt >= filters.from) &&
          (filters.to === null || reachedAt <= filters.to)));
    }) : filtered;
  }, [dataset, filters, stage]);

  const backParams = new URLSearchParams(params.toString());
  backParams.delete("stage");
  const backHref = backParams.size ? `/?${backParams.toString()}` : "/";

  return (
    <main className="dashboard leads-page">
      <header className="dashboard-header">
        <div>
          <p className="eyebrow">DEALERPULSE · LEAD DETAIL</p>
          <h1>{stage ? `Leads that reached ${stage.replaceAll("_", " ")}` : "Filtered leads"}</h1>
          <p className="as-of">{leads.length} {leads.length === 1 ? "lead" : "leads"} in this view.</p>
        </div>
        <Link className="insight-link" href={backHref}>← Dashboard</Link>
      </header>
      {leads.length ? (
        <div className="leads-table-wrap">
          <table className="leads-table">
            <thead>
              <tr>
                <th scope="col">Customer</th>
                <th scope="col">Branch</th>
                <th scope="col">Source</th>
                <th scope="col">Model</th>
                <th scope="col">Status</th>
                <th scope="col">Deal value</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <tr key={lead.id}>
                    <td data-label="Customer">{lead.customerName}</td>
                    <td data-label="Branch">{lead.branchName}</td>
                    <td data-label="Source">{lead.source.replaceAll("_", " ")}</td>
                    <td data-label="Model">{lead.model}</td>
                    <td data-label="Status">{lead.status.replaceAll("_", " ")}</td>
                    <td data-label="Deal value">{currency.format(lead.dealValue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <section className="leads-empty" role="status">
          <span className="empty-state-icon" aria-hidden="true">⌕</span>
          <h2>No leads in this view</h2>
          <p>No lead records match this stage and filter combination. Try browsing the full lead list.</p>
          <Link className="empty-state-link" href="/">Browse all leads</Link>
        </section>
      )}
    </main>
  );
}
