import type { Ctx, FlaggedMetric, MetricRow, PageModule } from "./types.ts";
import { num } from "./types.ts";
import { THRESHOLDS } from "../../lib/config.ts";

const unavailable = "n/a - no shared function";
const filtersForClosed = "Date range, branch, source, and model; assigned-lead cohort always uses created-date basis, with close-event date additionally applied when basis is event. The route has no rep filter control; each row is scoped to its representative.";
const filtersForOpen = "Date range, branch, source, and model; created basis filters creation date, event basis filters last activity for open leads. Each row is scoped to its representative; the leaderboard counts are independent of the separate pipeline-table age/stage/source controls.";

function metric(
  section: string,
  label: string,
  across: string,
  fields: string,
  filters: string,
  formula: string,
  shows: string,
): MetricRow {
  return {
    section,
    label,
    level: "Rep",
    across,
    fields,
    filters,
    value: unavailable,
    codeRef: "NO MATCHING FUNCTION (calculated inside components/funnel-team-section.tsx, view.useMemo/leaderboard/coaching)",
    formula,
    shows,
    inputs: "The component calculates this value by grouping or sorting its inline representative rows; no exported library function returns the same rep-level metric.",
  };
}

const fieldsAssigned = "leads.rep_id, leads.created_at, leads.status, leads.delivery, leads.history, leads.deal_value";
const fieldsOpen = "leads.rep_id, leads.status, leads.delivery, leads.last_activity_at, leads.expected_close_at, leads.deal_value";

export const repDetailPage: PageModule = {
  sheetName: "Rep detail",
  note: "There is no standalone representative page: /representatives and /team redirect to /funnel. Rep-level metrics appear in the Funnel page header summary, the Rep leaderboard, and Coaching below the peer benchmark. This sheet documents those representative-level measures; branch and source aggregates remain on Funnel.",
  rows(_ctx: Ctx): MetricRow[] {
    return [
      metric(
        "Funnel page header summary",
        "Funnel",
        "Selected company scope",
        "leads.rep_id, leads.created_at, leads.status, leads.last_activity_at",
        "Date range, branch, source, and model; lead count uses created basis, open count uses the selected basis. The page has no rep filter.",
        "Count distinct representatives with scoped assigned leads, then state the scoped lead and currently open-lead counts.",
        "This sentence summarizes the number of representatives managing selected leads and how many selected leads remain open.",
      ),
      metric(
        "Table: Rep leaderboard",
        "Rank",
        "Each non-manager representative with at least one assigned lead",
        `${fieldsAssigned}, leads.last_activity_at`,
        `${filtersForClosed} Open-lead workload ordering uses the selected basis: creation date on created basis, last activity on event basis.`,
        "Order representatives by open-lead count descending, then closed win rate ascending (null rates sort last), assigned-lead count descending, and representative name; show the resulting position.",
        "Shows the relative order of representatives using workload first, then closed outcomes and assigned volume.",
      ),
      metric(
        "Table: Rep leaderboard",
        "Win rate",
        "Each displayed representative",
        "leads.rep_id, leads.status, leads.created_at, leads.delivery, leads.history",
        filtersForClosed,
        "For that rep, divide delivered leads by delivered plus lost leads among the created-scope assigned leads; with event basis, retain only closures in the date range. Show a dash when there are no closed leads.",
        "Shows the share of the representative's closed outcomes that were delivered.",
      ),
      metric(
        "Table: Rep leaderboard",
        "Revenue",
        "Each displayed representative",
        "leads.rep_id, leads.status, leads.deal_value, leads.created_at, leads.delivery, leads.history",
        filtersForClosed,
        "Sum deal value for delivered leads in the rep's scoped assigned leads; with event basis, delivered outcomes must be in the date range.",
        "Shows delivered deal value attributed to each representative.",
      ),
      metric(
        "Table: Rep leaderboard",
        "Open leads",
        "Each displayed representative",
        fieldsOpen,
        filtersForOpen,
        "Count the representative's selected open leads before an order, plus orders that have not yet been delivered.",
        "Shows how many open opportunities each representative currently owns.",
      ),
      metric(
        "Table: Rep leaderboard",
        "Inactive",
        "Each displayed representative; warning tag when nonzero",
        fieldsOpen,
        filtersForOpen,
        `Count selected open pre-order leads whose floored idle-day age is greater than ${num(THRESHOLDS.coldLeadDays)}, plus undelivered orders whose floored idle-day age is greater than ${num(THRESHOLDS.staleOrderDays)}.`,
        "Warns when the representative's open opportunities have gone quiet beyond their stage-specific age limits.",
      ),
      metric(
        "Table: Rep leaderboard",
        "Overdue",
        "Each displayed representative; warning tag when nonzero",
        "leads.rep_id, leads.status, leads.expected_close_at, leads.created_at, leads.last_activity_at",
        filtersForOpen,
        "Count selected open leads whose expected close date is strictly before the dataset as-of calendar day.",
        "Warns when the representative has open leads past their expected close date.",
      ),
      metric(
        "Table: Rep leaderboard",
        "Assigned leads",
        "Each displayed representative",
        fieldsAssigned,
        "Date range, branch, source, and model on created date; count each representative's created-scope leads.",
        "Count leads assigned to the representative after applying company-level filters; representatives with no assigned leads are omitted.",
        "Shows the representative's assigned lead volume in the selected created-date cohort.",
      ),
      metric(
        "Summary: Rep leaderboard",
        "Rep leaderboard",
        "One sentence for the peer benchmark",
        "leads.rep_id, leads.status, leads.created_at, leads.delivery, leads.history, leads.last_activity_at",
        `${filtersForClosed} The workload count uses the selected basis for open leads.`,
        "Explain the workload-first ranking and, when at least one listed rep has a closed win rate, report the median of all measured rep win rates with no minimum sample-size rule; otherwise show the no-benchmark explanation.",
        "Explains how the ranking works and whether there is enough rep-level closed-result data for a peer comparison.",
      ),
      metric(
        "Card: Coaching below the peer benchmark",
        "Coaching below the peer benchmark",
        "One card takeaway and a list of representatives below the measured peer median",
        "leads.rep_id, leads.status, leads.created_at, leads.delivery, leads.history, leads.last_activity_at",
        `${filtersForClosed} The workload count uses the selected basis for open leads.`,
        "Calculate the median closed win rate across leaderboard reps with a measured rate, then list reps strictly below that median, ordered by win rate ascending and open-lead count descending. No minimum closed-lead sample threshold is applied. If no benchmark exists, show the unavailable message.",
        "Calls attention to representatives whose measured closed win rate is below the peer median and states their live deal workload.",
      ),
      metric(
        "Card: Coaching below the peer benchmark",
        "Win rate",
        "Each coached representative versus the peer median",
        "leads.rep_id, leads.status, leads.created_at, leads.delivery, leads.history",
        filtersForClosed,
        "Show the coached representative's closed win rate beside the peer median; coached reps have a measured rate strictly below that median.",
        "Shows how a coached representative's closed outcomes compare with the current rep benchmark.",
      ),
      metric(
        "Card: Coaching below the peer benchmark",
        "Open leads",
        "Each coached representative",
        fieldsOpen,
        filtersForOpen,
        "Count the representative's current open leads and include that count in the coaching sentence as live deals needing review.",
        "Adds the representative's current open workload to the coaching prompt.",
      ),
    ];
  },
  flags(_ctx: Ctx): FlaggedMetric[] {
    const labels: [string, string][] = [
      ["Funnel", "components/focused-section.tsx — funnelTeamSummary"],
      ["Rank", "components/funnel-team-section.tsx — leaderboard sort/index"],
      ["Win rate", "components/funnel-team-section.tsx — repRows closed/delivered calculation"],
      ["Revenue", "components/funnel-team-section.tsx — repRows delivered revenue sum"],
      ["Open leads", "components/funnel-team-section.tsx — repRows openCount"],
      ["Inactive", "components/funnel-team-section.tsx — repRows/combinedRows inactiveCount"],
      ["Overdue", "components/funnel-team-section.tsx — repRows overdueCount grouping"],
      ["Assigned leads", "components/funnel-team-section.tsx — repRows leadCount"],
      ["Rep leaderboard", "components/funnel-team-section.tsx — leaderboard takeaway/benchmark"],
      ["Coaching below the peer benchmark", "components/funnel-team-section.tsx — coaching benchmark/filter/takeaway"],
      ["Coached representative Win rate", "components/funnel-team-section.tsx — coaching list sentence"],
      ["Coached representative Open leads", "components/funnel-team-section.tsx — coaching list sentence"],
    ];
    return labels.map(([label, where]) => ({
      page: "Rep detail",
      label,
      where,
      note: "This displayed rep-level calculation is performed inline in the component; no matching exported library function returns the same metric. The workbook leaves its value unavailable rather than recreating the component calculation.",
    }));
  },
};
