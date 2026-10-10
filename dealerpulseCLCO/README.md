# DealerPulse

DealerPulse is an executive dashboard for dealership leads, delivery, branch sales performance against the monthly and cumulative targets. The current app uses a normalized local fixture dataset and creates branch level and overall priority alerts and action task cards.

## Requirements

- Node.js 20 or later
- npm

## Run locally

```sh
npm install
npm run dev
```
[
https://fde-pi.vercel.app/

Useful commands:

```sh
npm test
npm run verify
npm run build
npm start
```

`npm test` runs metric and fixture assertions. `npm run verify` prints computed fixture summaries. `npm run build` type-checks and creates the production build.

## Dashboard behavior

- The dashboard offers date, branch, source, and time-basis filters for sections- Overview, Target & Revenue, Delivery,Funnel and Deals in Progress.
- Chart panels for visual display of metrics.
- Overview Page: serves display of overall metrics, priority and insight cards, tables and priority action cards.
- Funnel Page: Compares the branch level win rate and leads , providing a representative level leaderboard for drill down and few additional features like-
- The “Find your biggest leads bucket” table groups leads by days since last_activity_at (1–3, 4–8, 9–12, 13–20, and over 20 days) and filters by lead’s latest statuses.
- Funnel Page Chart -"Leads reaching each funnel stage" drill down to leads explorer page filtering the data according to the clicked chart bars.
-The leads explorer page shows leads records and information at granular leve;; its mobile layout stacks fields rather than requiring a horizontally scrolling table.
-Delivery Page- displays the delivery metrics across branches, the fastest deliveries, delay reasons , lost closed deals and orders awaiting deliveries.
-Deals in Progress Page- expands on the convert rate of leads once they reach the test drive and negotiation stage
-Route-level loading skeletons and error boundaries are provided for the dashboard and lead detail view.The table has clickable link cells drilling down to branch level , representative level and lead level information.
-Dates and month aggregation use UTC. See DECISIONS.md for metric definitions, verified fixture patterns, limitations, and next steps.

## Project map

- `app/`: Next.js routes, loading UI, and route error boundaries
- `components/`: dashboard, charts, filters, alert panel, and lead list
- `lib/data/`: fixture loading and normalization
- `lib/metrics/`: pure metric calculations and chart view models
- `data/dealership_data.json`: synthetic dealership fixture
- `tests/metrics.test.ts`: computed metric and edge-case tests
- `scripts/verify.ts`: printable fixture summary

## Data status

The supplied dealership data is synthetic and spans June through December 2025. The dashboard’s “Live” switch refreshes the existing dataset endpoint; it does not currently connect to a dealership system of record. See [DECISIONS.md](./DECISIONS.md) for the next product and data-integration steps.
