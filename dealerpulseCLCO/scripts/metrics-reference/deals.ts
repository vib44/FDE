import {
  CONTROLLABLE_LOSS_REASONS,
  ORDER_STAGE,
  PRE_ORDER_STAGES,
  THRESHOLDS,
} from "../../lib/config.ts";
import { formatCurrency, formatNumber } from "../../lib/format.ts";
import { overdueOpen } from "../../lib/metrics/delivery.ts";
import { filterLeads } from "../../lib/metrics/filters.ts";
import {
  dealProgressionMetrics,
  inProgressPipeline,
  lostAtStage,
  testDriveLift,
} from "../../lib/metrics/stage-progression.ts";
import type { Dataset, FilterState } from "../../lib/types.ts";
import { cur, days, num, pct } from "./types.ts";
import type { FlaggedMetric, MetricRow, PageModule } from "./types.ts";

const PAGE = "Deals in progress";
const FILE_SECTION = "components/deal-progression-section.tsx";
const FILE_PAGE = "components/deals-page.tsx";
const FILE_STAGE = "lib/metrics/stage-progression.ts";
const FILE_DELIVERY = "lib/metrics/delivery.ts";
const NA = "n/a - no shared function";
const BREAKDOWN = "see breakdown sheet";

const FILTERS_PROGRESSION =
  "Date range (on created date), branch, source, model, basis (on the event basis a lead must also reach the stage inside the date range). Rep is not applied.";
const FILTERS_OVERDUE =
  "Branch, source, model and basis. The date range is applied to created date only on the created basis; on the event basis it is not applied. Rep is not applied.";

/** Shared with branch-detail.ts so a branch drill-down uses exactly the same calls as the page. */
export function dealsData(ds: Dataset, filters: FilterState) {
  const scoped = filterLeads(ds, { ...filters, timeBasis: "created" });
  const metrics = dealProgressionMetrics(scoped, filters, ds.asOf);
  const overdue = overdueOpen(filterLeads(ds, filters), ds.asOf);
  return {
    scoped,
    metrics,
    lift: testDriveLift(scoped),
    negotiationLost: lostAtStage(scoped, "negotiation"),
    overdue,
    overdueUnordered: inProgressPipeline(overdue),
    waitingValue: inProgressPipeline(metrics.bookingOpenRows.map((row) => row.lead)).value,
    openNegotiationValue: inProgressPipeline(metrics.closingOpenRows.map((row) => row.lead)).value,
  };
}

/** The deal progression section shows Step 2/Step 4 durations with one decimal. */
const d1 = (value: number | null): string =>
  value === null ? "—" : `${formatNumber(value, 1)} days`;
const crores = (value: number): string => `₹${formatNumber(value / 10_000_000, 2)} Cr`;
const points = (value: number | null): string =>
  value === null ? "not available" : `${formatNumber(Math.abs(value) * 100, 0)} points`;

type RowBody = Omit<MetricRow, "section" | "label">;
const make = (section: string, label: string, body: RowBody): MetricRow => ({ section, label, ...body });

function liftSentence(lift: number | null): string {
  if (lift === null) return "Customers who test-drive are — points more likely to buy.";
  return lift < 0
    ? `Customers who test-drive are ${points(lift)} less likely to buy.`
    : `Customers who test-drive are ${points(lift)} more likely to buy.`;
}

function waitingTable(
  section: string,
  stageName: string,
  stageKey: string,
  timeLabel: string,
  openRows: ReturnType<typeof dealsData>["metrics"]["bookingOpenRows"],
  overdueRows: ReturnType<typeof dealsData>["metrics"]["bookingOverdueRows"],
  time: { medianDays: number | null; percentile75Days: number | null; count: number },
): MetricRow[] {
  const across = `${num(openRows.length)} leads currently in ${stageName}`;
  const openRef = `openAtStage (${FILE_STAGE}) via dealProgressionMetrics`;
  const common = {
    level: "Customer",
    across,
    filters: FILTERS_PROGRESSION,
    value: BREAKDOWN,
    codeRef: openRef,
  };
  return [
    make(section, "Customer", {
      ...common, fields: "leads.customer_name, leads.status_history",
      formula: `Every lead whose latest status is ${stageKey}, listed largest deal value first, then longest wait, then customer name.`,
      shows: "Who is sitting at this stage right now.",
      inputs: `${num(openRows.length)} leads listed. Clicking a row opens the status history drawer.`,
    }),
    make(section, "Rep", {
      ...common, fields: "leads.assigned_to, sales_reps.name",
      formula: "Name of the representative the lead is assigned to.",
      shows: "Who owns the deal.", inputs: "Plain field, no calculation.",
      codeRef: "NO CALCULATION (field lookup, lib/data/normalize.ts)",
    }),
    make(section, "Branch", {
      ...common, fields: "leads.branch_id, branches.name",
      formula: "Name of the branch the lead belongs to.",
      shows: "Which showroom owns the deal.", inputs: "Plain field, no calculation.",
      codeRef: "NO CALCULATION (field lookup, lib/data/normalize.ts)",
    }),
    make(section, "Model", {
      ...common, fields: "leads.model_interested",
      formula: "Car model the customer asked about.",
      shows: "Which car the customer wants.", inputs: "Plain field, no calculation.",
      codeRef: "NO CALCULATION (field lookup, lib/data/normalize.ts)",
    }),
    make(section, "Deal value", {
      ...common, fields: "leads.deal_value",
      formula: "Expected sale value of the lead as supplied in the data.",
      shows: "How many rupees this customer is worth if they buy.",
      inputs: `Total of these ${num(openRows.length)} leads: ${cur(inProgressPipeline(openRows.map((row) => row.lead)).value)}.`,
      codeRef: "NO CALCULATION (field lookup, lib/data/normalize.ts)",
    }),
    make(section, "Days waiting", {
      ...common, fields: "leads.status_history, leads.last_activity_at",
      formula: `Days from the last time the lead entered ${stageKey} (latest matching history event; first-reached time if none; last activity if neither) to the dataset as-of date, never below 0. Shown with one decimal.`,
      shows: "How long the customer has been stuck at this stage.",
      inputs: `Header tooltip: median time ${d1(time.medianDays)}, 75th percentile ${d1(time.percentile75Days)}.`,
    }),
    make(section, "Overdue (chip)", {
      ...common, fields: "leads.status_history",
      value: num(overdueRows.length),
      codeRef: `overdueAtStage (${FILE_STAGE}); chip drawn in ${FILE_SECTION} (WaitingList)`,
      formula: `A waiting lead is tagged Overdue when its days waiting is greater than the 75th percentile (the value at rank ceil(0.75 × n) after sorting, n = ${timeLabel}) of the days other leads took to move on. Leads with no 75th percentile are never tagged.`,
      shows: "Tags customers who have waited longer than three quarters of past customers did before moving on.",
      inputs: `${num(overdueRows.length)} of ${num(openRows.length)} waiting leads are over the threshold of ${d1(time.percentile75Days)} (75th percentile of ${num(time.count)} leads that reached both stages).`,
    }),
    make(section, "Due (chip)", {
      ...common, fields: "leads.status_history",
      value: NA,
      codeRef: `NO MATCHING FUNCTION (calculated inside ${FILE_SECTION}, WaitingList render: daysInStage > medianDays)`,
      formula: `A waiting lead that is not Overdue is tagged Due when its days waiting is greater than the median (typical) time of ${d1(time.medianDays)}.`,
      shows: "Tags customers who have waited longer than the typical customer but are not yet overdue.",
      inputs: `Median ${d1(time.medianDays)} from timeToNextStage (${FILE_STAGE}). The count of Due chips is not available from any shared function.`,
    }),
  ];
}

export const dealsPage: PageModule = {
  sheetName: "Deals in progress",
  note:
    "Route /deals renders components/deals-page.tsx and components/deal-progression-section.tsx. /branches and /branch/[branchId] redirect here. Values are full-period, company-wide. Three different time rules apply: 'Overdue' on the stage tables and KPI cards means longer than the 75th percentile of past stage times; 'Due' means longer than the median (typical) time; 'overdue deals' in the last table means the expected close date is before the as-of day.",
  rows: (ctx) => {
    const { ds, filters } = ctx;
    const D = dealsData(ds, filters);
    // dealsData is also used by branch-detail.ts
    const m = D.metrics;
    const branches = `${num(ds.branches.length)} branches`;
    const company = "Company";
    const rows: MetricRow[] = [];

    const refMetrics = `dealProgressionMetrics (${FILE_STAGE})`;

    // ---------- KPI card: Orders won
    const ordersSec = "KPI card: Orders won";
    rows.push(
      make(ordersSec, "Orders won", {
        level: company, across: "all leads in view", fields: "leads.status_history",
        filters: FILTERS_PROGRESSION, value: num(m.orderCount),
        codeRef: `${refMetrics} → orderCount`,
        formula: "Count of leads that ever reached the order-placed stage (includes leads later delivered, and any that went on to be lost after ordering).",
        shows: "How many customers have placed an order.",
        inputs: `${num(m.orderCount)} leads reached ${ORDER_STAGE}.`,
      }),
      make(ordersSec, "Total value", {
        level: company, across: "all leads in view", fields: "leads.status_history, leads.deal_value",
        filters: FILTERS_PROGRESSION, value: crores(m.orderValue),
        codeRef: `${refMetrics} → orderValue`,
        formula: "Sum of deal value of every lead that reached order placed. Always shown in crores with two decimals.",
        shows: "Total rupee value of all orders placed.",
        inputs: `${cur(m.orderValue)} across ${num(m.orderCount)} orders.`,
      }),
      make(ordersSec, "Test drive → order", {
        level: company, across: "leads that reached test drive", fields: "leads.status_history",
        filters: FILTERS_PROGRESSION, value: pct(m.testDriveOrderRate),
        codeRef: `${refMetrics} → testDriveOrderRate = stageConversion (${FILE_STAGE})`,
        formula: "Leads that reached test drive and also reached order placed, divided by leads that reached test drive.",
        shows: "Out of customers who test-drove, the share who went on to order.",
        inputs: `${num(m.testDriveCount)} leads reached test drive; rate = ${pct(m.testDriveOrderRate)}.`,
      }),
      make(ordersSec, "Typical days to order", {
        level: company, across: `${num(m.testDriveOrderTime.count)} leads that reached both stages`, fields: "leads.status_history",
        filters: FILTERS_PROGRESSION, value: days(m.testDriveOrderTime.medianDays),
        codeRef: `${refMetrics} → testDriveOrderTime.medianDays via timeToNextStage (${FILE_STAGE})`,
        formula: "Median of (order-placed time − test-drive time) in days, for leads that reached both stages in that order. Shown as a whole number.",
        shows: "How many days a typical customer takes from test drive to placing an order.",
        inputs: `Median ${days(m.testDriveOrderTime.medianDays)}; 75th percentile ${days(m.testDriveOrderTime.percentile75Days)}; ${num(m.testDriveOrderTime.count)} leads.`,
      }),
      make(ordersSec, "Average order", {
        level: company, across: "leads that reached order placed", fields: "leads.status_history, leads.deal_value",
        filters: FILTERS_PROGRESSION, value: NA,
        codeRef: `NO MATCHING FUNCTION (calculated inside ${FILE_SECTION}, orderValue / orderCount shown in lakhs)`,
        formula: "Total value of orders divided by the number of leads that reached order placed, shown in ₹ lakhs with one decimal; shows — if there are no orders.",
        shows: "The typical rupee size of one order.",
        inputs: `Built from ${cur(m.orderValue)} ÷ ${num(m.orderCount)} orders (both from ${refMetrics}); the division itself is done in the component.`,
      }),
    );

    // ---------- KPI card: Test drives
    const tdSec = "KPI card: Test drives";
    rows.push(
      make(tdSec, "Test drives", {
        level: company, across: "all leads in view", fields: "leads.status_history",
        filters: FILTERS_PROGRESSION, value: num(m.testDriveCount),
        codeRef: `${refMetrics} → testDriveCount`,
        formula: "Count of leads that ever reached the test-drive stage (booked or done; the data has no separate scheduled date).",
        shows: "How many customers booked or took a test drive.",
        inputs: `${num(m.testDriveCount)} leads reached test_drive.`,
      }),
      make(tdSec, "Booking rate", {
        level: company, across: "leads that reached contacted", fields: "leads.status_history",
        filters: FILTERS_PROGRESSION, value: pct(m.bookingRate),
        codeRef: `${refMetrics} → bookingRate = stageConversion (${FILE_STAGE})`,
        formula: "Leads that reached contacted and also reached test drive, divided by leads that reached contacted.",
        shows: "Out of customers we contacted, the share who booked a test drive.",
        inputs: m.bookingRate === null ? "No leads reached contacted." : `Rate = ${pct(m.bookingRate)}. Leads that reached test drive without a recorded contact are not counted in the numerator.`,
      }),
      make(tdSec, "Typical days to book", {
        level: company, across: `${num(m.bookingTime.count)} leads that reached both stages`, fields: "leads.status_history",
        filters: FILTERS_PROGRESSION, value: days(m.bookingTime.medianDays),
        codeRef: `${refMetrics} → bookingTime.medianDays via timeToNextStage (${FILE_STAGE})`,
        formula: "Median of (test-drive time − first-contacted time) in days, for leads that reached both stages in that order. Whole number on the card.",
        shows: "How many days a typical customer takes from first contact to a test drive.",
        inputs: `Median ${days(m.bookingTime.medianDays)}; 75th percentile ${days(m.bookingTime.percentile75Days)}; ${num(m.bookingTime.count)} leads.`,
      }),
      make(tdSec, "Waiting now", {
        level: company, across: "leads whose latest status is contacted", fields: "leads.status, leads.deal_value",
        filters: FILTERS_PROGRESSION, value: `${num(m.bookingOpenRows.length)} · ${cur(D.waitingValue)}`,
        codeRef: `openAtStage (${FILE_STAGE}) count; value summed inside ${FILE_SECTION} (bookingWaitingValue)`,
        formula: "Count of leads currently at contacted, and the sum of their deal values.",
        shows: "Customers contacted but with no test drive yet, and what they are worth.",
        inputs: `${num(m.bookingOpenRows.length)} leads; value ${cur(D.waitingValue)} (same total as inProgressPipeline on these leads, since contacted is a pre-order stage).`,
      }),
      make(tdSec, "Overdue", {
        level: company, across: "leads waiting at contacted", fields: "leads.status_history",
        filters: FILTERS_PROGRESSION, value: num(m.bookingOverdueRows.length),
        codeRef: `${refMetrics} → bookingOverdueRows via overdueAtStage (${FILE_STAGE})`,
        formula: "Waiting leads whose days at contacted is greater than the 75th percentile of contacted → test-drive times.",
        shows: "How many waiting customers have waited longer than most customers did before booking.",
        inputs: `${num(m.bookingOverdueRows.length)} of ${num(m.bookingOpenRows.length)} waiting; threshold (75th percentile) ${d1(m.bookingTime.percentile75Days)}. Shows a warning icon when above zero.`,
      }),
    );

    // ---------- KPI card: Negotiations
    const negSec = "KPI card: Negotiations";
    rows.push(
      make(negSec, "Negotiations", {
        level: company, across: "all leads in view", fields: "leads.status_history",
        filters: FILTERS_PROGRESSION, value: num(m.negotiationCount),
        codeRef: `${refMetrics} → negotiationCount`,
        formula: "Count of leads that ever reached the negotiation stage.",
        shows: "How many customers got as far as price negotiation.",
        inputs: `${num(m.negotiationCount)} leads reached negotiation.`,
      }),
      make(negSec, "Closing rate", {
        level: company, across: "leads that reached negotiation", fields: "leads.status_history",
        filters: FILTERS_PROGRESSION, value: pct(m.closingRate),
        codeRef: `${refMetrics} → closingRate = stageConversion (${FILE_STAGE})`,
        formula: "Leads that reached negotiation and also reached order placed, divided by leads that reached negotiation.",
        shows: "Out of customers we negotiated with, the share who ordered.",
        inputs: `${num(m.negotiationCount)} leads reached negotiation; rate = ${pct(m.closingRate)}.`,
      }),
      make(negSec, "Typical days to close", {
        level: company, across: `${num(m.closingTime.count)} leads that reached both stages`, fields: "leads.status_history",
        filters: FILTERS_PROGRESSION, value: days(m.closingTime.medianDays),
        codeRef: `${refMetrics} → closingTime.medianDays via timeToNextStage (${FILE_STAGE})`,
        formula: "Median of (order-placed time − negotiation time) in days, for leads that reached both stages in that order. Whole number on the card.",
        shows: "How many days a typical negotiation takes to turn into an order.",
        inputs: `Median ${days(m.closingTime.medianDays)}; 75th percentile ${days(m.closingTime.percentile75Days)}; ${num(m.closingTime.count)} leads.`,
      }),
      make(negSec, "Open now", {
        level: company, across: "leads whose latest status is negotiation", fields: "leads.status, leads.deal_value",
        filters: FILTERS_PROGRESSION, value: `${num(m.closingOpenRows.length)} · ${cur(D.openNegotiationValue)}`,
        codeRef: `openAtStage (${FILE_STAGE}) count; value summed inside ${FILE_SECTION} (closingWaitingValue)`,
        formula: "Count of leads currently in negotiation, and the sum of their deal values.",
        shows: "Customers being negotiated with right now, and what they are worth.",
        inputs: `${num(m.closingOpenRows.length)} leads; value ${cur(D.openNegotiationValue)} (same total as inProgressPipeline on these leads, since negotiation is a pre-order stage).`,
      }),
      make(negSec, "Overdue", {
        level: company, across: "open negotiations", fields: "leads.status_history",
        filters: FILTERS_PROGRESSION, value: num(m.closingOverdueRows.length),
        codeRef: `${refMetrics} → closingOverdueRows via overdueAtStage (${FILE_STAGE})`,
        formula: "Open negotiations whose days in negotiation is greater than the 75th percentile of negotiation → order times.",
        shows: "How many negotiations have dragged on longer than most did before closing.",
        inputs: `${num(m.closingOverdueRows.length)} of ${num(m.closingOpenRows.length)} open; threshold (75th percentile) ${d1(m.closingTime.percentile75Days)}. Shows a warning icon when above zero.`,
      }),
    );

    // ---------- Step 2 card
    const s2 = "Card: Step 2 · Contacted → Test drive";
    const bookingSentence = `Booking rate: ${m.bookingRate === null ? "—" : pct(m.bookingRate)} · Typical time to book: ${d1(m.bookingTime.medianDays)} · ${liftSentence(D.lift)}`;
    rows.push(
      make(s2, "Summary sentence (Booking rate · Typical time to book · lift)", {
        level: company, across: "leads in view", fields: "leads.status_history, leads.status",
        filters: FILTERS_PROGRESSION, value: bookingSentence,
        codeRef: `${refMetrics}; testDriveLift (${FILE_STAGE}); sentence built in ${FILE_SECTION}`,
        formula: "Joins the booking rate, the median days from contact to test drive (one decimal here, whole number on the card) and the test-drive lift.",
        shows: "One-line summary of how well contacted customers are being turned into test drives.",
        inputs: `Booking rate ${pct(m.bookingRate)}; median ${d1(m.bookingTime.medianDays)}; lift ${D.lift === null ? "—" : pct(D.lift)}.`,
      }),
      make(s2, "Customers who test-drive are N points more/less likely to buy", {
        level: company, across: "closed leads (delivered or lost) in view", fields: "leads.status, leads.status_history",
        filters: FILTERS_PROGRESSION, value: liftSentence(D.lift),
        codeRef: `testDriveLift (${FILE_STAGE}); wording in ${FILE_SECTION}`,
        formula: "Among closed leads (delivered or lost), the share delivered for leads that reached test drive minus the share delivered for leads that reached contacted. Shown as whole percentage points; 'less likely' if negative. Measured on closed leads only (on the event basis with a date range, closed in range).",
        shows: "How much a test drive improves a customer's chance of finally buying.",
        inputs: `Difference ${D.lift === null ? "not available" : pct(D.lift)}.`,
      }),
      make(s2, "Definitions: 75th percentile", {
        level: company, across: `${num(m.bookingTime.count)} leads that reached both stages`, fields: "leads.status_history",
        filters: FILTERS_PROGRESSION, value: d1(m.bookingTime.percentile75Days),
        codeRef: `${refMetrics} → bookingTime.percentile75Days via timeToNextStage (${FILE_STAGE})`,
        formula: "Sort the days from contact to test drive, take the value at rank ceil(0.75 × n). This is the overdue threshold. The typical time is the median (average of the two middle values when n is even).",
        shows: "The wait length beyond which a customer counts as overdue.",
        inputs: `Median ${d1(m.bookingTime.medianDays)}; 75th percentile ${d1(m.bookingTime.percentile75Days)}; n = ${num(m.bookingTime.count)}.`,
      }),
    );

    const s2Wait = "Table: Waiting for a test drive";
    rows.push(...waitingTable(s2Wait, "contacted", "contacted", "leads that reached contacted and test drive", m.bookingOpenRows, m.bookingOverdueRows, m.bookingTime));

    const s2Loss = "Table: Lost before a test drive";
    const lossCommon = {
      level: "Reason", across: "lost leads", filters: FILTERS_PROGRESSION, value: NA,
      codeRef: `NO MATCHING FUNCTION (calculated inside ${FILE_SECTION}, lostBeforeTestDrive)`,
    };
    rows.push(
      make(s2Loss, "Reason", {
        ...lossCommon, fields: "leads.status, leads.lost_reason, leads.status_history",
        formula: "Leads that are lost, reached contacted and never reached test drive, grouped by lost reason (blank reason shown as Uncategorized), most deals first, then most rupees.",
        shows: "Why contacted customers were lost before booking a test drive.",
        inputs: "lostAtStage groups by the last non-lost status instead, so it does not return the same set; no shared function.",
      }),
      make(s2Loss, "Deals", {
        ...lossCommon, fields: "leads.status, leads.lost_reason",
        formula: "Number of leads in that reason group.", shows: "How many deals were lost for this reason.",
        inputs: "Counted inside the component.",
      }),
      make(s2Loss, "₹ lost", {
        ...lossCommon, fields: "leads.deal_value",
        formula: "Sum of deal value of the leads in that reason group.", shows: "Rupees lost for this reason.",
        inputs: "Summed inside the component.",
      }),
      make(s2Loss, "Action (Controllable / Uncategorized chip)", {
        ...lossCommon, fields: "leads.lost_reason",
        formula: `Chip says Controllable when the lower-cased reason (underscores as spaces) is one of: ${CONTROLLABLE_LOSS_REASONS.join(", ")}; otherwise it says Uncategorized (even for a clearly named reason such as price).`,
        shows: "Whether the dealership could realistically have prevented the loss.",
        inputs: `${num(CONTROLLABLE_LOSS_REASONS.length)} reasons count as controllable (lib/config.ts CONTROLLABLE_LOSS_REASONS). The same rule is also in isControllable inside ${FILE_STAGE}, which is not exported.`,
      }),
    );

    // ---------- By branch table
    const bb = "Table: By branch";
    const branchCommon = {
      level: "Branch", across: branches, filters: "Date range (created date), branch, source, model, basis. Rep is not applied. A branch filter leaves only that branch with numbers; other rows show —.",
    };
    rows.push(
      make(bb, "Branch", {
        ...branchCommon, fields: "branches.name, leads.branch_id", value: BREAKDOWN,
        codeRef: `NO CALCULATION (list of dataset.branches, ${FILE_PAGE})`,
        formula: "One row per branch; the name links to the branch drill-down (/branch/<id>, which redirects to /deals with ?branch=<id>).",
        shows: "Branch name, click to focus the page on that branch.", inputs: `${branches} listed.`,
      }),
      make(bb, "Test-drive booking rate", {
        ...branchCommon, fields: "leads.status_history, leads.branch_id", value: BREAKDOWN,
        codeRef: `stageConversion (${FILE_STAGE}) applied per branch inside ${FILE_PAGE} (stageCohort)`,
        formula: "For that branch's leads that reached contacted: share that also reached test drive. Bar length = rate.",
        shows: "How well each branch turns contacted customers into test drives.",
        inputs: `Company-wide equivalent ${pct(m.bookingRate)} (see Booking rate card).`,
      }),
      make(bb, "Negotiation closing rate", {
        ...branchCommon, fields: "leads.status_history, leads.branch_id", value: BREAKDOWN,
        codeRef: `stageConversion (${FILE_STAGE}) applied per branch inside ${FILE_PAGE} (stageCohort)`,
        formula: "For that branch's leads that reached negotiation: share that also reached order placed. Bar length = rate.",
        shows: "How well each branch turns negotiations into orders.",
        inputs: `Company-wide equivalent ${pct(m.closingRate)} (see Closing rate card).`,
      }),
      make(bb, "Weakest (chip)", {
        ...branchCommon, fields: "leads.status_history", value: NA,
        codeRef: `NO MATCHING FUNCTION (calculated inside ${FILE_PAGE}, weakestBooking / weakestClosing reducers)`,
        formula: "The branch with the lowest non-empty rate in each column gets the Weakest chip and a highlighted cell; the first branch wins a tie; branches with no rate are ignored.",
        shows: "Points to the branch that is behind in that step.",
        inputs: "Not available from a shared function. Note: it is awarded even to a branch with a tiny sample.",
      }),
      make(bb, "Small sample (chip)", {
        ...branchCommon, fields: "leads.status_history", value: NA,
        codeRef: `NO MATCHING FUNCTION (calculated inside ${FILE_PAGE}, BranchRate)`,
        formula: `A rate gets the Small sample chip when the branch has fewer than ${num(THRESHOLDS.minLeadsForStageRate)} leads that reached the starting stage (contacted for booking, negotiation for closing).`,
        shows: "Warns that the rate rests on too few customers to trust.",
        inputs: `Threshold ${num(THRESHOLDS.minLeadsForStageRate)} (THRESHOLDS.minLeadsForStageRate, lib/config.ts). Hover text lists the number of observations.`,
      }),
    );

    // ---------- Step 4 card
    const s4 = "Card: Step 4 · Negotiation → Order";
    const closingSentence = `Closing rate: ${m.closingRate === null ? "—" : pct(m.closingRate)} · Typical time to close: ${d1(m.closingTime.medianDays)} · ${formatCurrency(D.negotiationLost.value)} lost at this stage.`;
    rows.push(
      make(s4, "Summary sentence (Closing rate · Typical time to close · lost)", {
        level: company, across: "leads in view", fields: "leads.status_history, leads.status, leads.deal_value",
        filters: FILTERS_PROGRESSION, value: closingSentence,
        codeRef: `${refMetrics}; lostAtStage (${FILE_STAGE}); sentence built in ${FILE_SECTION}`,
        formula: "Joins the closing rate, the median days from negotiation to order (one decimal) and the total deal value of leads lost at negotiation.",
        shows: "One-line summary of how well negotiations turn into orders and what is lost.",
        inputs: `Closing rate ${pct(m.closingRate)}; median ${d1(m.closingTime.medianDays)}; ${num(D.negotiationLost.count)} deals lost worth ${cur(D.negotiationLost.value)}.`,
      }),
      make(s4, "Time stats: 75th percentile", {
        level: company, across: `${num(m.closingTime.count)} leads that reached both stages`, fields: "leads.status_history",
        filters: FILTERS_PROGRESSION, value: d1(m.closingTime.percentile75Days),
        codeRef: `${refMetrics} → closingTime.percentile75Days via timeToNextStage (${FILE_STAGE})`,
        formula: "Sort the days from negotiation to order, take the value at rank ceil(0.75 × n). This is the overdue threshold; typical time is the median.",
        shows: "The negotiation length beyond which a deal counts as overdue.",
        inputs: `Median ${d1(m.closingTime.medianDays)}; 75th percentile ${d1(m.closingTime.percentile75Days)}; n = ${num(m.closingTime.count)}.`,
      }),
    );
    rows.push(...waitingTable("Table: Open negotiations", "negotiation", "negotiation", "leads that reached negotiation and order placed", m.closingOpenRows, m.closingOverdueRows, m.closingTime));

    const s4Loss = "Table: Why deals fall through at negotiation";
    const topReason = D.negotiationLost.reasons[0];
    const negLossCommon = {
      level: "Reason", across: `${num(D.negotiationLost.reasons.length)} reasons`, filters: FILTERS_PROGRESSION,
      value: BREAKDOWN, codeRef: `lostAtStage → reasons (${FILE_STAGE})`,
    };
    rows.push(
      make(s4Loss, "Reason", {
        ...negLossCommon, fields: "leads.status, leads.lost_reason, leads.status_history",
        formula: "Leads that are lost whose last non-lost status was negotiation, grouped by lost reason (blank = Uncategorized), most deals first, then most rupees.",
        shows: "The reasons customers walk away during negotiation.",
        inputs: `${num(D.negotiationLost.count)} lost deals; top reason ${topReason ? `${topReason.reason} (${num(topReason.count)} deals)` : "none"}.`,
      }),
      make(s4Loss, "Deals", {
        ...negLossCommon, fields: "leads.lost_reason",
        formula: "Number of lost negotiation leads in each reason group.", shows: "How many deals were lost for each reason.",
        inputs: `Total ${num(D.negotiationLost.count)} deals.`,
      }),
      make(s4Loss, "₹ lost", {
        ...negLossCommon, fields: "leads.deal_value",
        formula: "Sum of deal value of the leads in each reason group.", shows: "Rupees lost for each reason.",
        inputs: `Total ${cur(D.negotiationLost.value)}.`,
      }),
      make(s4Loss, "Action (Controllable / Uncategorized chip)", {
        ...negLossCommon, fields: "leads.lost_reason",
        formula: `Controllable when the lower-cased reason (underscores as spaces) is one of: ${CONTROLLABLE_LOSS_REASONS.join(", ")}; otherwise Uncategorized.`,
        shows: "Whether the dealership could have prevented the loss.",
        inputs: `Rule from isControllable (${FILE_STAGE}) using CONTROLLABLE_LOSS_REASONS (lib/config.ts).`,
      }),
    );

    // ---------- Overdue deals table
    const od = "Table: Open deals past expected close date";
    const takeaway = `${num(D.overdue.length)} overdue deals · ${cur(D.overdueUnordered.value)} unordered · ${NA} ordered. Overdue means an open deal's expected close date is before the dataset as-of date.`;
    const odCommon = {
      level: "Customer", across: `${num(D.overdue.length)} overdue deals`, filters: FILTERS_OVERDUE, value: BREAKDOWN,
      codeRef: `overdueOpen (${FILE_DELIVERY}); list built in ${FILE_PAGE}`,
    };
    rows.push(
      make(od, "Summary: overdue deals count", {
        level: company, across: "open leads (pre-order stages or order placed)", fields: "leads.expected_close_date, leads.status",
        filters: FILTERS_OVERDUE, value: num(D.overdue.length),
        codeRef: `overdueOpen (${FILE_DELIVERY})`,
        formula: `Leads whose latest status is new, contacted, test drive, negotiation or order placed and whose expected close day (UTC) is earlier than the as-of day. A deal due on the as-of day is not overdue; leads with no expected close date are never overdue.`,
        shows: "How many open deals should already have closed.",
        inputs: `${num(D.overdue.length)} leads. Pre-order stages: ${PRE_ORDER_STAGES.join(", ")}; plus ${ORDER_STAGE}.`,
      }),
      make(od, "Summary: unordered value", {
        level: company, across: "overdue deals not yet ordered", fields: "leads.deal_value, leads.status",
        filters: FILTERS_OVERDUE, value: cur(D.overdueUnordered.value),
        codeRef: `inProgressPipeline (${FILE_STAGE}) on the overdueOpen list; page sums it inline (overdueUnorderedValue, ${FILE_PAGE})`,
        formula: "Sum of deal value of overdue deals still in a pre-order stage (unordered: the rep still has to win the sale).",
        shows: "Rupees at risk in deals that are late and have no order yet.",
        inputs: `${cur(D.overdueUnordered.value)} across ${num(D.overdueUnordered.count)} unordered overdue deals (equals the page's inline sum because the filter is the same).`,
      }),
      make(od, "Summary: ordered value", {
        level: company, across: "overdue deals with an order placed", fields: "leads.deal_value, leads.status",
        filters: FILTERS_OVERDUE, value: NA,
        codeRef: `NO MATCHING FUNCTION (calculated inside ${FILE_PAGE}, overdueOrderedValue)`,
        formula: "Sum of deal value of overdue deals whose status is order placed (ordered: the car is not delivered yet).",
        shows: "Rupees tied up in ordered cars that are late to be delivered.",
        inputs: `Total overdue deals ${num(D.overdue.length)}, of which ${num(D.overdueUnordered.count)} unordered; ordered total has no shared function.`,
      }),
      make(od, "Branch", {
        ...odCommon, fields: "branches.name", formula: "Branch of the overdue lead.",
        shows: "Which showroom owns the late deal.", inputs: "Plain field, no calculation.",
        codeRef: "NO CALCULATION (field lookup, lib/data/normalize.ts)",
      }),
      make(od, "Customer", {
        ...odCommon, fields: "leads.customer_name",
        formula: "Customer of the overdue lead; the row links to Lead Explorer for this lead. Sorted by days overdue (most first), then deal value, then name.",
        shows: "Which customer is late.", inputs: "Plain field, no calculation.",
        codeRef: "NO CALCULATION (field lookup, lib/data/normalize.ts)",
      }),
      make(od, "Representative", {
        ...odCommon, fields: "leads.assigned_to, sales_reps.name", formula: "Rep the lead is assigned to.",
        shows: "Who should chase the customer.", inputs: "Plain field, no calculation.",
        codeRef: "NO CALCULATION (field lookup, lib/data/normalize.ts)",
      }),
      make(od, "Latest status", {
        ...odCommon, fields: "leads.status_history", formula: "Latest status in the history, underscores shown as spaces.",
        shows: "Where the deal currently stands.", inputs: "Plain field, no calculation.",
        codeRef: "NO CALCULATION (field lookup, lib/data/normalize.ts)",
      }),
      make(od, "Expected close date", {
        ...odCommon, fields: "leads.expected_close_date", formula: "Expected close date from the dealership data (UTC day); — if missing.",
        shows: "The date the deal was supposed to close.", inputs: "Plain field, no calculation.",
        codeRef: "NO CALCULATION (field lookup, lib/data/normalize.ts)",
      }),
      make(od, "Days overdue", {
        ...odCommon, fields: "leads.expected_close_date", value: NA,
        codeRef: `NO MATCHING FUNCTION (calculated inside ${FILE_PAGE}, overdueDeals flatMap daysOverdue)`,
        formula: "Whole UTC calendar days between the expected close day and the as-of day (as-of day − expected close day).",
        shows: "How late the deal is.", inputs: `Applied to the ${num(D.overdue.length)} overdue deals.`,
      }),
      make(od, "Last activity", {
        ...odCommon, fields: "leads.last_activity_at", formula: "UTC day of the lead's last recorded activity.",
        shows: "When anyone last touched this deal.", inputs: "Plain field, no calculation.",
        codeRef: "NO CALCULATION (field lookup, lib/data/normalize.ts)",
      }),
      make(od, "Deal value", {
        ...odCommon, fields: "leads.deal_value", formula: "Expected sale value of the lead.",
        shows: "Rupees at stake in this late deal.", inputs: "Plain field, no calculation.",
        codeRef: "NO CALCULATION (field lookup, lib/data/normalize.ts)",
      }),
      make(od, "Takeaway sentence", {
        level: company, across: "open leads", fields: "leads.expected_close_date, leads.status, leads.deal_value",
        filters: FILTERS_OVERDUE, value: takeaway,
        codeRef: `overdueOpen (${FILE_DELIVERY}); inProgressPipeline (${FILE_STAGE}); sentence built in ${FILE_PAGE}`,
        formula: "'N overdue deals · ₹ unordered · ₹ ordered' followed by the overdue definition.",
        shows: "One-line size of the late-deals problem split by ordered and not ordered.",
        inputs: `${num(D.overdue.length)} overdue; ${cur(D.overdueUnordered.value)} unordered; ordered amount has no shared function.`,
      }),
    );

    // ---------- Drawer
    rows.push(
      make("Panel: Status history drawer", "Status history", {
        level: "Customer", across: "one lead at a time", fields: "leads.status_history",
        filters: "None (opens from a clicked waiting-list row)", value: BREAKDOWN,
        codeRef: `NO CALCULATION (lists lead.history, ${FILE_SECTION})`,
        formula: "Every status change of the chosen lead in time order with its date and note.",
        shows: "The full journey of one customer through the stages.",
        inputs: "Plain list of events, no calculation.",
      }),
    );

    return rows;
  },
  flags: (ctx): FlaggedMetric[] => {
    const D = dealsData(ctx.ds, ctx.filters);
    return [
      {
        page: PAGE, label: "Lost before a test drive", where: "Table: Lost before a test drive",
        note: "Computed inline in lostBeforeTestDrive (components/deal-progression-section.tsx). It is not the same as lostAtStage(…, 'contacted') in lib. It has no shared function.",
      },
      {
        page: PAGE, label: "Weakest / Small sample chips", where: "Table: By branch",
        note: "Weakest-branch selection and the small-sample rule are computed inside components/deals-page.tsx. By-branch rates also use a local stageCohort copy, not a lib function.",
      },
      {
        page: PAGE, label: "Due chip", where: "Tables: Waiting for a test drive, Open negotiations",
        note: "Calculated inline (days waiting greater than the median). No shared function counts them.",
      },
      {
        page: PAGE, label: "Average order", where: "KPI card: Orders won",
        note: "orderValue ÷ orderCount is divided inside components/deal-progression-section.tsx; no lib function.",
      },
      {
        page: PAGE, label: "Days overdue and ordered overdue value", where: "Table: Open deals past expected close date",
        note: `Days overdue and the ordered total are calculated inside components/deals-page.tsx. ${num(D.overdue.length)} overdue deals at full period.`,
      },
      {
        page: PAGE, label: "Overdue (two meanings)", where: "Stage KPI cards and chips vs the overdue deals table",
        note: "'Overdue' means longer than the 75th percentile of stage time on the cards and chips, but means expected close date before the as-of day in the last table. The Orders won 'Test drive → order' card also counts orders from all leads while its rate only counts leads that reached test drive.",
      },
      {
        page: PAGE, label: "Typical time rounding", where: "Step 2/Step 4 sentences vs KPI cards",
        note: "Sentences show typical days with one decimal; KPI cards round to whole days. The 'closed' lift and lost lists narrow by a date range only on the event basis, while the cards use created-date scoping first.",
      },
    ];
  },
};
