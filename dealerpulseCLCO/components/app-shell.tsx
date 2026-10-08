"use client";

import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  Building2,
  Filter,
  LayoutDashboard,
  Search,
  Target,
  Truck,
  UsersRound,
} from "lucide-react";
import { FilterBar } from "./filter-bar.tsx";
import { useDataset } from "./dataset-provider.tsx";

const navigation = [
  { label: "Overview", href: "/", icon: LayoutDashboard },
  { label: "Targets & Revenue", href: "/targets", icon: Target },
  { label: "Funnel", href: "/funnel", icon: Filter },
  { label: "Delivery", href: "/delivery", icon: Truck },
  { label: "Branches", href: "/branches", icon: Building2 },
  { label: "Team", href: "/team", icon: UsersRound },
] as const;

const sectionNames = new Map<string, string>([
  ["/", "Overview"],
  ["/targets", "Targets & Revenue"],
  ["/sales", "Targets & Revenue"],
  ["/funnel", "Funnel"],
  ["/delivery", "Delivery"],
  ["/branches", "Branches"],
  ["/team", "Team"],
  ["/representatives", "Team"],
  ["/leads", "Lead Explorer"],
]);

function NavigationLinks() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const sharedParams = new URLSearchParams();
  for (const key of ["from", "to", "range", "branch", "source", "model", "basis"]) {
    const value = searchParams.get(key);
    if (value) sharedParams.set(key, value);
  }
  const query = sharedParams.toString();

  return (
    <nav className="app-navigation" aria-label="Main navigation">
      {navigation.map((item) => {
        const active = item.href === "/"
          ? pathname === "/"
          : pathname === item.href || pathname.startsWith(`${item.href}/`) ||
            (item.href === "/targets" && pathname === "/sales") ||
            (item.href === "/team" && pathname === "/representatives");
        const href = query ? `${item.href}?${query}` : item.href;
        return (
          <Link
            key={item.href}
            className={`app-navigation-link${active ? " is-active" : ""}`}
            href={href}
            aria-current={active ? "page" : undefined}
            title={item.label}
          >
            <item.icon className="app-navigation-icon" aria-hidden="true" />
            <span className="app-navigation-label">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { dataset } = useDataset();
  const currentSection = sectionNames.get(pathname) ??
    [...sectionNames].find(([path]) => path !== "/" && pathname.startsWith(`${path}/`))?.[1] ??
    "DealerPulse";
  const asOf = new Date(dataset.asOf).toISOString().replace("T", " ").slice(0, 19);

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <Link className="app-brand" href="/" aria-label="DealerPulse overview">
          <span className="app-brand-mark" aria-hidden="true">D</span>
          <span className="app-brand-name">DealerPulse</span>
        </Link>
        <Suspense fallback={<div className="app-navigation" aria-hidden="true" />}>
          <NavigationLinks />
        </Suspense>
        <Suspense fallback={null}>
          <LeadExplorerLink />
        </Suspense>
      </aside>
      <div className="app-workspace">
        <header className="app-topbar">
          <nav className="app-breadcrumb" aria-label="Breadcrumb">
            <Link href="/">Company</Link>
            <span aria-hidden="true">/</span>
            <span aria-current="page">{currentSection}</span>
          </nav>
          <Suspense fallback={<div className="filter-bar app-filter-fallback" aria-hidden="true" />}>
            <FilterBar />
          </Suspense>
          <p className="app-data-asof">
            Data as of <time dateTime={new Date(dataset.asOf).toISOString()}>{asOf} UTC</time>
          </p>
        </header>
        {children}
      </div>
    </div>
  );
}

function LeadExplorerLink() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const sharedParams = new URLSearchParams();
  for (const key of ["from", "to", "range", "branch", "source", "model", "basis"]) {
    const value = searchParams.get(key);
    if (value) sharedParams.set(key, value);
  }
  const href = sharedParams.size ? `/leads?${sharedParams.toString()}` : "/leads";
  const active = pathname === "/leads" || pathname.startsWith("/leads/");
  return (
    <Link
      className={`app-navigation-link app-navigation-utility${active ? " is-active" : ""}`}
      href={href}
      aria-current={active ? "page" : undefined}
      title="Lead Explorer"
    >
      <Search className="app-navigation-icon" aria-hidden="true" />
      <span className="app-navigation-label">Lead Explorer</span>
    </Link>
  );
}
