import { Suspense } from "react";
import { LeadsExplorerPage } from "@/components/analytics-pages";

export default function Page() {
  return <Suspense fallback={<div className="min-h-screen bg-muted/30" />}><LeadsExplorerPage /></Suspense>;
}
