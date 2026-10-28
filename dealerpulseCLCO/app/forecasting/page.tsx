import { Suspense } from "react";
import { ForecastingPage } from "../../components/forecasting-page.tsx";
import { DashboardSkeleton } from "../../components/page-skeletons.tsx";

export default function Page() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <ForecastingPage />
    </Suspense>
  );
}
