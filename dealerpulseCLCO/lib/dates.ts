/** Return the UTC calendar day containing a timestamp as YYYY-MM-DD. */
export function toDay(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

/** Return the UTC calendar month containing a timestamp as YYYY-MM. */
export function toMonth(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 7);
}
