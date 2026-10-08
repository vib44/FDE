"use client";

import { useEffect, useMemo, useState } from "react";
import type { BranchAlertData } from "../lib/metrics/branch-alert-data.ts";
import { branchAlertData } from "../lib/metrics/branch-alert-data.ts";
import type { Dataset, FilterState } from "../lib/types.ts";
import { Card } from "./shared-ui.tsx";

interface AiAlert {
  id: string;
  branchId: string;
  branchName: string;
  task: string;
}

type AlertStatuses = Record<string, "done" | "discarded">;

const statusStorageKey = "dealerpulse:ai-alert-status:v1";

function isAiAlert(value: unknown): value is AiAlert {
  return typeof value === "object" && value !== null &&
    "id" in value && typeof value.id === "string" &&
    "branchId" in value && typeof value.branchId === "string" &&
    "branchName" in value && typeof value.branchName === "string" &&
    "task" in value && typeof value.task === "string";
}

function readStatuses(): AlertStatuses {
  const stored = localStorage.getItem(statusStorageKey);
  if (!stored) return {};
  const value: unknown = JSON.parse(stored);
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, "done" | "discarded"] =>
      entry[1] === "done" || entry[1] === "discarded"),
  );
}

export function AiAlertsCard({
  dataset,
  filters,
  period,
}: {
  dataset: Dataset;
  filters: FilterState;
  period: string;
}) {
  const branches = useMemo(() => branchAlertData(dataset, filters), [dataset, filters]);
  const [alerts, setAlerts] = useState<AiAlert[]>([]);
  const [statuses, setStatuses] = useState<AlertStatuses>({});
  const [statusesLoaded, setStatusesLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [retryCount, setRetryCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [storageWarning, setStorageWarning] = useState(false);

  useEffect(() => {
    try {
      setStatuses(readStatuses());
    } catch {
      setStorageWarning(true);
    } finally {
      setStatusesLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!statusesLoaded) return;
    try {
      localStorage.setItem(statusStorageKey, JSON.stringify(statuses));
    } catch {
      setStorageWarning(true);
    }
  }, [statuses, statusesLoaded]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    const instruction = "Identify high-priority risks that require leadership action, explain the business impact, and provide a concrete next action for each alert.";
    fetch("/api/ai-alerts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ branches, instruction }),
      signal: controller.signal,
    })
      .then(async (response) => {
        const body: unknown = await response.json();
        if (!response.ok) {
          const message = typeof body === "object" && body !== null && "error" in body &&
            typeof body.error === "string" ? body.error : `AI alerts request failed (${response.status}).`;
          throw new Error(message);
        }
        if (typeof body !== "object" || body === null || !("alerts" in body) ||
            !Array.isArray(body.alerts) || !body.alerts.every(isAiAlert)) {
          throw new Error("AI alerts service returned an invalid response.");
        }
        setAlerts(body.alerts);
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setError(cause instanceof Error ? cause.message : "AI alerts could not be loaded.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [branches, retryCount]);

  const activeAlerts = useMemo(
    () => alerts.filter((alert) => !statuses[alert.id]),
    [alerts, statuses],
  );

  function updateStatus(alert: AiAlert, status: "done" | "discarded") {
    setStatuses((current) => ({ ...current, [alert.id]: status }));
    setMessage(status === "done" ? `${alert.branchName} alert marked done.` : `${alert.branchName} alert discarded.`);
  }

  function retry() {
    setError(null);
    setLoading(true);
    setRetryCount((value) => value + 1);
  }

  return (
    <Card className="chart-panel ai-alert-panel">
      <div className="ai-alert-heading">
        <div>
          <h3>Priority Alerts</h3>
          <p>High-priority branch risks and actions</p>
          <small className="chart-period">{period}</small>
        </div>
        <span className="ai-alert-count">{activeAlerts.length}</span>
      </div>
      <div className="ai-alert-list" aria-label="High-priority AI alerts" aria-busy={loading}>
        {loading && <p className="ai-alert-state">Reviewing branch data…</p>}
        {!loading && error && (
          <div className="ai-alert-state ai-alert-error" role="alert">
            <p>{error}</p>
            <button type="button" onClick={retry}>Try again</button>
          </div>
        )}
        {!loading && !error && activeAlerts.length === 0 && (
          <p className="ai-alert-state">No active high-priority alerts.</p>
        )}
        {!loading && !error && activeAlerts.map((alert) => (
          <section key={alert.id} className="ai-alert-item">
            <div className="ai-alert-item-heading">
              <span className="ai-alert-branch">{alert.branchName}</span>
              <span className="ai-alert-priority">High priority</span>
            </div>
            <p className="ai-alert-task">{alert.task}</p>
            <div className="ai-alert-actions">
              <button
                type="button"
                className="ai-alert-action ai-alert-discard"
                aria-label={`Discard ${alert.branchName} alert`}
                title="Discard alert"
                onClick={() => updateStatus(alert, "discarded")}
              >
                <span aria-hidden="true">×</span>
              </button>
              <button
                type="button"
                className="ai-alert-action ai-alert-done"
                aria-label={`Mark ${alert.branchName} alert done`}
                title="Mark done"
                onClick={() => updateStatus(alert, "done")}
              >
                <span aria-hidden="true">✓</span>
              </button>
            </div>
          </section>
        ))}
      </div>
      <p className="ai-alert-feedback" aria-live="polite">
        {storageWarning ? "Alert actions may not persist in this browser." : message}
      </p>
    </Card>
  );
}
