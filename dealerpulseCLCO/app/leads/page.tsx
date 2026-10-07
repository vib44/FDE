import { Suspense } from "react";
import { LeadsPage } from "../../components/leads-page.tsx";
import { LeadsSkeleton } from "../../components/page-skeletons.tsx";

export default function LeadsRoute() {
  return (
    <Suspense fallback={<LeadsSkeleton />}>
      <LeadsPage />
    </Suspense>
  );
}
