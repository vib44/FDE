import { Suspense } from "react";
import { SalesPage } from "../../components/sales-page.tsx";
import { DashboardSkeleton } from "../../components/page-skeletons.tsx";

export default function SalesRoute() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <SalesPage />
    </Suspense>
  );
}
