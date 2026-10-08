import { Suspense } from "react";
import { FocusedSection } from "../../components/focused-section.tsx";
import { DashboardSkeleton } from "../../components/page-skeletons.tsx";

export default function FunnelPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <FocusedSection title="Funnel" question="Where do we lose customers?" view="funnel" />
    </Suspense>
  );
}
