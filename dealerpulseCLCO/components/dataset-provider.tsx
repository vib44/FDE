"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Dataset } from "../lib/types.ts";

const DatasetContext = createContext<Dataset | null>(null);

export function DatasetProvider({
  initialDataset,
  children,
}: {
  initialDataset: Dataset;
  children: ReactNode;
}) {
  return <DatasetContext.Provider value={initialDataset}>{children}</DatasetContext.Provider>;
}

export function useDataset(): { dataset: Dataset } {
  const dataset = useContext(DatasetContext);
  if (!dataset) throw new Error("useDataset must be used inside DatasetProvider");
  return { dataset };
}
