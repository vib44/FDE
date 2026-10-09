import { redirect } from "next/navigation";

export default async function BranchesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") query.set(key, value);
    else if (value) value.forEach((item) => query.append(key, item));
  }
  redirect(`/deals${query.size ? `?${query.toString()}` : ""}`);
}
