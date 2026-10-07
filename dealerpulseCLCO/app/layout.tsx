import type { Metadata } from "next";
import type { ReactNode } from "react";
import { DatasetProvider } from "../components/dataset-provider.tsx";
import { hashDataset } from "../lib/data/hash.ts";
import { loadDataset } from "../lib/data/index.ts";
import "./globals.css";

export const metadata: Metadata = {
  title: "DealerPulse",
  description: "Dealership performance, translated into the next best action.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const dataset = loadDataset();
  const hash = hashDataset(dataset);
  return (
    <html lang="en">
      <body>
        <DatasetProvider initialDataset={dataset} initialHash={hash}>
          {children}
        </DatasetProvider>
      </body>
    </html>
  );
}
