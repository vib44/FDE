"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import useSWR from "swr";
import type { Dataset } from "../lib/types.ts";

interface DatasetEnvelope {
  dataset: Dataset;
  hash: string;
}

interface DatasetContextValue {
  dataset: Dataset;
  hash: string;
  error: Error | undefined;
  isLive: boolean;
  setIsLive: (enabled: boolean) => void;
  newLeads: number;
  dismissNewLeads: () => void;
}

const DatasetContext = createContext<DatasetContextValue | null>(null);
const fetchDataset = async (url: string): Promise<DatasetEnvelope> => {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`Dataset request failed (${response.status})`);
  return response.json() as Promise<DatasetEnvelope>;
};

export function DatasetProvider({
  initialDataset,
  initialHash,
  children,
}: {
  initialDataset: Dataset;
  initialHash: string;
  children: ReactNode;
}) {
  const [isLive, setIsLive] = useState(false);
  const [newLeads, setNewLeads] = useState(0);
  const previous = useRef({ hash: initialHash, leadCount: initialDataset.leads.length });
  const { data, error } = useSWR<DatasetEnvelope>("/api/dataset", fetchDataset, {
    fallbackData: { dataset: initialDataset, hash: initialHash },
    revalidateOnMount: false,
    revalidateOnFocus: false,
    refreshInterval: isLive ? 15_000 : 0,
  });

  useEffect(() => {
    if (!data || data.hash === previous.current.hash) return;
    const added = Math.max(0, data.dataset.leads.length - previous.current.leadCount);
    if (added > 0) setNewLeads(added);
    previous.current = { hash: data.hash, leadCount: data.dataset.leads.length };
  }, [data]);

  return (
    <DatasetContext.Provider
      value={{
        dataset: data?.dataset ?? initialDataset,
        hash: data?.hash ?? initialHash,
        error,
        isLive,
        setIsLive,
        newLeads,
        dismissNewLeads: () => setNewLeads(0),
      }}
    >
      {children}
    </DatasetContext.Provider>
  );
}

export function useDataset(): DatasetContextValue {
  const value = useContext(DatasetContext);
  if (!value) throw new Error("useDataset must be used inside DatasetProvider");
  return value;
}
