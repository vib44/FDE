import { GLOBAL_FILTER_KEYS, PAGE_LOCAL_KEYS } from "./config.ts";

export type PageKey = keyof typeof PAGE_LOCAL_KEYS;
export type ExplicitParams = Record<string, string | null | undefined>;

function asSearchParams(params: string | URLSearchParams): URLSearchParams {
  return typeof params === "string" ? new URLSearchParams(params) : params;
}

/** Build a cross-page URL, retaining global filters and only explicitly supplied target filters. */
export function buildHref(
  path: string,
  currentParams: string | URLSearchParams,
  explicitParams: ExplicitParams = {},
): string {
  const source = asSearchParams(currentParams);
  const [pathWithQuery, hash = ""] = path.split("#", 2);
  const pathname = pathWithQuery!.split("?", 1)[0]!;
  const params = new URLSearchParams();
  const targetPage = pageKeyForPath(pathname);
  const allowedExplicit = new Set<string>([
    ...GLOBAL_FILTER_KEYS,
    ...PAGE_LOCAL_KEYS[targetPage],
  ]);

  for (const key of GLOBAL_FILTER_KEYS) {
    const value = source.get(key);
    if (value !== null) params.set(key, value);
  }
  for (const [key, value] of Object.entries(explicitParams)) {
    if (!allowedExplicit.has(key)) continue;
    if (value === null || value === undefined || value === "") params.delete(key);
    else params.set(key, value);
  }

  const query = params.toString();
  return `${pathname}${query ? `?${query}` : ""}${hash ? `#${hash}` : ""}`;
}

export function selectPageParams(
  page: PageKey,
  currentParams: string | URLSearchParams,
): URLSearchParams {
  const source = asSearchParams(currentParams);
  const allowed = new Set<string>([...GLOBAL_FILTER_KEYS, ...PAGE_LOCAL_KEYS[page]]);
  const selected = new URLSearchParams();
  source.forEach((value, key) => {
    if (allowed.has(key)) selected.append(key, value);
  });
  return selected;
}

export function pageKeyForPath(pathname: string): PageKey {
  if (pathname === "/" || pathname === "") return "overview";
  if (pathname === "/targets" || pathname === "/sales") return "targets";
  if (pathname === "/funnel" || pathname === "/team" || pathname === "/representatives") return "funnel";
  if (pathname === "/delivery") return "delivery";
  if (pathname === "/deals" || pathname === "/branches" || pathname.startsWith("/branch/")) return "deals";
  if (pathname === "/leads") return "leads";
  return "overview";
}
