"use client";

import { RouteError } from "../components/route-error.tsx";
import "./globals.css";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body>
        <RouteError error={error} reset={reset} title="DealerPulse couldn’t start" />
      </body>
    </html>
  );
}
