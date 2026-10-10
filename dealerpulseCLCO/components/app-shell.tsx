"use client";

import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  Filter,
  Handshake,
  LayoutDashboard,
  Search,
  Target,
  Truck,
} from "lucide-react";
import { buildHref } from "../lib/navigation.ts";
import { FilterBar } from "./filter-bar.tsx";
import { useDataset } from "./dataset-provider.tsx";

const navigation = [
  { label: "Overview", href: "/", icon: LayoutDashboard },
  { label: "Targets & Revenue", href: "/targets", icon: Target },
  { label: "Funnel", href: "/funnel", icon: Filter },
  { label: "Delivery", href: "/delivery", icon: Truck },
  { label: "Deals in progress", href: "/deals", icon: Handshake },
] as const;

const sectionNames = new Map<string, string>([
  ["/", "Overview"],
  ["/targets", "Targets & Revenue"],
  ["/sales", "Targets & Revenue"],
  ["/funnel", "Funnel"],
  ["/delivery", "Delivery"],
  ["/deals", "Deals in progress"],
  ["/branches", "Deals in progress"],
  ["/leads", "Lead Explorer"],
]);

function NavigationLinks() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <nav className="app-navigation" aria-label="Main navigation">
      {navigation.map((item) => {
        const active = item.href === "/"
          ? pathname === "/"
          : pathname === item.href || pathname.startsWith(`${item.href}/`) ||
            (item.href === "/targets" && pathname === "/sales");
        const href = buildHref(item.href, searchParams.toString());
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
        <Suspense fallback={<div className="app-brand" aria-hidden="true" />}>
          <GlobalOverviewLink className="app-brand" ariaLabel="DealerPulse overview">
            <span className="app-brand-mark" aria-hidden="true">D</span>
            <span className="app-brand-name">DealerPulse</span>
          </GlobalOverviewLink>
        </Suspense>
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
            <Suspense fallback={<span>Company</span>}>
              <GlobalOverviewLink>Company</GlobalOverviewLink>
            </Suspense>
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

function GlobalOverviewLink({
  children,
  className,
  ariaLabel,
}: {
  children: ReactNode;
  className?: string;
  ariaLabel?: string;
}) {
  const searchParams = useSearchParams();
  return (
    <Link className={className} href={buildHref("/", searchParams.toString())} aria-label={ariaLabel}>
      {children}
    </Link>
  );
}

function LeadExplorerLink() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const href = buildHref("/leads", searchParams.toString());
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
