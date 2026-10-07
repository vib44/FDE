import { createHash } from "node:crypto";
import type { Dataset } from "../types.ts";

export function hashDataset(dataset: Dataset): string {
  return createHash("sha256").update(JSON.stringify(dataset)).digest("hex");
}
