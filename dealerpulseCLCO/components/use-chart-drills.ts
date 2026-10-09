"use client";

import { useSearchParams } from "next/navigation";
import type { LastContactBucketKey } from "../lib/metrics/last-contact.ts";

export function useChartDrills() {
  const searchParams = useSearchParams();

  function drillToStage(stage: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("stage", stage);
    window.open(`/leads?${params.toString()}`, "_blank", "noopener,noreferrer");
  }

  function drillToLeads(filters: {
    branch?: string;
    source?: string;
    status?: string;
    from?: string;
    to?: string;
  }) {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("stage");
    params.delete("leadIds");
    for (const [key, value] of Object.entries(filters)) {
      if (value) params.set(key, value);
    }
    window.open(`/leads?${params.toString()}`, "_blank", "noopener,noreferrer");
  }

  function openRepresentativeView(status: string | null = null, bucket?: LastContactBucketKey) {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("stage");
    params.delete("branch");
    params.delete("bucket");
    params.delete("status");
    if (status) params.set("status", status);
    if (bucket) params.set("bucket", bucket);
    window.open(`/representatives?${params.toString()}`, "_blank", "noopener,noreferrer");
  }

  return { drillToStage, drillToLeads, openRepresentativeView };
}
