import { loadDataset } from "../../../lib/data/index.ts";
import { hashDataset } from "../../../lib/data/hash.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request): Response {
  const dataset = loadDataset();
  const hash = hashDataset(dataset);
  const etag = `"${hash}"`;
  const headers = new Headers({
    "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=600",
    ETag: etag,
  });

  const validators = request.headers.get("if-none-match")?.split(",").map((value) => value.trim()) ?? [];
  if (validators.includes("*") || validators.includes(etag)) {
    return new Response(null, { status: 304, headers });
  }

  headers.set("Content-Type", "application/json; charset=utf-8");
  return Response.json({ dataset, hash }, { headers });
}
