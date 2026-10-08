import { Suspense } from "react";
import { RepresentativesPage } from "../../components/representatives-page.tsx";
import { LeadsSkeleton } from "../../components/page-skeletons.tsx";

export default function RepresentativesRoute() {
  return (
    <Suspense fallback={<LeadsSkeleton />}>
      <RepresentativesPage />
    </Suspense>
  );
}
