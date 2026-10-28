import { STAGES, THRESHOLDS } from "../../lib/config.ts";
import { filterLeads } from "../../lib/metrics/filters.ts";
import { expectedValue, winProbability } from "../../lib/metrics/win-probability.ts";
import { periodLabel } from "../../lib/period.ts";
import { num, pct } from "./types.ts";
import type { FlaggedMetric, MetricRow, PageModule } from "./types.ts";

const PAGE = "Lead Explorer";
const FILE = "components/leads-page.tsx";
const FILE_WIN = "lib/metrics/win-probability.ts";
const NA = "n/a - no shared function";
const BREAKDOWN = "see breakdown sheet";

const FILTERS_LIST =
  "Date range (on created date; on the event basis the range applies only through the Stage filter, to the date the stage was reached), branch, rep, source, model, basis, plus page-local Stage, Lead status, Source multi-select, Selected leads, Sort and Order.";
const FILTERS_CHANCE =
  "Date range (created date), branch, rep, model, basis. The single global source filter is deliberately dropped; the page-local Stage, Lead status, Source multi-select and Selected leads filters are not applied.";

type RowBody = Omit<MetricRow, "section" | "label">;
const make = (section: string, label: string, body: RowBody): MetricRow => ({ section, label, ...body });

export const leadsPage: PageModule = {
  sheetName: "Lead Explorer",
  note:
    "Route /leads renders components/leads-page.tsx: a filterable, sortable list of individual leads. It has no KPI cards or charts; its only computed values are the lead count, 'Chance to buy' and 'Expected value'. Values here are full-period with no local filters.",
  rows: (ctx) => {
    const { ds, filters } = ctx;
    const leads = filterLeads(ds, filters);
    const pool = filterLeads(ds, { ...filters, source: null });
    const sampleSource = ds.sources[0] ?? "";
    const stageChances = STAGES.filter((stage) => stage !== "delivered").map((stage) => {
      const chance = winProbability(pool, stage, sampleSource);
      return `${stage.replaceAll("_", " ")} ${pct(chance.probability)} (${chance.basis})`;
    });
    const openWithValue = leads.filter((lead) => expectedValue(lead, pool) !== null).length;
    const across = `${num(leads.length)} leads`;
    const rows: MetricRow[] = [];

    const hdr = "Header: lead count line";
    rows.push(
      make(hdr, "Page title (Leads that reached <stage> / Filtered leads)", {
        level: "Company", across: "—", fields: "—", filters: "Stage filter only",
        value: "Filtered leads", codeRef: `NO CALCULATION (text chosen in ${FILE})`,
        formula: "Shows 'Leads that reached <stage>' when a Stage filter is in the link, otherwise 'Filtered leads'.",
        shows: "Tells you which group of leads you are looking at.",
        inputs: "The Stage filter is only set by clicking in from another page.",
      }),
      make(hdr, "N leads", {
        level: "Company", across, fields: "leads.created_at, leads.branch_id, leads.assigned_to, leads.source, leads.model_interested, leads.status_history",
        filters: FILTERS_LIST, value: num(leads.length),
        codeRef: `filterLeads (lib/metrics/filters.ts) then local status/source/leadIds/stage filters inside ${FILE} (leads useMemo)`,
        formula: "Number of leads that pass the global filters and then every page-local filter. Reads '1 lead' for exactly one.",
        shows: "How many leads are in the table below.",
        inputs: `${num(leads.length)} leads of ${num(ds.leads.length)} in the dataset. With local filters applied the page narrows this further; the value shown here is the no-local-filter count from filterLeads.`,
      }),
      make(hdr, "Period label", {
        level: "Company", across: "—", fields: "leads.created_at, dataset as-of date",
        filters: "Date range", value: periodLabel(ds, filters),
        codeRef: "periodLabel (lib/period.ts)",
        formula: "'Full period' (or 'Period') plus the start and end: the chosen dates, or earliest lead creation to the as-of date. A whole-month range shows month names.",
        shows: "The time window the numbers cover.",
        inputs: "—",
      }),
      make(hdr, "Branch: <name> / All branches", {
        level: "Branch", across: `${num(ds.branches.length)} branches`, fields: "branches.name",
        filters: "Branch", value: "All branches",
        codeRef: `NO CALCULATION (lookup of the selected branch name in ${FILE})`,
        formula: "Name of the branch filter, or 'All branches' when none is set.",
        shows: "Whether the list is limited to one branch.",
        inputs: "—",
      }),
    );

    const ctl = "Controls: filter bar";
    const ctlBase = {
      level: "Lead", across, filters: "Page-local control", value: "—",
      codeRef: `NO CALCULATION (control in ${FILE})`, inputs: "—",
    };
    rows.push(
      make(ctl, "Source", {
        ...ctlBase, fields: "leads.source",
        formula: "Multi-select of every source in the data; keeps leads whose source is any of the ticked ones (Source: <name> chips).",
        shows: "Limits the list to chosen lead sources.",
      }),
      make(ctl, "Lead status", {
        ...ctlBase, fields: "leads.status_history",
        formula: "Keeps leads whose latest status equals the choice; the options are the statuses found in the data.",
        shows: "Limits the list to leads currently at one status.",
      }),
      make(ctl, "Representative", {
        ...ctlBase, fields: "leads.assigned_to",
        formula: "Keeps leads assigned to the chosen rep (passed to filterLeads).",
        shows: "Limits the list to one rep's leads.",
      }),
      make(ctl, "Sort by", {
        ...ctlBase, fields: "leads.*",
        codeRef: `compareLeads (${FILE})`,
        formula: "Choices: Expected value (default; leads with no expected value count as −1, so they go last when descending), Last contacted (last activity time), Created date, Deal value, Customer name (A–Z), Representative (A–Z). Ties fall back to customer name then lead id.",
        shows: "Chooses which column orders the table.",
      }),
      make(ctl, "Sort order", {
        ...ctlBase, fields: "—",
        formula: "Descending (default) or ascending.",
        shows: "Flips the table order.",
      }),
    );

    const chips = "Chips: active lead filters";
    const chipBase = {
      level: "Lead", across, filters: "Page-local filter", value: "—",
      codeRef: `NO CALCULATION (activeLocalFilters, ${FILE})`, inputs: "Click a chip to remove it; 'Clear all' removes every page-local filter.",
    };
    rows.push(
      make(chips, "Stage: <stage> (chip)", {
        ...chipBase, fields: "leads.status_history",
        formula: "Keeps leads that ever reached the stage (on the event basis, reached it inside the date range).",
        shows: "Reminds you the list is limited to leads that reached a stage.",
      }),
      make(chips, "Status: <status> (chip)", {
        ...chipBase, fields: "leads.status_history",
        formula: "Keeps leads whose latest status equals the value.", shows: "Reminds you the list is limited to one status.",
      }),
      make(chips, "Rep: <name> (chip)", {
        ...chipBase, fields: "leads.assigned_to",
        formula: "Keeps leads assigned to that rep.", shows: "Reminds you the list is limited to one rep.",
      }),
      make(chips, "Source: <name> (chip)", {
        ...chipBase, fields: "leads.source",
        formula: "One chip per ticked source; keeps leads from any of them.", shows: "Reminds you the list is limited to certain sources.",
      }),
      make(chips, "Selected leads: N (chip)", {
        ...chipBase, fields: "leads.id", value: NA,
        codeRef: `NO MATCHING FUNCTION (calculated inside ${FILE}, leadIds set size)`,
        formula: "Number of lead ids passed in the link; only those leads are listed.",
        shows: "Reminds you the list is limited to leads picked on another page.",
      }),
      make(chips, "Sort / Order (chips)", {
        ...chipBase, fields: "—",
        formula: "Appear only when the link carries a sort or order choice; text is the sort name and Ascending/Descending.",
        shows: "Reminds you how the list is currently ordered.",
      }),
    );

    const tbl = "Table: Leads";
    const tblBase = { level: "Customer", across, filters: FILTERS_LIST, value: BREAKDOWN, inputs: "Plain field, no calculation." };
    const field = "NO CALCULATION (field lookup, lib/data/normalize.ts)";
    rows.push(
      make(tbl, "Customer", {
        ...tblBase, fields: "leads.customer_name", codeRef: field,
        formula: "Customer name of the lead.", shows: "Who the lead is.",
      }),
      make(tbl, "Stage", {
        ...tblBase, fields: "leads.status_history", codeRef: field,
        formula: "Latest status of the lead (underscores shown as spaces). The column is called Stage but holds the status, which can also be lost.",
        shows: "Where the lead is now.",
      }),
      make(tbl, "Deal value", {
        ...tblBase, fields: "leads.deal_value", codeRef: field,
        formula: "Expected sale value of the lead.", shows: "What the sale is worth.",
      }),
      make(tbl, "Chance to buy", {
        level: "Customer", across, filters: FILTERS_CHANCE, value: BREAKDOWN,
        fields: "leads.status_history, leads.source",
        codeRef: `winProbability (${FILE_WIN}); the current-stage choice is inline in ${FILE}`,
        formula: `Look at closed leads (delivered or lost) in the filtered pool that reached the lead's current stage. If the lead's source has at least ${num(THRESHOLDS.minClosedLeadsForSourceWinProbability)} such closed leads, chance = delivered ÷ closed within that source (tooltip says 'stage + source'); otherwise chance = delivered ÷ closed across all sources (tooltip says 'stage only'). Current stage = the lead's status when it is one of the six stages; otherwise (lost) the latest stage it reached, or new.`,
        shows: "How likely this kind of customer at this stage has been to end up buying, based on past outcomes.",
        inputs: `Threshold ${num(THRESHOLDS.minClosedLeadsForSourceWinProbability)} closed leads per source (THRESHOLDS.minClosedLeadsForSourceWinProbability). Pool = ${num(pool.length)} leads. Example for source ${sampleSource || "—"}: ${stageChances.join("; ")}.`,
      }),
      make(tbl, "Expected value", {
        level: "Customer", across, filters: FILTERS_CHANCE, value: BREAKDOWN,
        fields: "leads.deal_value, leads.status_history, leads.source",
        codeRef: `expectedValue (${FILE_WIN})`,
        formula: "Deal value × chance to buy at the lead's current stage. Shown as — for delivered and lost leads, or when no chance can be worked out.",
        shows: "The rupee value of the deal weighted by how likely it is to close.",
        inputs: `${num(openWithValue)} of ${num(leads.length)} leads have an expected value. Delivered and lost leads show — here even though Chance to buy may still show a percentage for them.`,
      }),
      make(tbl, "Branch", {
        ...tblBase, fields: "leads.branch_id, branches.name", codeRef: field,
        formula: "Branch of the lead; the name links to the Targets page for that branch.", shows: "Which showroom owns the lead.",
      }),
      make(tbl, "Representative", {
        ...tblBase, fields: "leads.assigned_to, sales_reps.name", codeRef: field,
        formula: "Rep of the lead; the name filters this list to that rep.", shows: "Who owns the lead.",
      }),
      make(tbl, "Source", {
        ...tblBase, fields: "leads.source", codeRef: field,
        formula: "Where the lead came from, formatted (walk_in shown as Walk-in).", shows: "How the customer found us.",
      }),
      make(tbl, "Model", {
        ...tblBase, fields: "leads.model_interested", codeRef: field,
        formula: "Car model the customer asked about.", shows: "Which car they want.",
      }),
      make(tbl, "Last contacted (date tag)", {
        ...tblBase, fields: "leads.last_activity_at", codeRef: field,
        formula: "Date (UTC) of the lead's last recorded activity.", shows: "When anyone last touched the lead.",
      }),
      make(tbl, "Expected close date (date tag)", {
        ...tblBase, fields: "leads.expected_close_date", codeRef: field,
        formula: "Expected close date from the data, or — if missing. The tag is not coloured red even when the date has passed; the header tooltip only says an open lead is overdue when this date is before the as-of date.",
        shows: "When the deal was expected to close.",
      }),
      make("Empty state", "No leads in this view", {
        level: "Company", across: "—", fields: "—", filters: FILTERS_LIST, value: "—",
        codeRef: `NO CALCULATION (shown by ${FILE} when the list is empty)`,
        formula: "Message shown when no lead passes all filters, with a 'Browse all leads' link that clears local filters.",
        shows: "Tells you the filters are too narrow.",
        inputs: `Shown only when the list is empty (${num(leads.length)} leads at full period).`,
      }),
    );
    return rows;
  },
  flags: (): FlaggedMetric[] => [
    {
      page: PAGE, label: "Current stage used for Chance to buy", where: "Table: Leads",
      note: "Which stage is used for a lost lead (its latest reached stage, else new) is decided inside components/leads-page.tsx; winProbability itself only receives the stage.",
    },
    {
      page: PAGE, label: "Chance to buy vs Expected value", where: "Table: Leads",
      note: "Delivered and lost leads can show a Chance to buy percentage but Expected value is — for them.",
    },
    {
      page: PAGE, label: "Selected leads: N chip", where: "Chips: active lead filters",
      note: "Count of ids in the link, calculated inline; no shared function.",
    },
    {
      page: PAGE, label: "Lead count line", where: "Header",
      note: "The count applies page-local filters inline after filterLeads, so the shared function alone matches only when no local filter is set.",
    },
    {
      page: PAGE, label: "Stage column label", where: "Table: Leads",
      note: "Column is named Stage but displays the lead's latest status (which can be lost).",
    },
  ],
};
