import { INSIGHT_CONFIG, INSIGHT_TEXT } from "../config.ts";
import { formatCurrency } from "../format.ts";
import { fillTemplate } from "./template.ts";
import type { RankedItem } from "./types.ts";

export interface ItemCopy {
  headline: string;
  summary: string;
  owners: string[];
  recoverable: string;
}

export function itemOwners(item: RankedItem): string[] {
  return [...new Set(item.alerts.map((alert) => alert.owner))];
}

/** Display copy for a ranked item; an equal-priority group names its owners and the issue. */
export function itemCopy(item: RankedItem): ItemCopy {
  const first = item.alerts[0]!;
  const owners = itemOwners(item);
  if (!item.equalPriority) {
    return { headline: first.headline, summary: first.summary, owners, recoverable: formatCurrency(item.impact) };
  }
  const named = owners.length > 2
    ? fillTemplate(INSIGHT_TEXT.groupOwnersMore, { first: owners[0]!, second: owners[1]!, n: owners.length - 2 })
    : owners.join(" & ");
  const issues = [...new Set(item.alerts.map((alert) =>
    fillTemplate(INSIGHT_TEXT.issueByKind[alert.kind], { days: INSIGHT_CONFIG.idleOrderDays })))].join("; ");
  return {
    headline: fillTemplate(INSIGHT_TEXT.groupHeadline, { owners: named, issues }),
    summary: fillTemplate(INSIGHT_TEXT.groupSummary, { owners: owners.join(", ") }),
    owners,
    // Ranked on each alert's own impact, so show that rather than the group sum.
    recoverable: `${formatCurrency(first.impact)} ${INSIGHT_TEXT.groupEach}`,
  };
}
