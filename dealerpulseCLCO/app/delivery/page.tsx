import { Suspense } from "react";
import { DeliverySection } from "../../components/delivery-section.tsx";
import { DashboardSkeleton } from "../../components/page-skeletons.tsx";

export default function DeliveryPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DeliverySection />
    </Suspense>
  );
}
