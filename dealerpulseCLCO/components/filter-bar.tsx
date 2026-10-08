"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toDay } from "../lib/dates.ts";
import { useDataset } from "./dataset-provider.tsx";

const DAY_MS = 86_400_000;

export function FilterBar() {
  const { dataset } = useDataset();
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const range = params.get("range") ?? (params.has("from") || params.has("to") ? "custom" : "full");
  const branch = params.get("branch") ?? "";
  const source = params.get("source") ?? "";
  const model = params.get("model") ?? "";
  const basis = params.get("basis") === "event" ? "event" : "created";

  function updateParam(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    const query = next.toString();
    router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  function setRange(value: string) {
    const next = new URLSearchParams(params.toString());
    if (value === "custom") {
      next.set("range", "custom");
    } else {
      next.delete("from");
      next.delete("to");
      next.delete("range");
    }
    if (value === "30d" || value === "90d") {
      const days = Number(value.slice(0, -1));
      next.set("from", toDay(dataset.asOf - (days - 1) * DAY_MS));
      next.set("to", toDay(dataset.asOf));
      next.set("range", value);
    } else if (dataset.months.includes(value)) {
      next.set("from", `${value}-01`);
      const nextMonth = new Date(`${value}-01T00:00:00.000Z`);
      nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
      nextMonth.setUTCDate(0);
      next.set("to", toDay(nextMonth.getTime()));
      next.set("range", value);
    }
    const query = next.toString();
    router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  function setCustomDate(key: "from" | "to", value: string) {
    const next = new URLSearchParams(params.toString());
    next.delete("range");
    if (value) next.set(key, value);
    else next.delete(key);
    const query = next.toString();
    router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  function resetFilters() {
    const next = new URLSearchParams();
    const query = next.toString();
    router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  function removeFilter(key: string) {
    const next = new URLSearchParams(params.toString());
    if (key === "date") {
      next.delete("from");
      next.delete("to");
      next.delete("range");
    } else {
      next.delete(key);
    }
    const query = next.toString();
    router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  const chips = [
    (params.has("from") || params.has("to")) && {
      key: "date",
      label: range === "30d" ? "Last 30 days" : range === "90d" ? "Last 90 days" :
        dataset.months.includes(range) ? range : `${params.get("from") ?? "…"} – ${params.get("to") ?? "…"}`,
    },
    branch && { key: "branch", label: dataset.branches.find((item) => item.id === branch)?.name ?? branch },
    source && { key: "source", label: dataset.sources.includes(source) ? source.replaceAll("_", " ") : source },
    model && { key: "model", label: model },
    basis === "event" && { key: "basis", label: "By event date" },
  ].filter((chip): chip is { key: string; label: string } => Boolean(chip));

  return (
    <section className="filter-bar" aria-label="Dashboard filters">
      <label>
        <span>Date range</span>
        <select aria-label="Date range" value={range} onChange={(event) => setRange(event.target.value)}>
          <option value="full">Full period</option>
          <option value="30d">Last 30 days</option>
          <option value="90d">Last 90 days</option>
          {dataset.months.map((month) => <option key={month} value={month}>{month}</option>)}
          <option value="custom">Custom range</option>
        </select>
      </label>
      <label>
        <span>Branch</span>
        <select aria-label="Branch" value={branch} onChange={(event) => updateParam("branch", event.target.value)}>
          <option value="">All branches</option>
          {dataset.branches.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </label>
      <details className="filter-more">
        <summary>More filters</summary>
        <div className="filter-more-popover">
          {range === "custom" && (
            <>
              <label>
                <span>From</span>
                <input type="date" aria-label="From date" value={params.get("from") ?? ""}
                  onChange={(event) => setCustomDate("from", event.target.value)} />
              </label>
              <label>
                <span>To</span>
                <input type="date" aria-label="To date" value={params.get("to") ?? ""}
                  onChange={(event) => setCustomDate("to", event.target.value)} />
              </label>
            </>
          )}
          <label>
            <span>Source</span>
            <select aria-label="Source" value={source} onChange={(event) => updateParam("source", event.target.value)}>
              <option value="">All sources</option>
              {dataset.sources.map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}
            </select>
          </label>
          <label>
            <span>Model</span>
            <select aria-label="Model" value={model} onChange={(event) => updateParam("model", event.target.value)}>
              <option value="">All models</option>
              {dataset.models.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label>
            <span>Time basis</span>
            <select aria-label="Time basis" value={basis} onChange={(event) => updateParam("basis", event.target.value)}>
              <option value="created">By lead created date</option>
              <option value="event">By event date</option>
            </select>
          </label>
        </div>
      </details>
      <button className="reset-button" type="button" onClick={resetFilters}>Reset</button>
      {chips.length > 0 && (
        <div className="filter-chips" aria-label="Active filters">
          {chips.map((chip) => (
            <button key={chip.key} type="button" onClick={() => removeFilter(chip.key)}
              aria-label={`Remove filter: ${chip.label}`}>
              {chip.label} <span aria-hidden="true">×</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
