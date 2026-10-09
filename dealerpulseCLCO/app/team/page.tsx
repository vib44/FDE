import { redirect } from "next/navigation";

export default async function TeamPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    if (typeof value === "string") params.set(key, value);
    else if (value) value.forEach((item) => params.append(key, item));
  }
  redirect(`/funnel${params.size ? `?${params.toString()}` : ""}`);
}
