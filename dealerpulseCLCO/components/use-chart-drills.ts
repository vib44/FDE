"use client";

import { useSearchParams } from "next/navigation";
import { buildHref } from "../lib/navigation.ts";

export function useChartDrills() {
  const searchParams = useSearchParams();

  function drillToStage(stage: string) {
    window.open(buildHref("/leads", searchParams.toString(), { stage }), "_blank", "noopener,noreferrer");
  }

  function drillToLeads(filters: {
    branch?: string;
    source?: string;
    status?: string;
    from?: string;
    to?: string;
  }) {
    window.open(buildHref("/leads", searchParams.toString(), filters), "_blank", "noopener,noreferrer");
  }

  function openRepresentativeView() {
    window.open(buildHref("/representatives", searchParams.toString()), "_blank", "noopener,noreferrer");
  }

  return { drillToStage, drillToLeads, openRepresentativeView };
}
