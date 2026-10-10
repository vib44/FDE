"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, ChevronDown, ChevronRight, Lightbulb, TriangleAlert } from "lucide-react";
import { EFFORT_LEVELS, INSIGHT_TEXT, OVERVIEW_INSIGHTS } from "../lib/config.ts";
import { buildHref } from "../lib/navigation.ts";
import { formatCurrency, formatNumber, formatPercent, formatSourceName } from "../lib/format.ts";
import { fillTemplate } from "../lib/insights/template.ts";
import { itemCopy } from "../lib/insights/present.ts";
import type { OverviewInsights } from "../lib/insights/overview.ts";
import type { Alert, RankedItem, StrategicInsight } from "../lib/insights/types.ts";
import { Card, CardHeader, PremiumTable, Tag } from "./shared-ui.tsx";

const ui = INSIGHT_TEXT.ui;
const cfg = OVERVIEW_INSIGHTS;

function itemKey(item: RankedItem) {
  return item.alerts.map((alert) => alert.id).join("|");
}

function rowValue(item: RankedItem) {
  return item.equalPriority ? item.alerts[0]!.impact : item.impact;
}

function leadsHref(query: string, alerts: Alert[]) {
  const targetParams: Record<string, string> = {
    leadIds: [...new Set(alerts.flatMap((alert) => alert.leadIds))].join(","),
  };
  const first = alerts[0];
  if (alerts.length === 1 && first) {
    for (const key of ["branch", "rep"] as const) {
      const value = first.filters[key];
      if (value) targetParams[key] = value;
    }
  }
  return buildHref("/leads", query, targetParams);
}

function formatInsightNumber(insight: StrategicInsight) {
  if (insight.numberFormat === "percent") return formatPercent(insight.number, 0);
  if (insight.numberFormat === "currency") return formatCurrency(insight.number);
  return formatNumber(insight.number);
}

function AlertDetail({ alert, query, showOwner }: { alert: Alert; query: string; showOwner: boolean }) {
  return (
    <div className="insight-detail">
      {showOwner && <p className="insight-detail-subhead">{alert.owner}: {alert.headline}</p>}
      {alert.clients.length > 0 && (
        <ul className="insight-clients">
          {alert.clients.map((client) => (
            <li key={client.leadId}>
              <span>{client.customerName}</span>
              <span className="insight-muted">{client.detail} · {formatSourceName(client.source)}</span>
              <strong>{formatCurrency(client.dealValue)}</strong>
            </li>
          ))}
        </ul>
      )}
      <p><strong>{ui.action}:</strong> {alert.action}</p>
      {alert.secondary && <p className="insight-muted">{alert.secondary}</p>}
      <p className="insight-muted"><strong>{ui.whyRank}:</strong> {alert.why}</p>
      <Link className="insight-leads-link" href={leadsHref(query, [alert])}>{ui.viewLeads} →</Link>
    </div>
  );
}

export function KeyInsightCard({ insight, query }: { insight: StrategicInsight; query: string }) {
  const text = cfg.keyInsight;
  const [path, hash] = text.linkHref.split("#");
  return (
    <Card className="overview-key-insight">
      <div className="kpi-topline">
        <span className="card-label">{text.title}</span>
        <TriangleAlert className="key-insight-icon" aria-hidden="true" />
      </div>
     <div className="flex items-baseline gap-2 flex-wrap">
  <strong className="key-insight-value">
    {formatInsightNumber(insight)}  
  </strong>
  <strong className="key-insight-value" style={{color: "var(--text-muted)"}}>Target Revenue </strong>
  <span className="key-insight-label">
     {text.label}
  </span>
</div>
<br></br>
      <p className="key-insight-note">{text.line}</p>
      <Link className="key-insight-link" href={buildHref(`${path}#${hash}`, query)}>{text.link}</Link>
    </Card>
  );
}

export function TodoTable({ items, query }: { items: RankedItem[]; query: string }) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);
  const text = cfg.todo;
  const visible = showAll ? items : items.slice(0, cfg.todoVisibleCount);
  const top = Math.max(...items.map(rowValue), 1);
  const hidden = items.length - cfg.todoVisibleCount;

  function toggle(item: RankedItem) {
    const key = itemKey(item);
    setOpen((current) => {
      const next = new Set(current);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  }

  return (
    <PremiumTable
      className="overview-todo"
      title={text.title}
      takeaway={text.takeaway}
      rows={visible}
      rowKey={itemKey}
      emptyMessage={text.empty}
      expandable={{
        isOpen: (item) => open.has(itemKey(item)),
        onToggle: toggle,
        render: (item) => (
          <>
            {item.alerts.map((alert) => (
              <AlertDetail key={alert.id} alert={alert} query={query} showOwner={item.equalPriority} />
            ))}
          </>
        ),
      }}
      footer={hidden > 0 && (
        <button type="button" className="todo-toggle" onClick={() => setShowAll(!showAll)}>
          {showAll ? INSIGHT_TEXT.collapse : fillTemplate(INSIGHT_TEXT.expandAll, { n: items.length })}
        </button>
      )}
      columns={[
        { label: text.columns.rank, align: "right", render: (item) => formatNumber(item.rank) },
        {
          label: text.columns.owner,
          minWidth: 150,
          render: (item) => {
            const owners = itemCopy(item).owners;
            return (
              <span className="todo-owner-tags">
                {owners.slice(0, cfg.ownerTagsMax).map((owner) => <Tag key={owner}>{owner}</Tag>)}
                {owners.length > cfg.ownerTagsMax && (
                  <Tag title={owners.join(", ")}>+{owners.length - cfg.ownerTagsMax}</Tag>
                )}
              </span>
            );
          },
        },
        {
          label: text.columns.issue,
          minWidth: 260,
          render: (item) => <span className="todo-issue">{itemCopy(item).headline}</span>,
        },
        {
          label: text.columns.recoverable,
          minWidth: 130,
          render: (item) => (
            <span className="todo-recoverable">
              {itemCopy(item).recoverable}
              <span className="todo-recoverable-bar" aria-hidden="true">
                <span style={{ width: `${Math.max(4, (rowValue(item) / top) * 100)}%` }} />
              </span>
            </span>
          ),
        },
        {
          label: text.columns.effort,
          render: (item) => (
            <Tag title={EFFORT_LEVELS[item.effort].horizon}>{EFFORT_LEVELS[item.effort].label}</Tag>
          ),
        },
        {
          label: " ",
          render: (item) => open.has(itemKey(item))
            ? <ChevronDown size={16} aria-label="Collapse" />
            : <ChevronRight size={16} aria-label="Expand" />,
        },
      ]}
    />
  );
}

export function WatchCard({ insights }: { insights: StrategicInsight[] }) {
  return (
    <Card>
      <CardHeader title={cfg.watch.title} takeaway={cfg.watch.takeaway} />
      <ul className="insight-list">
        {insights.map((insight) => (
          <li key={insight.id}>
            <Lightbulb className="icon-watch" aria-hidden="true" />
            <span>{insight.line}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function WorkingCard({ items }: { items: OverviewInsights["working"] }) {
  return (
    <Card>
      <CardHeader title={cfg.working.title} takeaway={cfg.working.takeaway} />
      <ul className="insight-list">
        {items.map((item) => (
          <li key={item.id}>
            <Check className="icon-good" aria-hidden="true" />
            <span>{item.text}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function OverviewInsightBlocks({ overview, query }: { overview: OverviewInsights; query: string }) {
  const { keyInsight, todo, watch, working } = overview;
  if (!keyInsight && !todo.length && !watch.length && !working.length) return null;
  return (
    <section className="overview-insights" aria-label="Insights">
      {(keyInsight || todo.length > 0) && (
        <div className="overview-insights-row">
          {keyInsight && <KeyInsightCard insight={keyInsight} query={query} />}
          {todo.length > 0 && <TodoTable items={todo} query={query} />}
        </div>
      )}
      {(watch.length > 0 || working.length > 0) && (
        <div className="overview-insights-row is-pair">
          {watch.length > 0 && <WatchCard insights={watch} />}
          {working.length > 0 && <WorkingCard items={working} />}
        </div>
      )}
    </section>
  );
}
