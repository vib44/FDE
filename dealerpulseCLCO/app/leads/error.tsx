"use client";

import { RouteError } from "../../components/route-error.tsx";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteError error={error} reset={reset} title="Lead records couldn’t load" />;
}
