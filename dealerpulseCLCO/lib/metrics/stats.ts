/** Median of numbers; null for empty input. */
export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}
/** Median absolute deviation: median(|x - median(x)|). */
export function mad(xs: number[]): number | null {
  const m = median(xs);
  return m === null ? null : median(xs.map((x) => Math.abs(x - m)));
}
/** Robust z = 0.6745 * (x - median) / MAD. Returns 0 when MAD is 0 or input too small. */
export function robustZ(x: number, xs: number[]): number {
  const m = median(xs), d = mad(xs);
  if (m === null || !d) return 0;
  return (0.6745 * (x - m)) / d;
}
/** Safe ratio: null when denominator is 0. */
export const ratio = (n: number, d: number): number | null => (d === 0 ? null : n / d);
export const DAY = 86_400_000, HOUR = 3_600_000;
