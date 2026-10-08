import { Suspense } from "react";
import { BranchesOverview } from "../../components/branches-overview.tsx";
import { DashboardSkeleton } from "../../components/page-skeletons.tsx";

export default function BranchesPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <BranchesOverview />
    </Suspense>
  );
}
