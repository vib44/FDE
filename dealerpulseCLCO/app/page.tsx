import { Suspense } from "react";
import Dashboard from "../components/dashboard.tsx";
import { DashboardSkeleton } from "../components/page-skeletons.tsx";

export default function HomePage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <Dashboard />
    </Suspense>
  );
}
