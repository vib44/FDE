import type { Dataset, FilterState } from "./types.ts";

const monthFormatter = new Intl.DateTimeFormat("en-IN", {
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

function isWholeMonth(start: number, end: number): boolean {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const lastDay = new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth() + 1, 0)).getUTCDate();
  return startDate.getUTCDate() === 1 && endDate.getUTCDate() === lastDay;
}

function formatPeriod(start: number, end: number): string {
  if (isWholeMonth(start, end)) {
    const firstMonth = monthFormatter.format(start);
    const lastMonth = monthFormatter.format(end);
    return firstMonth === lastMonth ? firstMonth : `${firstMonth} – ${lastMonth}`;
  }
  return `${dateFormatter.format(start)} – ${dateFormatter.format(end)}`;
}

export function periodLabel(dataset: Dataset, filters: Pick<FilterState, "from" | "to">): string {
  const earliestLead = dataset.leads.reduce(
    (earliest, lead) => Math.min(earliest, lead.createdAt),
    dataset.asOf,
  );
  const start = filters.from ?? earliestLead;
  const end = filters.to ?? dataset.asOf;
  const label = start <= end ? formatPeriod(start, end) : "No dates in range";
  return `${filters.from === null && filters.to === null ? "Full period" : "Period"}: ${label}`;
}
