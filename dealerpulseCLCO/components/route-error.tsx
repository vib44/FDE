"use client";

import { useEffect } from "react";

export function RouteError({
  error,
  reset,
  title = "This view couldn’t load",
}: {
  error?: Error;
  reset: () => void;
  title?: string;
}) {
  useEffect(() => {
    if (error) console.error("DealerPulse route failed to render.", error);
  }, [error]);

  return (
    <main className="dashboard route-error-page">
      <section className="route-error-card" role="alert">
        <span className="empty-state-icon error-state-icon" aria-hidden="true">!</span>
        <p className="eyebrow">DEALERPULSE · SOMETHING WENT WRONG</p>
        <h1>{title}</h1>
        <p>We couldn’t prepare this view. Your data is unchanged; try loading it again.</p>
        <button className="route-error-retry" type="button" onClick={reset}>Try again</button>
      </section>
    </main>
  );
}
