"use client";

import { useMemo } from "react";
import { THRESHOLDS } from "../lib/config.ts";
import { formatCurrency, formatNumber, formatPercent, formatSourceName } from "../lib/format.ts";
import { sourceQuality } from "../lib/metrics/funnel-charts.ts";
import type { Dataset, FilterState } from "../lib/types.ts";
import { Card, CardHeader } from "./shared-ui.tsx";

export function SourceQualitySection({
  dataset,
  filters,
}: {
  dataset: Dataset;
  filters: FilterState;
}) {
  const view = useMemo(() => {
    const rows = sourceQuality(dataset, filters).data.map((row) => ({
      ...row,
      revenuePerLead: row.leads ? row.revenue / row.leads : 0,
    }));
    const ratedRows = rows.filter(
      (row): row is typeof row & { winRate: number } => row.winRate !== null,
    );
    const totalLeads = rows.reduce((sum, row) => sum + row.leads, 0);
    const totalClosedLeads = rows.reduce((sum, row) => sum + row.closedLeads, 0);
    const totalWins = rows.reduce((sum, row) => sum + row.closedLeads * (row.winRate ?? 0), 0);
    const totalRevenue = rows.reduce((sum, row) => sum + row.revenue, 0);
    const sorted = [...rows].sort((a, b) =>
      b.revenuePerLead - a.revenuePerLead || a.source.localeCompare(b.source));
    const mostLeads = rows.reduce<typeof rows[number] | null>((winner, row) =>
      winner === null || row.leads > winner.leads ? row : winner, null);
    const bestWinRate = ratedRows.reduce<typeof ratedRows[number] | null>((winner, row) =>
      winner === null || row.winRate > winner.winRate ? row : winner, null);
    const weakestHighVolume = ratedRows
      .filter((row) => row.leads >= THRESHOLDS.minLeadsForHighVolumeSource)
      .reduce<typeof ratedRows[number] | null>((weakest, row) =>
        weakest === null || row.winRate < weakest.winRate ? row : weakest, null);
    const maxRevenuePerLead = Math.max(0, ...rows.map((row) => row.revenuePerLead));
    return {
      rows: sorted,
      totalLeads,
      totalClosedLeads,
      totalWins,
      totalRevenue,
      revenuePerLead: totalLeads ? totalRevenue / totalLeads : 0,
      mostLeads,
      bestWinRate,
      weakestHighVolume,
      maxRevenuePerLead,
    };
  }, [dataset, filters]);

  const sentence = [
    view.mostLeads
      ? `${formatSourceName(view.mostLeads.source)} brings the most leads (${formatNumber(view.mostLeads.leads)})`
      : "No lead sources match these filters",
    view.bestWinRate
      ? `${formatSourceName(view.bestWinRate.source)} has the best closed win rate (${formatPercent(view.bestWinRate.winRate)})`
      : "no source has closed leads in this selection",
    view.weakestHighVolume
      ? `${formatSourceName(view.weakestHighVolume.source)} is the weakest high-volume source (${formatPercent(view.weakestHighVolume.winRate)})`
      : `no source has at least ${formatNumber(THRESHOLDS.minLeadsForHighVolumeSource)} leads and a measurable closed win rate`,
  ].join("; ") + ".";

  return (
    <section id="lead-sources" className="source-quality-section" aria-label="Where our leads come from">
      <Card className="source-quality-card">
        <CardHeader title="Where our leads come from" takeaway={sentence} />
        {view.rows.length ? (
          <div className="source-quality-table-scroll">
            <table className="source-quality-table">
              <thead>
                <tr>
                  <th scope="col">Source</th>
                  <th scope="col" className="is-numeric">Leads</th>
                  <th scope="col" className="is-numeric">Share of leads</th>
                  <th scope="col" className="is-numeric">Closed win rate</th>
                  <th scope="col" className="is-numeric">Revenue delivered</th>
                  <th scope="col" className="is-numeric">Revenue per lead</th>
                </tr>
              </thead>
              <tbody>
                {view.rows.map((row) => {
                  const isBest = row.source === view.bestWinRate?.source;
                  const isWeakest = row.source === view.weakestHighVolume?.source;
                  return (
                    <tr key={row.source}>
                      <th
                        scope="row"
                        className={`${isBest ? "is-best-source" : ""}${isWeakest ? " is-weak-source" : ""}`}
                      >
                        {formatSourceName(row.source)}
                      </th>
                      <td className="is-numeric">{formatNumber(row.leads)}</td>
                      <td className="is-numeric">
                        {formatPercent(view.totalLeads ? row.leads / view.totalLeads : 0)}
                      </td>
                      <td className={`is-numeric${isBest ? " is-best-source" : ""}${isWeakest ? " is-weak-source" : ""}`}>
                        {row.winRate === null ? "—" : formatPercent(row.winRate)}
                      </td>
                      <td className="is-numeric">{formatCurrency(row.revenue)}</td>
                      <td className={`is-numeric source-revenue-per-lead${isBest ? " is-best-source" : ""}${isWeakest ? " is-weak-source" : ""}`}>
                        <span className="source-inline-bar" aria-hidden="true">
                          <span style={{
                            width: `${view.maxRevenuePerLead
                              ? row.revenuePerLead / view.maxRevenuePerLead * 100
                              : 0}%`,
                          }} />
                        </span>
                        {formatCurrency(row.revenuePerLead)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row">Total</th>
                  <td className="is-numeric">{formatNumber(view.totalLeads)}</td>
                  <td className="is-numeric">{formatPercent(view.totalLeads ? 1 : 0)}</td>
                  <td className="is-numeric">
                    {view.totalClosedLeads
                      ? formatPercent(view.totalWins / view.totalClosedLeads)
                      : "—"}
                  </td>
                  <td className="is-numeric">{formatCurrency(view.totalRevenue)}</td>
                  <td className="is-numeric">{formatCurrency(view.revenuePerLead)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <p className="source-quality-empty">No lead sources match these filters.</p>
        )}
        <p className="source-quality-footnote">
          Marketing spend per source is not in the data, so cost per sale cannot be calculated.
        </p>
      </Card>
    </section>
  );
}
