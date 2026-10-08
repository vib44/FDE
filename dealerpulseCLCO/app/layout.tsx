/// <reference types="next" />

import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Inter } from "next/font/google";
import { AppShell } from "../components/app-shell.tsx";
import { DatasetProvider } from "../components/dataset-provider.tsx";
import { loadDataset } from "../lib/data/index.ts";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: "DealerPulse",
  description: "Dealership performance, translated into the next best action.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const dataset = loadDataset();
  return (
    <html lang="en">
      <body className={`${inter.variable} ${inter.className}`}>
        <DatasetProvider initialDataset={dataset}>
          <AppShell>{children}</AppShell>
        </DatasetProvider>
      </body>
    </html>
  );
}
