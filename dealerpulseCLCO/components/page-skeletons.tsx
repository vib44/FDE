export function DashboardSkeleton() {
  return (
    <main className="dashboard page-skeleton" aria-busy="true" aria-label="Loading dashboard">
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
          {Array.from({ length: 7 }, (_, index) => (
            <div className="skeleton-card skeleton-kpi" key={index}>
              <span className="skeleton-block skeleton-line short" />
              <span className="skeleton-block skeleton-number" />
              <span className="skeleton-block skeleton-line" />
            </div>
          ))}
        </div>
      </section>
      <div className="skeleton-card skeleton-filter" />
      <div className="skeleton-charts">
        {Array.from({ length: 6 }, (_, index) => (
          <div className="skeleton-card skeleton-chart" key={index}>
            <span className="skeleton-block skeleton-line short" />
            <span className="skeleton-block skeleton-chart-body" />
          </div>
        ))}
      </div>
      <span className="sr-only">Loading performance overview and charts.</span>
    </main>
  );
}

export function LeadsSkeleton() {
  return (
    <main className="dashboard leads-page page-skeleton" aria-busy="true" aria-label="Loading leads">
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
    </main>
  );
}
