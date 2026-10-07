import { Suspense } from "react";
import { RepDetailPage } from "@/components/analytics-pages";

export default function Page() {
  return <Suspense fallback={<div className="min-h-screen bg-muted/30" />}><RepDetailPage /></Suspense>;
}
