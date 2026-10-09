const numberFormatter = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const currencyFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

export function formatNumber(value: number, fractionDigits = 0): string {
  if (fractionDigits === 0) return numberFormatter.format(value);
  return new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

export function formatCurrency(value: number): string {
  const absolute = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (absolute >= 10_000_000) {
    return `${sign}₹${(absolute / 10_000_000).toFixed(2)} Cr`;
  }
  if (absolute >= 100_000) {
    return `${sign}₹${(absolute / 100_000).toFixed(1)} L`;
  }
  return currencyFormatter.format(value);
}

export function formatPercent(value: number, fractionDigits = 1): string {
  return `${(value * 100).toFixed(fractionDigits)}%`;
}

export function formatSourceName(value: string): string {
  const words = value.replaceAll("_", " ").trim().toLowerCase();
  if (words === "walk in") return "Walk-in";
  return words.replace(/^./, (first) => first.toUpperCase());
}
