# Decisions and product notes

## What I built and why

DealerPulse turns dealership lead, order, delivery, target, and source data into an executive overview, branch comparisons, chart drill-downs, and a filtered lead list. A normalized dataset feeds pure metric functions so calculations stay testable and are shared consistently by the overview, charts, and alert input.

The first chart-grid panel is an AI Alerts card. The server summarizes data by branch and sends only those aggregates to Azure OpenAI. The model is asked for urgent tasks that state the risk, impact, and next action; the route accepts only high-priority results referring to a branch in the request. The API key stays on the server. Per-alert done/discarded state is stored in local browser storage: this gives a useful single-user interaction without implying that a shared workflow backend exists.

Dashboard and lead routes have skeleton loading states, route error boundaries, and designed no-results states. At narrow widths, charts become one column and lead rows stack into labeled fields rather than requiring sideways scrolling. Controls have 44 px minimum hit areas; chart tooltips can also be triggered by click/tap.

## Product and metric decisions

### UTC day and month bucketing

Timestamps are parsed once and day/month keys use UTC (`toDay` and `toMonth`). Date filters begin at UTC midnight, and an inclusive end date ends one millisecond before the following UTC day. This makes a selected day or month independent of the browser’s local timezone and avoids local-midnight daylight-saving changes. It can differ from a dealership’s local business day; a future live-data integration should define and apply the operating timezone explicitly rather than silently changing these existing semantics.

### Overdue, stale, and 30-day definitions

“Overdue expected close” is a due-date rule, not a rolling 30-day rule: an open pre-order or order lead is overdue when its expected-close calendar day in UTC is earlier than the dataset’s UTC as-of day. A lead due today is not yet overdue. The fixture computes 30 such leads.

The separate undelivered-order chart groups orders by time since the order was placed into `<7`, `7–14`, `15–30`, and `>30` day buckets. Separately, the existing Act Now insight becomes high severity when the oldest order waiting beyond the usual delivery median has waited at least 30 days. The cold-lead rule is another distinct threshold: a pre-order lead is cold only when it has had no activity for more than 14 days. Keeping the definitions separate prevents an order awaiting a vehicle from being treated as a neglected pre-order lead.

### Closed win rate

Closed win rate is `currently delivered / (currently delivered + currently lost)`. Open leads are not in its denominator, and stage-history events are used for funnel progression rather than to determine whether a deal is currently won or lost. This yields a stable closed-outcome comparison but is not a cohort conversion rate: newer leads have had less time to close, and status corrections can change the result.

The fixture computes 160 delivered and 288 lost leads, so the overall closed win rate is `160 / (160 + 288) = 35.7%`. Branch rates are calculated independently from each branch’s delivered and lost counts.

### Targets are not rescaled

Attainment is actual revenue or units divided by the target values stored for the selected branch-month rows. Values are not rescaled to 100% or normalized to make the best branch appear to reach target. This preserves the magnitude and comparability of the source target data and makes a large shortfall visible. A low result can signal execution risk, a target/data mismatch, or both; the executive narrative therefore allows that targets may need recalibration instead of rewriting the metric.

The fixture contains 1,426 target units and ₹3,130,141,531 in target revenue. Delivered revenue is ₹388,760,000; summed actual revenue divided by summed target revenue is 12.4%, and the best branch’s revenue attainment is 16.9%. These percentages are computed from the underlying actual and target totals, without scaling.

### Branch-level AI context

The model gets aggregate branch measures such as lead count, open pipeline value, cold pre-order count/value, awaiting-delivery count/value, overdue expected-close count/value, closed outcomes, and revenue attainment. It does not receive customer names, phone numbers, assigned representative names, lead identifiers, or full event histories. The endpoint validates the submitted shape, rejects non-HTTPS Azure endpoints, restricts output to supplied branches, and displays errors rather than silently substituting fabricated alerts.

This is an advisory prioritization surface, not an automated task system. Local done/discarded actions are not synchronized or auditable across users; alert wording and ordering can also vary across model runs.

### Responsive and empty-state behavior

At desktop widths the dashboard uses a multi-column KPI and chart layout; at intermediate widths KPI and chart grids reduce columns; at 820 px and below charts and filters reflow and the lead table becomes stacked records. Controls are sized for touch, and chart tooltips respond to click as well as pointer movement. Empty chart and lead results explain that the current selection produced no data rather than presenting a blank panel.

The explicit alert list has its own vertical scrollbar by design so the panel stays within the chart-grid footprint. The overall page and lead table do not require horizontal scrolling.

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

## Tradeoffs and limitations

- Local JSON makes this dashboard reproducible and the metric layer deterministic, but it is not an operational data feed. “Live” currently means polling the app’s dataset endpoint, not synchronizing with a CRM or dealer-management system.
- The Azure alert call is made when the panel loads or its branch data changes. There is no server-side caching, persisted alert history, cross-user task status, or organization-level rate limit yet.
- Generated text is schema-checked and tied to a known branch but is still model output. A manager should verify high-impact decisions against the source system.
- The supplied fixture ends on 2025-12-31 and has only five branches and seven months of data. Small-sample subgroup comparisons, late-closing cohorts, and target quality require more representative live history.

## What I would build next

1. **Live data:** connect to an authenticated, read-only CRM/dealer-system API or scheduled warehouse feed; document refresh latency, data ownership, timezone, deletion/correction semantics, and per-field lineage. Add freshness indicators and data-quality monitoring before calling it live.
2. **Forecasting:** after enough dated, representative history is available, estimate stage progression, expected close, delivery dates, and target attainment using backtested, calibrated models. Show uncertainty ranges, sample size, training window, and drift; keep descriptive actuals separate from predictions.
3. **What-if analysis:** let managers change explicit assumptions (lead volume, response time, conversion rates, capacity, targets) and compare scenario outputs with the observed baseline. Label scenarios as estimates, expose assumptions and uncertainty, and do not write scenario values back into actual KPI data.
4. **Shared alert workflow:** persist alert IDs and statuses in a role-aware backend, retain the evidence/metric snapshot and model version that generated each task, support assignment and audit history, and provide a manager review step before integration with task systems.
