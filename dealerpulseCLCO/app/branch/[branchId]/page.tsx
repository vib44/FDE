import { redirect } from "next/navigation";

export default async function BranchPage({
  params,
  searchParams,
}: {
  params: Promise<{ branchId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ branchId }, queryParams] = await Promise.all([params, searchParams]);
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(queryParams)) {
    if (typeof value === "string") query.set(key, value);
    else if (value) value.forEach((item) => query.append(key, item));
  }
  query.set("branch", branchId);
  redirect(`/branches?${query.toString()}#branch-${encodeURIComponent(branchId)}`);
}
