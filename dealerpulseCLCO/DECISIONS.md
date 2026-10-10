# Decisions and product notes

## What I built and why

DealerPulse turns dealership lead, order, delivery, target, and leads source data into an executive overview, branch comparisons, section insights, and a filtered lead list. The Overview uses five KPIs, a deterministic business verdict, a per-section insight digest, target progress bars, and a ranked branch table. A normalized dataset feeds pure metric functions so calculations stay testable and consistent.

Priority alerts and strategic insights are gathered at the bottom of the Overview ("What to do first", Key insight, Watch, What's working), not on the section pages; per-page alerts are a next step scope. Tables are the primary comparison surface. Charts are limited to one permitted simple visualization on sections where shape adds value.

**Mandatory minimum —**

**Overview dashboard:** business KPIs, status, and key insights on the Overview.
**Drill-down:** users can move into branch, representative, team, and lead views.
**Actionable insights:** the project surfaces follow-up risks, delivery backlog, and performance gaps.
**Filtering/time range:** dashboard filters let users slice the data, and drill-down links carry the selected filters.
**Responsive design**: layouts adapt for narrower screens, with touch-friendly controls and responsive tables/charts.

**Optional directions**

**Lead aging and follow-up alerts** —  The project tracks cold pre-order leads, overdue leads, and orders awaiting delivery.
**Conversion funnel** —  It includes lead-stage progression and conversion analysis.
**Branch/rep comparisons** —  Branch and representative performance can be compared.

### Alert impact, effort and ranking

Each alert's impact is the recoverable rupees =deal value X the chance to buy
This comes from the win rate of the deal's stage and source together (falling back to stage alone when the source has too little history); for a branch or rep rate gap, the extra conversions at the peer median times the win-rate gain from one step times the average delivered deal value. Effort (quick = days, medium = weeks, long = months) is an assumption per action type, set in `lib/config.ts`, not a measurement. One shared function ranks alerts by impact rounded to a configurable step (default ₹10 L), breaking ties by quicker effort and grouping equal impact and effort as "Equal priority"; each lead counts in at most one alert. Totals no single action can recover (lead-volume ceiling, target gap, branches with no unordered deals, leads lost before first contact) are strategic insights: they are shown but never ranked and carry no recoverable amount.

Dashboard and lead routes have skeleton loading states, route error boundaries, and designed no-results states. At narrow widths, charts become one column and lead rows stack into labeled fields rather than requiring sideways scrolling. Controls have 44 px minimum hit areas; chart tooltips can also be triggered by click/tap.

## Product and metric decisions

### UTC day and month bucketing

Timestamps are parsed once and day/month keys use UTC (`toDay` and `toMonth`). Date filters begin at UTC midnight, and an inclusive end date ends one millisecond before the following UTC day. This makes a selected day or month independent of the browser’s local timezone and avoids local-midnight daylight-saving changes. It can differ from a dealership’s local business day; a future live-data integration should define and apply the operating timezone explicitly rather than silently changing these existing semantics.

### Overdue, stale, and 30-day definitions

“Overdue expected close” is a due-date rule, not a rolling 30-day rule: an open pre-order or order lead is overdue when its expected-close calendar day in UTC is earlier than the dataset’s UTC as-of day. A lead due today is not yet overdue. The fixture computes 30 such leads.

The undelivered-order view groups orders by time since the order was placed into `<7`, `7–14`, `15–30`, and `>30` day buckets. The delivery insight first selects orders that have waited longer than the median delivery time. It marks the insight high severity if the oldest selected order has waited at least 30 days total.
For example, if the median is 12 days, an order waiting 30 days can trigger high severity—not 42 days.

The cold-lead rule is another distinct threshold: a pre-order lead is cold only when it has had no activity for more than 14 days. Keeping the definitions separate prevents an order awaiting a vehicle from being treated as a neglected pre-order lead. 

The ranked insights use historical win probabilities to estimate expected deal value. The probability is based on closed leads at the same stage, using source-specific data when there are enough examples and otherwise falling back to stage-level data. Statistical measures such as medians and outlier detection also help identify unusual performance.
The dashboard’s High-priority alerts use deterministic rules and thresholds on branch aggregates—for example, whether stale leads or awaiting-delivery orders exist, and how close revenue is to target. They are ranked by severity and business impact, not by probability. 

### Closed win rate

Closed win rate is `currently delivered / (currently delivered + currently lost)`. Open leads are not in its denominator, and stage-history events are used for funnel progression rather than to determine whether a deal is currently won or lost. This yields a stable closed-outcome comparison but is not a cohort conversion rate: newer leads have had less time to close, and status corrections can change the result.

The fixture computes 160 delivered and 288 lost leads, so the overall closed win rate is `160 / (160 + 288) = 35.7%`. Branch rates are calculated independently from each branch’s delivered and lost counts.

### Targets are not rescaled

Attainment is actual revenue or units divided by the target values stored for the selected branch-month rows. Values are not rescaled to 100% or normalized to make the best branch appear to reach target. This preserves the magnitude and comparability of the source target data and makes a large shortfall visible. A low result can signal execution risk, a target/data mismatch, or both; the executive narrative therefore allows that targets may need recalibration instead of rewriting the metric.

The fixture contains 1,426 target units and ₹3,130,141,531 in target revenue. Delivered revenue is ₹388,760,000; summed actual revenue divided by summed target revenue is 12.4%, and the best branch’s revenue attainment is 16.9%. These percentages are computed from the underlying actual and target totals, without scaling.

### Responsive and empty-state behavior

At desktop widths the Overview uses a five-tile KPI strip; at tablet widths the sidebar becomes an icon rail and KPI/table layouts reflow. Wide tables scroll inside their own card rather than the page. Controls are sized for touch, and chart tooltips respond to click as well as pointer movement. Empty chart and lead results explain that the current selection produced no data rather than presenting a blank panel.

## Data patterns verified by computation

The following figures were recomputed from `data/dealership_data.json` using the project’s normalizer and metric functions; the printable calculations are available through `npm run verify` and corresponding assertions are in `tests/metrics.test.ts`.

- **Coverage:** 510 leads across five branches, created between 2025-06-01 and 2025-12-31 UTC. Branch lead counts are 97 Downtown, 109 Highway, 79 Lakeside, 98 Central, and 127 Eastside.
- **Closed outcomes:** 160 delivered and 288 lost, for 448 closed leads and a 35.7% closed win rate. Fourteen currently lost leads have no `lost` history event; status and history therefore cannot be assumed to be identical.
- **Branch variance:** closed win rates are 45.5% Downtown, 38.7% Highway, 8.0% Lakeside, 38.3% Central, and 42.3% Eastside. The calculation reveals a substantial Lakeside outlier worth investigating, not a causal explanation for it.
- **Funnel progression:** test-drive-to-order conversion ranges from 37% at Lakeside to 78% at Eastside in the supplied data. These rates use the recorded reached-stage history and describe this fixture, not a forecast.
- **Orders awaiting delivery:** 38 orders have no delivery record; 24 of those have had no activity for at least 30 days. This is why order aging and pre-order cold leads are treated as different work queues.
- **Order-age buckets:** among those 38 orders, 5 are under 7 days old, 6 are 7–14 days old, 3 are 15–30 days old, and 24 are over 30 days old, computed from order date to dataset as-of time.
- **Cold leads:** zero pre-order leads meet the more-than-14-day inactivity threshold at the fixture’s as-of timestamp.
- **Expected-close overdue:** 30 open leads have an expected-close UTC day before the as-of UTC day. This count is not the `>30 days` bucket from the order-aging chart.
- **Delivery delays:** 72 of 160 deliveries (45%) have a recorded delay reason. The most frequent reason is “Customer requested date change” (18 deliveries), followed by logistics delay and factory allocation (11 each). Mean delivery duration is 25.2 days for delayed deliveries and 12.7 days for deliveries without a recorded delay reason.
- **Target scale:** summed targets are 1,426 units and ₹3,130,141,531 revenue. Actual delivered revenue is ₹388,760,000; best branch revenue attainment is 16.9%.
- **Monthly lead flow:** the computed June-to-December counts are 55, 60, 65, 70, 90, 95, and 75 respectively. This is a descriptive fixture trend, not a seasonal forecast.

All figures above depend on this synthetic fixture, its timestamp normalization, and its recorded history/target values. They should not be treated as live dealership benchmarks.

### Product thinking 
- The product is built around the executive question: “What is happening in the business, where is risk, and what needs attention today?”
- The overview surfaces revenue, pipeline health, orders awaiting delivery, lead aging, delivery delays, and win-rate movement without burying the user in raw records.
- Drill-downs and filtered tables from company to branch to representative let the CEO and branch manager answer operational questions quickly and preserve context while maintaining a simple single-page dashboard flow.
- The dashboard surfaces concrete actionable signals such as overdue expected closes, aging delivery backlog, branch outliers, and target attainment gaps rather than generic charts.

### Design and UX
- The interface uses a clear information hierarchy: headline KPIs first, then chart panels, then action-oriented insight and filtered lead detail.
- Empty states, responsive layouts, and compact lead cards avoid blank or broken experiences when filters remove all data.
- The layout is designed for desktop and tablet use with touch-friendly controls, stacked records on smaller screens, and no required horizontal scrolling.
- The alert panel is intentionally focused and bounded so it adds decision support without cluttering the main executive story.

### Technical quality
- Business logic is separated from the UI into pure, testable metric functions that accept dataset and filters and return derived results.
- Date handling is centralized and deliberately uses UTC-based bucket calculations to make the dashboard deterministic and consistent across browsers.
- The data layer normalizes records once and reuses derived fields, which keeps the app easier to reason about and reduces duplication across views.
- The app uses a lightweight static JSON source, route-local state via URL query parameters, and minimal server-side processing to match the assignment scope without speculative architecture.

### Insight and storytelling
- The dashboard tells a business story rather than just dumping metrics: it highlights gaps, explains variance, and helps a non-technical decision-maker understand what is going wrong and which branch needs attention.
- Outlier branches, delayed deliveries, stale orders, and missed target attainment are framed as decision points rather than abstract percentages.
- The alert layer translates large amounts of operational data into short executive actions, making the product useful for time-poor stakeholders who want immediate recommendations.

## Tradeoffs and limitations

- Local JSON makes this dashboard reproducible and the metric layer deterministic, but it is not an operational data feed. 
- The supplied fixture ends on 2025-12-31 and has only five branches and seven months of data. Small-sample subgroup comparisons, late-closing cohorts, and target quality require more representative live history.

## What I would build next

1. **Forecasting:** after enough dated, representative history is available, estimate stage progression, expected close, delivery dates, and target attainment using backtested, calibrated models. Show uncertainty ranges, sample size, training window, and drift; keep descriptive actuals separate from predictions.
2. **What-if analysis:** let managers change explicit assumptions (lead volume, response time, conversion rates, capacity, targets) and compare scenario outputs with the observed baseline. Label scenarios as estimates, expose assumptions and uncertainty, and do not write scenario values back into actual KPI data.
3. **Live data:** connect to an authenticated, read-only CRM/dealer-system API or scheduled warehouse feed; document refresh latency, data ownership, timezone, deletion/correction semantics, and per-field lineage. Add freshness indicators and data-quality monitoring before calling it live.
4. **Shared alert workflow:** persist alert IDs and statuses in a role-aware backend, retain the evidence/metric snapshot and model version that generated each task, support assignment and audit history, and provide a manager review step before integration with task systems.
