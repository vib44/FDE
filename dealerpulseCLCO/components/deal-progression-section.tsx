"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CONTROLLABLE_LOSS_REASONS } from "../lib/config.ts";
import type { Stage } from "../lib/config.ts";
import { formatCurrency, formatNumber, formatPercent } from "../lib/format.ts";
import { filterLeads } from "../lib/metrics/filters.ts";
import {
  lostAtStage,
  openAtStage,
  stageConversion,
  timeToNextStage,
  winRateFromStage,
} from "../lib/metrics/stage-progression.ts";
import type { Dataset, FilterState, Lead } from "../lib/types.ts";
import { Card, CardHeader } from "./shared-ui.tsx";

const dayFormat = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

function isInRange(timestamp: number, filters: FilterState): boolean {
  return (filters.from === null || timestamp >= filters.from) &&
    (filters.to === null || timestamp <= filters.to);
}

function stageTimestamp(lead: Lead, stage: Stage): number | null {
  return lead.history.filter((event) => event.status === stage).at(-1)?.ts ?? lead.reached[stage];
}

function closeTimestamp(lead: Lead): number {
  return lead.status === "delivered"
    ? lead.delivery?.deliveredAt ?? lead.lastActivityAt
    : lead.history.filter((event) => event.status === "lost").at(-1)?.ts ?? lead.lastActivityAt;
}

function applyEventRange(leads: Lead[], stage: Stage, filters: FilterState): Lead[] {
  if (filters.timeBasis !== "event" || (filters.from === null && filters.to === null)) return leads;
  return leads.filter((lead) => {
    const timestamp = lead.reached[stage];
    return timestamp !== null && isInRange(timestamp, filters);
  });
}

function formatDays(days: number | null): string {
  return days === null ? "—" : `${formatNumber(days, 1)} days`;
}

function percentagePointDifference(value: number | null): string {
  if (value === null) return "not available";
  return `${formatNumber(Math.abs(value) * 100, 0)} points`;
}

function makeLeadHref(query: string, leadIds: string[]): string {
  const params = new URLSearchParams(query);
  params.set("leadIds", leadIds.join(","));
  return `/leads?${params.toString()}`;
}

function drillHref(query: string, key: "branch" | "rep", id: string, stage: Stage): string {
  const params = new URLSearchParams(query);
  params.delete("stage");
  params.delete("leadIds");
  if (key === "rep") {
    params.set("rep", id);
    return `/funnel?${params.toString()}`;
  }
  params.set("branch", id);
  return stage === "contacted"
    ? `/funnel?${params.toString()}`
    : `/delivery?${params.toString()}`;
}

function WaitingList({
  title,
  stage,
  rows,
  medianDays,
  percentile75Days,
  stageRate,
  rateLabel,
  query,
}: {
  title: string;
  stage: Stage;
  rows: ReturnType<typeof openAtStage>;
  medianDays: number | null;
  percentile75Days: number | null;
  stageRate: number | null;
  rateLabel: string;
  query: string;
}) {
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);

  return (
    <div className="progression-waiting-list">
      <h3>{title}</h3>
      <div className="progression-table-scroll">
        <table className="progression-table">
          <thead>
            <tr>
              <th>Customer</th>
              <th>Rep</th>
              <th>Branch</th>
              <th>Model</th>
              <th className="is-numeric">Deal value</th>
              <th className="is-numeric">Days in stage</th>
              <th>Last contact</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ lead, daysInStage }) => (
              <tr
                key={lead.id}
                className="progression-lead-row"
                tabIndex={0}
                onClick={() => setSelectedLead(lead)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setSelectedLead(lead);
                  }
                }}
              >
                <td><button type="button" className="progression-customer-button" onClick={() => setSelectedLead(lead)}>{lead.customerName}</button></td>
                <td>
                  <Link href={drillHref(query, "rep", lead.repId, stage)} onClick={(event) => event.stopPropagation()}>
                    {lead.repName}
                  </Link>
                </td>
                <td>
                  <Link href={drillHref(query, "branch", lead.branchId, stage)} onClick={(event) => event.stopPropagation()}>
                    {lead.branchName}
                  </Link>
                </td>
                <td>{lead.model}</td>
                <td className="is-numeric">{formatCurrency(lead.dealValue)}</td>
                <td className="is-numeric">
                  {formatNumber(daysInStage, 1)}
                  {percentile75Days !== null && daysInStage > percentile75Days
                    ? <span className="progression-age-chip is-overdue">Overdue</span>
                    : medianDays !== null && daysInStage > medianDays
                      ? <span className="progression-age-chip">Due</span>
                      : null}
                </td>
                <td>{dayFormat.format(lead.lastActivityAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && (
          <p className="progression-empty">
            Nothing waiting at this stage right now · {rateLabel}: {stageRate === null ? "—" : formatPercent(stageRate)}
          </p>
        )}
      </div>
      {selectedLead && (
        <div className="progression-drawer-backdrop" onClick={() => setSelectedLead(null)}>
          <section
            className="progression-history-drawer"
            role="dialog"
            aria-modal="true"
            aria-label={`${selectedLead.customerName} status history`}
            onClick={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <p>Status history</p>
                <h3>{selectedLead.customerName}</h3>
              </div>
              <button type="button" aria-label="Close status history" onClick={() => setSelectedLead(null)}>Close</button>
            </header>
            <ol>
              {selectedLead.history.map((event, index) => (
                <li key={`${event.ts}-${event.status}-${index}`}>
                  <strong>{event.status.replaceAll("_", " ")}</strong>
                  <time dateTime={new Date(event.ts).toISOString()}>{dayFormat.format(event.ts)}</time>
                  {event.note && <p>{event.note}</p>}
                </li>
              ))}
            </ol>
            <Link href={makeLeadHref(query, [selectedLead.id])}>View lead details</Link>
          </section>
        </div>
      )}
      <span className="visually-hidden">Current stage: {stage.replaceAll("_", " ")}</span>
    </div>
  );
}

function LossReasons({
  title,
  rows,
}: {
  title: string;
  rows: ReturnType<typeof lostAtStage>["reasons"];
}) {
  return (
    <div className="progression-losses">
      <h3>{title}</h3>
      {rows.length ? (
        <table className="progression-table progression-loss-table">
          <thead>
            <tr><th>Reason</th><th className="is-numeric">Deals</th><th className="is-numeric">₹ lost</th><th>Action</th></tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.reason}>
                <td>{row.reason}</td>
                <td className="is-numeric">{formatNumber(row.count)}</td>
                <td className="is-numeric">{formatCurrency(row.value)}</td>
                <td>
                  <span className={`progression-control-chip${row.controllable ? " is-controllable" : ""}`}>
                    {row.controllable ? "Controllable" : "Uncategorized"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p className="progression-empty">No lost deals recorded at this stage.</p>}
    </div>
  );
}

function lostBeforeTestDrive(leads: Lead[]) {
  const lost = leads.filter((lead) => lead.status === "lost" &&
    lead.reached.contacted !== null && lead.reached.test_drive === null);
  const groups = new Map<string, { reason: string; count: number; value: number; controllable: boolean }>();
  for (const lead of lost) {
    const reason = lead.lostReason ?? "Uncategorized";
    const normalized = reason.trim().toLowerCase().replaceAll("_", " ");
    const row = groups.get(reason) ?? {
      reason,
      count: 0,
      value: 0,
      controllable: CONTROLLABLE_LOSS_REASONS.includes(
        normalized as (typeof CONTROLLABLE_LOSS_REASONS)[number],
      ),
    };
    row.count += 1;
    row.value += lead.dealValue;
    groups.set(reason, row);
  }
  return [...groups.values()].sort((a, b) => b.count - a.count || b.value - a.value ||
    a.reason.localeCompare(b.reason));
}

export function DealProgressionSection({
  dataset,
  filters,
  query,
}: {
  dataset: Dataset;
  filters: FilterState;
  query: string;
}) {
  const progression = useMemo(() => {
    const leads = filterLeads(dataset, { ...filters, timeBasis: "created" });
    const bookingCohort = applyEventRange(leads, "contacted", filters);
    const closingCohort = applyEventRange(leads, "negotiation", filters);
    const bookingRate = stageConversion(bookingCohort, "contacted", "test_drive");
    const closingRate = stageConversion(closingCohort, "negotiation", "order_placed");
    const bookingTime = timeToNextStage(bookingCohort, "contacted", "test_drive");
    const closingTime = timeToNextStage(closingCohort, "negotiation", "order_placed");
    const closed = filters.timeBasis === "event" && (filters.from !== null || filters.to !== null)
      ? leads.filter((lead) => (lead.status === "delivered" || lead.status === "lost") &&
        isInRange(closeTimestamp(lead), filters))
      : leads;
    const testDriveWin = winRateFromStage(closed, "test_drive");
    const noDriveClosed = closed.filter((lead) => lead.reached.contacted !== null &&
      lead.reached.test_drive === null);
    const noDriveWin = noDriveClosed.length
      ? noDriveClosed.filter((lead) => lead.status === "delivered").length / noDriveClosed.length
      : null;
    const lift = testDriveWin === null || noDriveWin === null ? null : testDriveWin - noDriveWin;

    const bookingOpenRows = openAtStage(leads, "contacted", dataset.asOf)
      .filter(({ lead }) => filters.timeBasis !== "event" || isInRange(
        stageTimestamp(lead, "contacted") ?? lead.lastActivityAt, filters));
    const closingOpenRows = openAtStage(leads, "negotiation", dataset.asOf)
      .filter(({ lead }) => filters.timeBasis !== "event" || isInRange(
        stageTimestamp(lead, "negotiation") ?? lead.lastActivityAt, filters));
    const bookingLost = lostBeforeTestDrive(filters.timeBasis === "event" &&
      (filters.from !== null || filters.to !== null)
      ? leads.filter((lead) => lead.status === "lost" && isInRange(closeTimestamp(lead), filters))
      : leads);
    const negotiationLost = lostAtStage(
      filters.timeBasis === "event" && (filters.from !== null || filters.to !== null)
        ? leads.filter((lead) => lead.status === "lost" && isInRange(closeTimestamp(lead), filters))
        : leads,
      "negotiation",
    );

    return {
      bookingRate,
      closingRate,
      bookingTime,
      closingTime,
      lift,
      bookingOpenRows,
      closingOpenRows,
      bookingLost,
      negotiationLost,
    };
  }, [dataset, filters]);

  const liftText = progression.lift === null
    ? "Customers who test-drive are — points more likely to buy."
    : progression.lift < 0
      ? `Customers who test-drive are ${percentagePointDifference(progression.lift)} less likely to buy.`
      : `Customers who test-drive are ${percentagePointDifference(progression.lift)} more likely to buy.`;
  const bookingSentence = `Booking rate: ${progression.bookingRate === null ? "—" : formatPercent(progression.bookingRate)} · Typical time to book: ${formatDays(progression.bookingTime.medianDays)} · ${liftText}`;
  const negotiationLostValue = progression.negotiationLost.value;
  const closingSentence = `Closing rate: ${progression.closingRate === null ? "—" : formatPercent(progression.closingRate)} · Typical time to close: ${formatDays(progression.closingTime.medianDays)} · ${formatCurrency(negotiationLostValue)} lost at this stage.`;

  return (
    <section className="deal-progression-section" aria-label="Deal progression">
      <div className="deal-progression-grid">
        <Card id="step-contacted-test-drive" className="deal-progression-card">
          <CardHeader title="Step 2 · Contacted → Test drive" takeaway={bookingSentence}>
            <details className="progression-definition">
              <summary>Definitions</summary>
              <p>&quot;Test drive&quot; = booked or done (the data has no separate scheduled date).</p>
            </details>
          </CardHeader>
          <WaitingList
            title="Waiting for a test drive"
            stage="contacted"
            rows={progression.bookingOpenRows}
            medianDays={progression.bookingTime.medianDays}
            percentile75Days={progression.bookingTime.percentile75Days}
            stageRate={progression.bookingRate}
            rateLabel="Booking rate"
            query={query}
          />
          <LossReasons title="Lost before a test drive" rows={progression.bookingLost} />
        </Card>
        <Card id="step-negotiation-order" className="deal-progression-card">
          <CardHeader title="Step 4 · Negotiation → Order" takeaway={closingSentence} />
          <WaitingList
            title="Open negotiations"
            stage="negotiation"
            rows={progression.closingOpenRows}
            medianDays={progression.closingTime.medianDays}
            percentile75Days={progression.closingTime.percentile75Days}
            stageRate={progression.closingRate}
            rateLabel="Closing rate"
            query={query}
          />
          <LossReasons title="Why deals fall through at negotiation" rows={progression.negotiationLost.reasons} />
        </Card>
      </div>
    </section>
  );
}
