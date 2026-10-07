# DealerPulse

DealerPulse is an executive dashboard for dealership lead, order, delivery, branch, and source performance. The current app uses a normalized local fixture dataset and can request branch-level operational alerts from Azure OpenAI.

## Requirements

- Node.js 20 or later
- npm

## Run locally

```sh
npm install
npm run dev
```

Open `http://localhost:3000`.

Useful commands:

```sh
npm test
npm run verify
npm run build
npm start
```

`npm test` runs metric and fixture assertions. `npm run verify` prints computed fixture summaries. `npm run build` type-checks and creates the production build.

## Azure AI alerts

The dashboard’s first chart-grid panel requests high-priority alert suggestions from the server-side `/api/ai-alerts` route. Configure these server environment variables in `.env.local` for development or in the deployment environment:

```dotenv
AZURE_OPENAI_API_KEY=your-key
AZURE_DEPLOYMENT_NAME=your-chat-completions-deployment
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com
```

The endpoint sends branch-level aggregates only; it does not send customer names, representative names, or lead records. Azure output is constrained to high-priority suggestions associated with a supplied branch, validated by the route, and shown with loading, retry, and empty states. The key is never exposed to browser code.

Marking an alert done or discarding it stores that action in the current browser’s local storage. It is not shared across users or devices.

## Dashboard behavior

- The dashboard offers date, branch, source, model, and time-basis filters.
- Chart panels support branch or stage drill-down where applicable.
- The leads page shows matching records; its mobile layout stacks fields rather than requiring a horizontally scrolling table.
- Route-level loading skeletons and error boundaries are provided for the dashboard and lead detail views.
- Dates and month aggregation use UTC. See [DECISIONS.md](./DECISIONS.md) for metric definitions, verified fixture patterns, limitations, and next steps.

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
