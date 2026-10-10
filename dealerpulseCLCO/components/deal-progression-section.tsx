"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { ReactNode } from "react";
import { TriangleAlert } from "lucide-react";
import { CONTROLLABLE_LOSS_REASONS } from "../lib/config.ts";
import { buildHref } from "../lib/navigation.ts";
import type { Stage } from "../lib/config.ts";
import { formatCurrency, formatNumber, formatPercent } from "../lib/format.ts";
import { filterLeads } from "../lib/metrics/filters.ts";
import {
  lostAtStage,
  dealProgressionMetrics,
  openAtStage,
  overdueAtStage,
  testDriveLift,
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

function closeTimestamp(lead: Lead): number {
  return lead.status === "delivered"
    ? lead.delivery?.deliveredAt ?? lead.lastActivityAt
    : lead.history.filter((event) => event.status === "lost").at(-1)?.ts ?? lead.lastActivityAt;
}

function formatDays(days: number | null): string {
  return days === null ? "—" : `${formatNumber(days, 1)} days`;
}

function percentagePointDifference(value: number | null): string {
  if (value === null) return "not available";
  return `${formatNumber(Math.abs(value) * 100, 0)} points`;
}

function makeLeadHref(query: string, leadIds: string[]): string {
  return buildHref("/leads", query, { leadIds: leadIds.join(",") });
}

function drillHref(query: string, key: "branch" | "rep", id: string, stage: Stage): string {
  if (key === "rep") return buildHref("/leads", query, { rep: id, stage });
  return buildHref(stage === "contacted" ? "/funnel" : "/delivery", query, { branch: id });
}

function StageKpiCard({
  label,
  value,
  unit,
  labelTooltip,
  children,
}: {
  label: string;
  value: string;
  unit: string;
  labelTooltip: string;
  children: ReactNode;
}) {
  return (
    <Card className="deals-stage-kpi">
      <p className="deals-stage-kpi-label" title={labelTooltip}>{label}</p>
      <div className="deals-stage-kpi-content">
        <div className="deals-stage-kpi-primary">
          <strong>{value}</strong>
          <span>{unit}</span>
        </div>
        <dl className="deals-stage-kpi-rows">{children}</dl>
      </div>
    </Card>
  );
}

function StageKpiRow({
  label,
  tooltip,
  value,
  href,
  overdue = false,
}: {
  label: string;
  tooltip: string;
  value: string;
  href?: string;
  overdue?: boolean;
}) {
  const valueContent = (
    <strong className={overdue ? "is-overdue" : undefined}>
      {overdue && <TriangleAlert className="deals-stage-kpi-warning" aria-hidden="true" />}
      {value}
    </strong>
  );
  return (
    <div className="deals-stage-kpi-row">
      <dt title={tooltip}>{label}</dt>
      <dd>{href ? <Link href={href}>{valueContent}</Link> : valueContent}</dd>
    </div>
  );
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
  const overdueLeadIds = new Set(overdueAtStage(rows, percentile75Days).map(({ lead }) => lead.id));

  return (
    <div className="progression-waiting-list">
      <h3 id={stage === "contacted" ? "step2-waiting-list" : "step4-open-negotiations"}>{title}</h3>
      <div className="progression-table-scroll">
        <table className="progression-table progression-waiting-table">
          <colgroup>
            <col className="progression-col-customer" />
            <col className="progression-col-rep" />
            <col className="progression-col-branch" />
            <col className="progression-col-model" />
            <col className="progression-col-value" />
            <col className="progression-col-days" />
          </colgroup>
          <thead>
            <tr>
              <th scope="col" className="progression-customer-column">Customer</th>
              <th scope="col">Rep</th>
              <th scope="col">Branch</th>
              <th scope="col">Model</th>
              <th className="is-numeric">Deal value</th>
              <th className="is-numeric progression-days-column" title={`Median time: ${formatDays(medianDays)}. 75th percentile: ${formatDays(percentile75Days)}.`}>
                Days waiting
              </th>
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
                <td className="progression-customer-column">
                  <button
                    type="button"
                    className="progression-customer-button progression-truncate"
                    title={lead.customerName}
                    onClick={() => setSelectedLead(lead)}
                  >
                    {lead.customerName}
                  </button>
                </td>
                <td>
                  <Link href={drillHref(query, "rep", lead.repId, stage)} onClick={(event) => event.stopPropagation()}>
                    <span className="progression-truncate" title={lead.repName}>{lead.repName}</span>
                  </Link>
                </td>
                <td>
                  <Link href={drillHref(query, "branch", lead.branchId, stage)} onClick={(event) => event.stopPropagation()}>
                    <span className="progression-truncate" title={lead.branchName}>{lead.branchName}</span>
                  </Link>
                </td>
                <td className="progression-truncate" title={lead.model}>{lead.model}</td>
                <td className="is-numeric">{formatCurrency(lead.dealValue)}</td>
                <td className="is-numeric progression-days-column">
                  {formatNumber(daysInStage, 1)}
                  {overdueLeadIds.has(lead.id)
                    ? <span className="progression-age-chip is-overdue">Overdue</span>
                    : medianDays !== null && daysInStage > medianDays
                      ? <span className="progression-age-chip">Due</span>
                      : null}
                </td>
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
  byBranch,
}: {
  dataset: Dataset;
  filters: FilterState;
  query: string;
  byBranch: ReactNode;
}) {
  const progression = useMemo(() => {
    const leads = filterLeads(dataset, { ...filters, timeBasis: "created" });
    const metrics = dealProgressionMetrics(leads, filters, dataset.asOf);
    const closed = filters.timeBasis === "event" && (filters.from !== null || filters.to !== null)
      ? leads.filter((lead) => (lead.status === "delivered" || lead.status === "lost") &&
        isInRange(closeTimestamp(lead), filters))
      : leads;
    const lift = testDriveLift(closed);
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
      ...metrics,
      lift,
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
  const bookingWaitingValue = progression.bookingOpenRows.reduce((sum, row) => sum + row.lead.dealValue, 0);
  const closingWaitingValue = progression.closingOpenRows.reduce((sum, row) => sum + row.lead.dealValue, 0);
  const bookingOverdueCount = progression.bookingOverdueRows.length;
  const closingOverdueCount = progression.closingOverdueRows.length;
  const bookingHref = buildHref("/deals#step2-waiting-list", query);
  const closingHref = buildHref("/deals#step4-open-negotiations", query);
  const formatWholeDays = (days: number | null) => days === null ? "—" : formatNumber(Math.round(days));
  const formatCrores = (value: number) => `₹${formatNumber(value / 10_000_000, 2)} Cr`;
  const formatLakhs = (value: number) => `₹${formatNumber(value / 100_000, 1)} L`;

  return (
    <section className="deal-progression-section" aria-label="Deal progression">
      <div className="deals-stage-kpi-grid" aria-label="Deal progression summary">
        <StageKpiCard
          label="Orders won"
          value={formatNumber(progression.orderCount)}
          unit="orders"
          labelTooltip="Leads that reached the order-placed stage under the current filters."
        >
          <StageKpiRow label="Total value" tooltip="Combined deal value of leads that reached order placed." value={formatCrores(progression.orderValue)} />
          <StageKpiRow label="Test drive → order" tooltip="Orders divided by the leads that reached test drive." value={progression.testDriveOrderRate === null ? "—" : formatPercent(progression.testDriveOrderRate)} />
          <StageKpiRow label="Typical days to order" tooltip="Whole days from test drive to order for leads that reached both stages." value={formatWholeDays(progression.testDriveOrderTime.medianDays)} />
          <StageKpiRow label="Average order" tooltip="Combined value of orders divided by the number of leads that reached order placed." value={progression.orderCount ? formatLakhs(progression.orderValue / progression.orderCount) : "—"} />
        </StageKpiCard>
        <StageKpiCard
          label="Test drives"
          value={formatNumber(progression.testDriveCount)}
          unit="booked or done"
          labelTooltip="Leads that reached the test-drive stage under the current filters."
        >
          <StageKpiRow label="Booking rate" tooltip="Leads reaching test drive divided by leads reaching contacted." value={progression.bookingRate === null ? "—" : formatPercent(progression.bookingRate)} />
          <StageKpiRow label="Typical days to book" tooltip="Whole days from first contact to test drive for leads that reached both stages." value={formatWholeDays(progression.bookingTime.medianDays)} />
          <StageKpiRow label="Waiting now" tooltip="Count and combined value of leads currently in contacted." value={`${formatNumber(progression.bookingOpenRows.length)} · ${formatCurrency(bookingWaitingValue)}`} href={bookingHref} />
          <StageKpiRow label="Overdue" tooltip="Waiting leads whose time in contacted is longer than most leads take before booking a test drive." value={formatNumber(bookingOverdueCount)} href={bookingHref} overdue={bookingOverdueCount > 0} />
        </StageKpiCard>
        <StageKpiCard
          label="Negotiations"
          value={formatNumber(progression.negotiationCount)}
          unit="reached"
          labelTooltip="Leads that reached the negotiation stage under the current filters."
        >
          <StageKpiRow label="Closing rate" tooltip="Leads reaching order placed divided by leads reaching negotiation." value={progression.closingRate === null ? "—" : formatPercent(progression.closingRate)} />
          <StageKpiRow label="Typical days to close" tooltip="Whole days from negotiation to order for leads that reached both stages." value={formatWholeDays(progression.closingTime.medianDays)} />
          <StageKpiRow label="Open now" tooltip="Count and combined value of leads currently in negotiation." value={`${formatNumber(progression.closingOpenRows.length)} · ${formatCurrency(closingWaitingValue)}`} href={closingHref} />
          <StageKpiRow label="Overdue" tooltip="Open negotiations whose time in negotiation is longer than most leads take before ordering." value={formatNumber(closingOverdueCount)} href={closingHref} overdue={closingOverdueCount > 0} />
        </StageKpiCard>
      </div>
      <div className="deal-progression-grid">
        <Card id="step-contacted-test-drive" className="deal-progression-card">
          <CardHeader title="Step 2 · Contacted → Test drive" takeaway={bookingSentence}>
            <details className="progression-definition">
              <summary title={`Typical time is the median; 75th percentile: ${formatDays(progression.bookingTime.percentile75Days)}.`}>
                Definitions
              </summary>
              <p>
                &quot;Test drive&quot; = booked or done (the data has no separate scheduled date).
                {" "}Typical time uses the median; 75th percentile: {formatDays(progression.bookingTime.percentile75Days)}.
              </p>
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
        <div className="deal-progression-right-column">
          {byBranch}
          <Card id="step-negotiation-order" className="deal-progression-card">
            <CardHeader title="Step 4 · Negotiation → Order" takeaway={closingSentence}>
              <details className="progression-definition">
                <summary title={`Typical time is the median; 75th percentile: ${formatDays(progression.closingTime.percentile75Days)}.`}>
                  Time stats
                </summary>
                <p>Typical time uses the median; 75th percentile: {formatDays(progression.closingTime.percentile75Days)}.</p>
              </details>
            </CardHeader>
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
      </div>
    </section>
  );
}
