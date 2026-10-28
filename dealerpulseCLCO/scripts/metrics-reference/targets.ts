import { DELIVERED_STAGE, ORDER_STAGE, THRESHOLDS } from "../../lib/config.ts";
import { deliverySectionData, medianDaysToDeliver } from "../../lib/metrics/delivery.ts";
import { toMonth } from "../../lib/dates.ts";
import { DAY } from "../../lib/metrics/stats.ts";
import { filterLeads } from "../../lib/metrics/filters.ts";
import { attainment } from "../../lib/metrics/targets.ts";
import type { Ctx, FlaggedMetric, MetricRow, PageModule } from "./types.ts";
import { cur, days, num, pct } from "./types.ts";

const page = "Targets & Revenue";
const targetFilters = "Date range: target month range; branch: applied to targets; source/model: applied to actual orders only; basis: ignored (orders use order date); rep: ignored. The table also has local branch and month selections (default all).";
const meterFilters = "Date range: order/delivery event date for actuals and target month range for target totals; branch applies to targets and leads; source/model apply to actual leads only; basis and rep are ignored.";
const progressFilters = "Date range: targets use target-month range and actuals use order date; branch applies to targets and leads; source/model apply to actual orders only; basis and rep are ignored.";
const cohortFilters = "Date range: lead creation date; branch/source/model: applied; basis: forced to created; rep: ignored.";
const modelFilters = "Date range: created date on created basis, or delivery date on event basis; branch/source/model: applied; rep: ignored.";
const NO_FUNCTION = (local: string) => `NO MATCHING FUNCTION (calculated inside components/sales-page.tsx, ${local})`;

function row(
  section: string,
  label: string,
  level: MetricRow["level"],
  across: string,
  fields: string,
  filters: string,
  value: string,
  codeRef: string,
  formula: string,
  shows: string,
  inputs: string,
): MetricRow {
  return { section, label, level, across, fields, filters, value, codeRef, formula, shows, inputs };
}

function sourceData(ctx: Ctx) {
  const targets = attainment(ctx.ds, ctx.filters, "orders");
  const delivered = deliverySectionData(ctx.ds, ctx.filters);
  const targetUnits = targets.rows.reduce((sum, item) => sum + item.targetUnits, 0);
  const targetRevenue = targets.rows.reduce((sum, item) => sum + item.targetRevenue, 0);
  const orderUnits = targets.rows.reduce((sum, item) => sum + item.units, 0);
  const orderRevenue = targets.rows.reduce((sum, item) => sum + item.revenue, 0);
  return { targets, delivered, targetUnits, targetRevenue, orderUnits, orderRevenue };
}

function rows(ctx: Ctx): MetricRow[] {
  const data = sourceData(ctx);
  const branches = `${num(ctx.ds.branches.length)} branches`;
  const targetMonths = `${num(ctx.ds.targets.length)} branch-month target rows`;
  const t = data.targets.rows;
  const deliveredCount = data.delivered.deliveredCount;
  const deliveredRevenue = data.delivered.scorecardTotals.revenueDelivered;
  const targetUnits = data.targetUnits;
  const targetRevenue = data.targetRevenue;
  const orderUnits = data.orderUnits;
  const orderRevenue = data.orderRevenue;
  const overallBookedRate = targetRevenue ? orderRevenue / targetRevenue : null;
  const createdLeads = filterLeads(ctx.ds, { ...ctx.filters, timeBasis: "created" });
  const cycleDays = medianDaysToDeliver(createdLeads);
  const trendMonths = new Set([...ctx.ds.months, ...createdLeads.map((lead) => toMonth(lead.createdAt))]).size;
  const deliveredByModel = new Map<string, { revenue: number; deliveries: number }>();
  for (const lead of filterLeads(ctx.ds, ctx.filters).filter((lead) => lead.status === DELIVERED_STAGE && lead.delivery !== null &&
    (ctx.filters.timeBasis !== "event" ||
      (ctx.filters.from === null || lead.delivery.deliveredAt >= ctx.filters.from) &&
      (ctx.filters.to === null || lead.delivery.deliveredAt <= ctx.filters.to)))) {
    const item = deliveredByModel.get(lead.model) ?? { revenue: 0, deliveries: 0 };
    item.revenue += lead.dealValue;
    item.deliveries += 1;
    deliveredByModel.set(lead.model, item);
  }
  const modelRows = [...deliveredByModel].map(([model, item]) => ({ model, ...item }))
    .sort((left, right) => right.revenue - left.revenue || left.model.localeCompare(right.model));
  const modelRevenue = modelRows.reduce((sum, item) => sum + item.revenue, 0);
  const topTwoShare = modelRevenue
    ? modelRows.slice(0, 2).reduce((sum, item) => sum + item.revenue, 0) / modelRevenue
    : 0;
  const modelTakeaway = `Top 2 models account for ${pct(topTwoShare)} of delivered revenue.`;
  const matureCohortTakeaway = (() => {
    const months = [...new Set([...ctx.ds.months, ...createdLeads.map((lead) => toMonth(lead.createdAt))])].sort();
    const cohorts = months.map((month) => {
      const [year, monthNumber] = month.split("-").map(Number);
      const end = Date.UTC(year!, monthNumber!, 0, 23, 59, 59, 999);
      const cohort = createdLeads.filter((lead) => toMonth(lead.createdAt) === month);
      const orders = cohort.filter((lead) => lead.reached[ORDER_STAGE] !== null).length;
      const stillMaturing = cycleDays !== null && ctx.ds.asOf - end < cycleDays * DAY;
      return { month, cohortCount: cohort.length, orders, rate: cohort.length ? orders / cohort.length : null, stillMaturing };
    }).filter((item) => !item.stillMaturing && item.rate !== null);
    if (!cohorts.length) return "No mature lead cohorts are available to compare by order rate.";
    const formatMonth = (month: string) => new Intl.DateTimeFormat("en", { month: "short", year: "numeric", timeZone: "UTC" })
      .format(new Date(`${month}-01T00:00:00.000Z`));
    const high = cohorts.reduce<typeof cohorts[number] | null>((best, item) =>
      best === null || item.rate! > best.rate! ? item : best, null)!;
    const low = cohorts.reduce<typeof cohorts[number] | null>((best, item) =>
      best === null || item.rate! < best.rate! ? item : best, null)!;
    return `Among mature cohorts, ${formatMonth(high.month)} has the highest order rate (${pct(high.rate!)}); ${formatMonth(low.month)} has the lowest (${pct(low.rate!)}).`;
  })();
  const orderInputs = `${num(orderUnits)} orders and ${cur(orderRevenue)} booked revenue across target branch-months; target function ${num(targetUnits)} units / ${cur(targetRevenue)}.`;
  const deliveryInputs = `${num(deliveredCount)} delivered cars and ${cur(deliveredRevenue)} delivered revenue from deliverySectionData; target totals ${num(targetUnits)} units / ${cur(targetRevenue)} from attainment.`;

  return [
    row("Cumulative target meters", "Orders booked vs target units", "Company", branches,
      "targets.units; leads.reached.order_placed", meterFilters,
      "n/a - no shared function", NO_FUNCTION("cumulativeMeters"),
      "Count leads that reached order_placed within the selected order-date range and divide by target units for the selected branch-months; show the count, achieved share, and target gap.",
      "This compares the number of cars ordered with the unit target.",
      `Target denominator from attainment(): ${num(targetUnits)} units. The page's actual order count and its share/gap are calculated inline; ${orderInputs}`),
    row("Cumulative target meters", "Revenue booked vs target revenue", "Company", branches,
      "targets.revenue; leads.deal_value; leads.reached.order_placed", meterFilters,
      "n/a - no shared function", NO_FUNCTION("cumulativeMeters"),
      "Sum deal value for orders reached within the selected order-date range, then divide by the selected branch-month revenue target.",
      "This compares the value of ordered cars with the revenue target.",
      `Target denominator from attainment(): ${cur(targetRevenue)}. Page-specific order revenue and its share/gap are inline-only; ${orderInputs}`),
    row("Cumulative target meters", "Cars delivered vs target units", "Company", branches,
      "targets.units; leads.status; leads.delivery.delivered_at", meterFilters,
      "n/a - no shared function", NO_FUNCTION("cumulativeMeters"),
      "Count delivered cars by delivery date, divide by target units, and show the difference from target.",
      "This compares delivered cars with the unit target.",
      `${deliveryInputs} The target meter percentage and gap are calculated inline; its displayed count and target are sourced from these exported metric results.`),
    row("Cumulative target meters", "Revenue delivered vs target revenue", "Company", branches,
      "targets.revenue; leads.deal_value; leads.delivery.delivered_at", meterFilters,
      "n/a - no shared function", NO_FUNCTION("cumulativeMeters"),
      "Sum deal value for cars delivered in the delivery-date range, divide by target revenue, and show the revenue gap.",
      "This compares the value of delivered cars with the revenue target.",
      `${deliveryInputs} The target meter percentage and gap are calculated inline; its displayed delivered revenue and target are sourced from these exported metric results.`),
    row("Cumulative target meters", "Targets look high relative to actual sales across all branches", "Company", branches,
      "targets.units; targets.revenue; leads.reached.order_placed; leads.delivery.delivered_at", meterFilters,
      "n/a - conditional tooltip", NO_FUNCTION("TargetMeters / attainmentStatus"),
      `Show this tooltip when any meter's attainment is below ${pct(THRESHOLDS.lowAttainmentPct)}; meter status changes at ${pct(THRESHOLDS.recalibrationPct)} and ${pct(THRESHOLDS.lowAttainmentPct)}.`,
      "The tooltip warns that the targets may be too high when actual progress is low.",
      `Thresholds are THRESHOLDS.recalibrationPct = ${pct(THRESHOLDS.recalibrationPct)} and THRESHOLDS.lowAttainmentPct = ${pct(THRESHOLDS.lowAttainmentPct)}; meter attainment values are computed inline.`),

    row("Delivered revenue by model", "Delivered revenue by model", "Model", `${num(modelRows.length)} models with delivered revenue`,
      "leads.model; leads.status; leads.delivery.delivered_at; leads.deal_value", modelFilters,
      "n/a - no shared function", NO_FUNCTION("SalesPage modelRows"),
      "Group delivered leads by model and sum deal value; rank from highest revenue to lowest.",
      "This shows which models account for delivered sales revenue.",
      `deliverySectionData reports ${num(deliveredCount)} total delivered cars and ${cur(deliveredRevenue)} delivered revenue, but does not return the model split.`),
    row("Delivered revenue by model", "Rank", "Model", `${num(modelRows.length)} models with delivered revenue`,
      "leads.model; leads.status; leads.delivery.delivered_at; leads.deal_value", modelFilters,
      "n/a - no shared function", NO_FUNCTION("SalesPage modelRows / RankListCard"),
      "Sort models by delivered revenue from highest to lowest and assign each its list position.",
      "The rank orders models by delivered revenue.",
      "Model list position is computed inline after sorting by delivered revenue."),
    row("Delivered revenue by model", "Delivered revenue share", "Model", `${num(modelRows.length)} models with delivered revenue`,
      "leads.model; leads.status; leads.delivery.delivered_at; leads.deal_value", modelFilters,
      "n/a - no shared function", NO_FUNCTION("SalesPage modelRows"),
      "Divide each model's delivered revenue by delivered revenue across the displayed models.",
      "The share indicates how much of delivered revenue comes from each model.",
      `Total delivered revenue from deliverySectionData is ${cur(deliveredRevenue)}; per-model revenue is calculated inline.`),
    row("Delivered revenue by model", "{count} cars delivered · avg ₹{average} L", "Model", `${num(modelRows.length)} models with delivered revenue`,
      "leads.model; leads.status; leads.delivery.delivered_at; leads.deal_value", modelFilters,
      "n/a - no shared function", NO_FUNCTION("SalesPage modelRows"),
      "Count each model's delivered cars and divide that model's revenue by its delivered-car count; display the average in lakhs.",
      "This shows the average delivered revenue for each model.",
      `Overall delivered count is ${num(deliveredCount)} and delivered revenue is ${cur(deliveredRevenue)} from deliverySectionData; the per-model breakdown is inline-only.`),
    row("Delivered revenue by model", modelTakeaway, "Company", "Top two ranked models",
      "leads.model; leads.status; leads.delivery.delivered_at; leads.deal_value", modelFilters,
      "n/a - no shared function", NO_FUNCTION("SalesPage topTwoModelShare"),
      "Add the revenue shares of the first two models in descending delivered revenue order.",
      "This takeaway summarizes how concentrated delivered revenue is among the two leading models.",
      `Overall delivered revenue is ${cur(deliveredRevenue)} from deliverySectionData; individual model shares and the top-two sum are calculated inline.`),

    row("Order target progress by branch", "Orders vs target", "Branch", branches,
      "targets.units; leads.reached.order_placed", progressFilters,
      "see breakdown sheet", "attainment() — lib/metrics/targets.ts", // percent per branch is identical to attainment()
      "Compare each branch's order count with its target units; the table also shows count, target, and gap.",
      "This shows each branch's progress against its order-volume goal.",
      `attainment() returns branch units and target units: ${t.map((item) => `${item.branchId} ${num(item.units)}/${num(item.targetUnits)}`).join("; ") || "no matching target rows"}.`),
    row("Order target progress by branch", "Orders gap", "Branch", branches,
      "targets.units; leads.reached.order_placed", progressFilters,
      "n/a - no shared function", NO_FUNCTION("OrderTargetProgress"),
      "Subtract branch orders from branch target units.",
      "A positive gap is the remaining number of orders needed to reach target.",
      `Source totals from attainment(): ${num(orderUnits)} orders versus ${num(targetUnits)} target units; the displayed branch gaps are calculated inline.`),
    row("Order target progress by branch", "Revenue booked vs target", "Branch", branches,
      "targets.revenue; leads.deal_value; leads.reached.order_placed", progressFilters,
      "see breakdown sheet", "attainment() — lib/metrics/targets.ts",
      "Compare each branch's booked order revenue with its target revenue; the table also shows amount and gap.",
      "This shows each branch's progress against its booked-revenue goal.",
      `attainment() returns branch revenue and target revenue: ${t.map((item) => `${item.branchId} ${cur(item.revenue)}/${cur(item.targetRevenue)}`).join("; ") || "no matching target rows"}.`),
    row("Order target progress by branch", "Revenue gap", "Branch", branches,
      "targets.revenue; leads.deal_value; leads.reached.order_placed", progressFilters,
      "n/a - no shared function", NO_FUNCTION("OrderTargetProgress"),
      "Subtract booked order revenue from branch target revenue.",
      "A positive gap is the remaining revenue needed to reach target.",
      `Source totals from attainment(): ${cur(orderRevenue)} booked versus ${cur(targetRevenue)} target; the displayed branch gaps are calculated inline.`),
    row("Order target progress by branch", "Orders and booked revenue against each branch's target.", "Branch", branches,
      "targets.units; targets.revenue; leads.reached.order_placed; leads.deal_value", progressFilters,
      "Orders and booked revenue against each branch's target.", "components/sales-page.tsx — OrderTargetProgress CardHeader",
      "Fixed explanatory sentence describing the branch target comparison.",
      "The note explains that the table compares orders and booked revenue with each branch's target.",
      `${orderInputs}`),

    row("Monthly lead cohort chart", "Leads", "Month", `${num(trendMonths)} lead-creation months in the cohort scope`,
      "leads.created_at", cohortFilters,
      "n/a - no shared function", NO_FUNCTION("buildTrend"),
      "Count leads created in each month; bar opacity is reduced when the month is still maturing.",
      "This bar shows how many leads came in during each month.",
      `filterLeads() returned ${num(createdLeads.length)} created-basis leads; exact month-by-month counts are computed in buildTrend.`),
    row("Monthly lead cohort chart", "Orders placed", "Month", `${num(trendMonths)} lead-creation months in the cohort scope`,
      "leads.created_at; leads.reached.order_placed", cohortFilters,
      "n/a - no shared function", NO_FUNCTION("buildTrend"),
      "For each lead-creation month, count cohort leads that ever reached order_placed.",
      "This bar shows how many leads from each intake month eventually placed an order.",
      `filterLeads() returned ${num(createdLeads.length)} created-basis leads; exact cohort order counts are computed in buildTrend.`),
    row("Monthly lead cohort chart", "Delivered", "Month", `${num(trendMonths)} lead-creation months in the cohort scope`,
      "leads.created_at; leads.status; leads.delivery", cohortFilters,
      "n/a - no shared function", NO_FUNCTION("buildTrend"),
      "For each lead-creation month, count cohort leads whose current status is delivered and that have a delivery record.",
      "This bar shows how many leads from each intake month have been delivered.",
      `filterLeads() returned ${num(createdLeads.length)} created-basis leads; exact cohort delivery counts are computed in buildTrend.`),
    row("Monthly lead cohort chart", "{whole-number order rate}% ordered", "Month", `${num(trendMonths)} lead-creation months in the cohort scope`,
      "leads.created_at; leads.reached.order_placed", cohortFilters,
      "n/a - no shared function", NO_FUNCTION("buildTrend trendOption label formatter"),
      "Divide orders from a lead-creation cohort by the leads in that cohort; display as a whole-percent label on the leads bar.",
      "This label shows the share of each monthly lead group that placed an order.",
      `Total created-basis leads from filterLeads() is ${num(createdLeads.length)}; the cohort denominators and order rates are calculated inline.`),
    row("Monthly lead cohort chart", "Still maturing", "Month", `${num(trendMonths)} lead-creation months in the cohort scope`,
      "leads.created_at; leads.delivery.days_to_deliver; dataset.asOf", cohortFilters,
      "n/a - no shared function", NO_FUNCTION("buildTrend"),
      "Mark a cohort as still maturing when the time from the end of its month to dataset.asOf is less than the median delivery cycle.",
      "A faded cohort is still recent relative to the typical time needed to deliver a car.",
      `medianDaysToDeliver(filterLeads(...created basis...)) = ${days(cycleDays)}; per-month maturity flags are computed inline.`),
    row("Monthly lead cohort chart", matureCohortTakeaway, "Month", `${num(trendMonths)} lead-creation months in the cohort scope`,
      "leads.created_at; leads.reached.order_placed; leads.delivery.days_to_deliver", cohortFilters,
      "n/a - dynamic takeaway", NO_FUNCTION("buildTrend takeaway"),
      "When mature cohorts exist, name the highest and lowest cohort order rates; otherwise show this sentence.",
      "The chart compares order rates only for cohorts old enough to have matured.",
      `Median delivery-cycle benchmark is ${days(cycleDays)} from medianDaysToDeliver(); highest/lowest cohort comparison is calculated inline.`),

    row("Target vs actual by branch and month", "Target units", "Month", targetMonths,
      "targets.units", targetFilters,
      "see breakdown sheet", NO_FUNCTION("monthlyTargetRows"),
      "Show target units for each branch-month; the footer adds the rows that remain after local table filters.",
      "This is the unit goal for each branch and month.",
      `Full-period target units summed from attainment() branch rows: ${num(targetUnits)}.`),
    row("Target vs actual by branch and month", "Orders", "Month", targetMonths,
      "leads.reached.order_placed; targets.branch_id; targets.month", targetFilters,
      "n/a - no shared function", NO_FUNCTION("monthlyTargetRows"),
      "Count leads that reached order_placed within the selected order-date range and whose order month matches the target row.",
      "This is the number of orders booked against each monthly target.",
      `attainment() aggregates ${num(orderUnits)} orders across target branch-months; the displayed month-level counts are calculated inline.`),
    row("Target vs actual by branch and month", "Target revenue", "Month", targetMonths,
      "targets.revenue", targetFilters,
      "see breakdown sheet", NO_FUNCTION("monthlyTargetRows"),
      "Show target revenue for each branch-month; the footer adds the rows that remain after local table filters.",
      "This is the revenue goal for each branch and month.",
      `Full-period target revenue summed from attainment() branch rows: ${cur(targetRevenue)}.`),
    row("Target vs actual by branch and month", "Actual revenue", "Month", targetMonths,
      "leads.deal_value; leads.reached.order_placed; targets.branch_id; targets.month", targetFilters,
      "n/a - no shared function", NO_FUNCTION("monthlyTargetRows"),
      "Sum deal value for leads that reached order_placed in the target month and selected order-date range.",
      "This is the booked deal value credited to each monthly target.",
      `attainment() aggregates ${cur(orderRevenue)} booked revenue across target branch-months; the displayed month-level revenue is calculated inline.`),
    row("Target vs actual by branch and month", "Pacing", "Month", targetMonths,
      "targets.revenue; leads.deal_value; leads.reached.order_placed", targetFilters,
      "n/a - no shared function", NO_FUNCTION("monthlyTargetRows / MonthlyTargetTable renderPacing"),
      "Divide actual order revenue by target revenue; show a status chip and cap the progress bar visually at 100%.",
      "Pacing shows how much of the monthly revenue goal has been booked.",
      `attainment() gives total booked revenue ${cur(orderRevenue)} and target revenue ${cur(targetRevenue)} (overall ratio ${pct(overallBookedRate)}); monthly pacing and status chips are calculated inline. Thresholds: ${pct(THRESHOLDS.recalibrationPct)} recalibration and ${pct(THRESHOLDS.lowAttainmentPct)} low-attainment.`),
    row("Target vs actual by branch and month", "Pacing status chip", "Month", targetMonths,
      "targets.revenue; leads.deal_value; leads.reached.order_placed", targetFilters,
      "n/a - no shared function", NO_FUNCTION("MonthlyTargetTable renderPacing"),
      `The chip reads No target for null pacing, On target at or above 100%, Below threshold below ${pct(THRESHOLDS.recalibrationPct)}, Watch below ${pct(THRESHOLDS.lowAttainmentPct)}, and In progress otherwise.`,
      "The chip gives a short status for each month's revenue progress.",
      `THRESHOLDS.recalibrationPct = ${pct(THRESHOLDS.recalibrationPct)}; THRESHOLDS.lowAttainmentPct = ${pct(THRESHOLDS.lowAttainmentPct)}. The rendered status is chosen inline.`),
    row("Target vs actual by branch and month", "Totals", "Company", "All branches and target months", // footer row contains all four totals and total pacing
      "targets.units; targets.revenue; leads.reached.order_placed; leads.deal_value", targetFilters,
      "n/a - no shared function", NO_FUNCTION("MonthlyTargetTable totals and renderPacing"),
      "Add target units, order counts, target revenue, and actual revenue across the filtered table; calculate total pacing from actual divided by target revenue.",
      "The footer summarizes the selected monthly rows and their combined revenue pacing.",
      `Unfiltered reference totals from attainment(): ${num(targetUnits)} target units, ${num(orderUnits)} orders, ${cur(targetRevenue)} target revenue, ${cur(orderRevenue)} booked revenue; the table footer recomputes these over its local branch/month selection.`),
    row("Target vs actual by branch and month", "Branch filter chip", "Branch", branches,
      "targets.branch_id; branches.name", "Local branch selection only; not a calculation or global page filter.",
      "n/a - UI filter chip", NO_FUNCTION("MonthlyTargetTable local filter chips"),
      "When a table branch filter is active, show each selected branch name or No branches; Clear all resets local selections.",
      "These chips show which branches are included in the monthly table.",
      "The selected branch names are UI state; no shared metric function returns them."),
    row("Target vs actual by branch and month", "Month filter chip", "Month", targetMonths,
      "targets.month", "Local month selection only; not a calculation or global page filter.",
      "n/a - UI filter chip", NO_FUNCTION("MonthlyTargetTable local filter chips"),
      "When a table month filter is active, show each selected month; Clear all resets local selections.",
      "These chips show which target months are included in the monthly table.",
      "The selected month values are UI state; no shared metric function returns them."),
    row("Target vs actual by branch and month", "Pacing compares booked order revenue with target revenue; actual revenue is based on order dates.", "Month", targetMonths,
      "targets.revenue; leads.deal_value; leads.reached.order_placed", targetFilters,
      "Pacing compares booked order revenue with target revenue; actual revenue is based on order dates.", "components/sales-page.tsx — MonthlyTargetTable CardHeader",
      "Fixed explanatory sentence describing monthly pacing and its order-date basis.",
      "The note clarifies that actual revenue is credited by order date.",
      `${orderInputs}`),
  ];
}

function flags(ctx: Ctx): FlaggedMetric[] {
  const pageRows = rows(ctx);
  const modelTakeaway = pageRows.find((item) => item.section === "Delivered revenue by model" && item.level === "Company")!.label;
  const cohortTakeaway = pageRows.find((item) => item.section === "Monthly lead cohort chart" && item.codeRef === NO_FUNCTION("buildTrend takeaway"))!.label;
  const items: [string, string, string][] = [
    ["Orders booked vs target units", "cumulativeMeters", "Actual order count, attainment percentage, and gap are computed in the page component; attainment() only returns order totals for target branch-months."],
    ["Revenue booked vs target revenue", "cumulativeMeters", "Booked revenue attainment meter is calculated in the page component; attainment() only includes target branch-months."],
    ["Cars delivered vs target units", "cumulativeMeters", "The percentage and gap are inline; deliverySectionData() and attainment() supply the base totals but no matching meter function exists."],
    ["Revenue delivered vs target revenue", "cumulativeMeters", "The percentage and gap are inline; deliverySectionData() and attainment() supply the base totals but no matching meter function exists."],
    ["Targets look high relative to actual sales across all branches", "TargetMeters / attainmentStatus", "Conditional tooltip and status selection are inline; the threshold constants are imported from lib/config.ts."],
    ["Rank", "SalesPage modelRows / RankListCard", "Rank numbers are the list positions after sorting models by delivered revenue."],
    ["Delivered revenue by model", "SalesPage modelRows", "Per-model revenue and ranking are calculated inline; no exported library function returns the model revenue split."],
    ["Delivered revenue share", "SalesPage modelRows", "Per-model share is calculated inline; no exported library function returns the split."],
    ["{count} cars delivered · avg ₹{average} L", "SalesPage modelRows", "Per-model counts and average revenue are calculated inline."],
    [modelTakeaway, "SalesPage topTwoModelShare", "Top-two share and dynamic takeaway are calculated inline."],
    ["Orders gap", "OrderTargetProgress", "Branch order gaps are calculated inline by subtracting actual from target."],
    ["Revenue gap", "OrderTargetProgress", "Branch revenue gaps are calculated inline by subtracting actual from target."],
    ["Leads", "buildTrend", "Cohort counts are computed inline; filterLeads() is only the shared input selector."],
    ["Orders placed", "buildTrend", "Cohort order counts are computed inline."],
    ["Delivered", "buildTrend", "Cohort delivery counts are computed inline."],
    ["{whole-number order rate}% ordered", "buildTrend trendOption label formatter", "Per-cohort order rates are computed inline."],
    ["Still maturing", "buildTrend", "Per-cohort maturity state is computed inline using medianDaysToDeliver() and dataset.asOf."],
    [cohortTakeaway, "buildTrend takeaway", "Highest/lowest mature cohort rates and the conditional takeaway are computed inline."],
    ["Target units", "monthlyTargetRows", "Target units are read from inline monthly target rows; there is no shared month-level function."],
    ["Target revenue", "monthlyTargetRows", "Target revenue is read from inline monthly target rows; there is no shared month-level function."],
    ["Orders", "monthlyTargetRows", "Per-target-month order counts use inline filtering; attainment() only supplies a branch-level aggregate."],
    ["Actual revenue", "monthlyTargetRows", "Per-target-month revenue uses inline filtering; attainment() only supplies a branch-level aggregate."],
    ["Pacing", "monthlyTargetRows / MonthlyTargetTable renderPacing", "Per-month ratio, status, and bar display are inline."],
    ["Pacing status chip", "MonthlyTargetTable renderPacing", "Text chip labels are selected inline using imported attainment thresholds."],
    ["Totals", "MonthlyTargetTable totals", "Totals are recomputed inline over locally selected branch/month rows."],
    ["Branch filter chip", "MonthlyTargetTable local filter chips", "Chip labels are rendered from local UI state, not a shared metric function."],
    ["Month filter chip", "MonthlyTargetTable local filter chips", "Chip labels are rendered from local UI state, not a shared metric function."],
  ];
  return items.map(([label, local, note]) => ({
    page,
    label,
    where: `components/sales-page.tsx — ${local}`,
    note,
  }));
}

export const targetsPage: PageModule = {
  sheetName: "Targets & Revenue",
  note: "The /targets and /sales routes render SalesPage. This page applies date, branch, source, model, and basis query parameters, but does not read rep; individual sections use different date bases as described per row. Values use the full-period context with no filters.",
  rows,
  flags,
};















