"use client";

import { useEffect, useState } from "react";
import type { ChartTokens } from "../lib/chartTheme.ts";

export type { ChartTokens } from "../lib/chartTheme.ts";

export function useChartTokens(): ChartTokens | null {
  const [tokens, setTokens] = useState<ChartTokens | null>(null);

  useEffect(() => {
    const styles = getComputedStyle(document.documentElement);
    const read = (name: string) => {
      const value = styles.getPropertyValue(name).trim();
      if (!value) throw new Error(`Missing design token: ${name}`);
      return value;
    };
    setTokens({
      surface: read("--surface"),
      border: read("--border"),
      accent: read("--accent"),
      accentSoft: read("--accent-soft"),
      good: read("--good"),
      warn: read("--warn"),
      bad: read("--bad"),
      context: read("--chart-context"),
      grid: read("--chart-grid"),
      text: read("--text-primary"),
      muted: read("--text-muted"),
    });
  }, []);

  return tokens;
}
