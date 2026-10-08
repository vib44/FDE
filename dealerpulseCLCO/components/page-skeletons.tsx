import { PageContainer } from "./shared-ui.tsx";

export function DashboardSkeleton() {
  return (
    <PageContainer className="page-skeleton" aria-busy="true" aria-label="Loading dashboard">
      <header className="skeleton-header">
        <div>
          <span className="skeleton-block skeleton-eyebrow" />
          <span className="skeleton-block skeleton-title" />
        </div>
        <span className="skeleton-block skeleton-status" />
      </header>
      <section className="overview">
        <div className="skeleton-block skeleton-section-heading" />
        <div className="skeleton-kpis">
          {Array.from({ length: 5 }, (_, index) => (
            <div className="skeleton-card skeleton-kpi" key={index}>
              <span className="skeleton-block skeleton-line short" />
              <span className="skeleton-block skeleton-number" />
              <span className="skeleton-block skeleton-line" />
            </div>
          ))}
        </div>
      </section>
      <div className="skeleton-charts">
        {Array.from({ length: 2 }, (_, index) => (
          <div className="skeleton-card skeleton-chart" key={index}>
            <span className="skeleton-block skeleton-line short" />
            <span className="skeleton-block skeleton-chart-body" />
          </div>
        ))}
      </div>
      <span className="sr-only">Loading performance overview and charts.</span>
    </PageContainer>
  );
}

export function LeadsSkeleton() {
  return (
    <PageContainer className="leads-page page-skeleton" aria-busy="true" aria-label="Loading leads">
      <header className="skeleton-header">
        <div>
          <span className="skeleton-block skeleton-eyebrow" />
          <span className="skeleton-block skeleton-title" />
        </div>
        <span className="skeleton-block skeleton-button" />
      </header>
      <div className="skeleton-card skeleton-lead-row" />
      <div className="skeleton-card skeleton-lead-row" />
      <div className="skeleton-card skeleton-lead-row" />
      <div className="skeleton-card skeleton-lead-row" />
      <span className="sr-only">Loading matching lead records.</span>
    </PageContainer>
  );
}
