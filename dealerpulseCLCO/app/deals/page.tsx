import { Suspense } from "react";
import { DealsPage } from "../../components/deals-page.tsx";
import { DashboardSkeleton } from "../../components/page-skeletons.tsx";

export default function DealsRoute() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DealsPage />
    </Suspense>
  );
}
