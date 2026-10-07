"use client";

import { useMemo, type ReactNode } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { db, formatMoney, getFunnel, getOverviewKPIs, getPeriodRange, getRepLeaderboard, getStaleLeads, type DashboardPeriod } from "@/lib/metrics";
import type { Lead, LeadStatus } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const statuses: LeadStatus[] = ["new", "contacted", "test_drive", "negotiation", "order_placed", "delivered", "lost"];
const stages = statuses.slice(0, 6);
const periods: { value: DashboardPeriod; label: string }[] = [
  { value: "all", label: "All time" },
  { value: "last-six", label: "Last 6 months" },
  { value: "quarter", label: "Last quarter" },
  { value: "30", label: "Last 30 days" },
];
const stageLabel = (status: string) =>
  status.split("_").map((word) => word[0].toUpperCase() + word.slice(1)).join(" ");
const dateLabel = (date: string) =>
  new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(date));
const money = (value: number) => formatMoney(value);
const pct = (value: number) => `${(value * 100).toFixed(1)}%`;
const validPeriod = (value: string | null): DashboardPeriod =>
  periods.some((period) => period.value === value) ? value as DashboardPeriod : "last-six";
const inRange = (lead: Lead, range: ReturnType<typeof getPeriodRange>) => {
  const created = new Date(lead.created_at);
  return created >= range.from && created <= range.to;
};
const linkWithQuery = (path: string, params: URLSearchParams) => {
  const query = params.toString();
  return query ? `${path}?${query}` : path;
};

function QueryFilters({ period, onPeriodChange, children }: {
  period: DashboardPeriod;
  onPeriodChange: (value: DashboardPeriod) => void;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {children}
      <label className="sr-only" htmlFor="period-filter">Reporting period</label>
      <select id="period-filter" className="h-9 rounded-md border bg-background px-3 text-sm" value={period} onChange={(event) => onPeriodChange(validPeriod(event.target.value))}>
        {periods.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </div>
  );
}

function Breadcrumbs({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-5 text-sm text-muted-foreground">
      <ol className="flex flex-wrap items-center gap-2">
        {items.map((item, index) => (
          <li key={`${item.label}-${index}`} className="flex items-center gap-2">
            {index > 0 && <span aria-hidden="true">/</span>}
            {item.href ? <a className="hover:text-foreground hover:underline" href={item.href}>{item.label}</a> : <span aria-current="page" className="font-medium text-foreground">{item.label}</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}

function PageFrame({ crumbs, eyebrow, title, description, filters, children }: {
  crumbs: { label: string; href?: string }[];
  eyebrow: string;
  title: string;
  description: string;
  filters?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="min-h-screen bg-muted/30">
      <header className="border-b bg-background px-4 py-5 sm:px-6">
        <div className="mx-auto max-w-7xl">
          <Breadcrumbs items={crumbs} />
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <p className="text-sm font-medium text-primary">{eyebrow}</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight">{title}</h1>
              <p className="mt-1 text-sm text-muted-foreground">{description}</p>
            </div>
            {filters}
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6">{children}</div>
    </main>
  );
}

function MetricCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></CardContent></Card>;
}

function LeadTable({ leads, onSelect }: { leads: Lead[]; onSelect?: (lead: Lead) => void }) {
  const reps = useMemo(() => new Map(db.sales_reps.map((rep) => [rep.id, rep.name])), []);
  return (
    <Table>
      <TableHeader><TableRow><TableHead>Lead</TableHead><TableHead>Model</TableHead><TableHead>Status</TableHead><TableHead>Sales rep</TableHead><TableHead>Last activity</TableHead><TableHead className="text-right">Value</TableHead></TableRow></TableHeader>
      <TableBody>
        {leads.map((lead) => <TableRow key={lead.id} className={onSelect ? "cursor-pointer" : undefined} onClick={onSelect ? () => onSelect(lead) : undefined}>
          <TableCell><span className="font-medium">{lead.customer_name}</span><span className="block text-xs text-muted-foreground">{lead.id}</span></TableCell>
          <TableCell>{lead.model_interested}</TableCell>
          <TableCell><Badge variant={lead.status === "lost" ? "destructive" : lead.status === "delivered" ? "secondary" : "outline"}>{stageLabel(lead.status)}</Badge></TableCell>
          <TableCell>{reps.get(lead.assigned_to) ?? "Unassigned"}</TableCell>
          <TableCell>{dateLabel(lead.last_activity_at)}</TableCell>
          <TableCell className="text-right tabular-nums">{money(lead.deal_value)}</TableCell>
        </TableRow>)}
        {leads.length === 0 && <TableRow><TableCell colSpan={6} className="h-24 text-center text-muted-foreground">No leads match these filters.</TableCell></TableRow>}
      </TableBody>
    </Table>
  );
}

function BranchLossChart({ leads }: { leads: Lead[] }) {
  const { data, reasons } = useMemo(() => {
    const lost = leads.filter((lead) => lead.status === "lost");
    const totals = new Map<string, number>();
    lost.forEach((lead) => {
      const reason = lead.lost_reason ?? "Not recorded";
      totals.set(reason, (totals.get(reason) ?? 0) + 1);
    });
    const topReasons = [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([reason]) => reason);
    const chartRows = stages.map((stage) => {
      const row: Record<string, string | number> = { stage: stageLabel(stage) };
      [...topReasons, ...(totals.size > topReasons.length ? ["Other"] : [])].forEach((reason) => { row[reason] = 0; });
      lost.forEach((lead) => {
        const history = [...lead.status_history].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        const lossIndex = history.findIndex((item) => item.status === "lost");
        const previousStage = history.slice(0, lossIndex < 0 ? history.length : lossIndex).at(-1)?.status;
        const reason = topReasons.includes(lead.lost_reason ?? "Not recorded") ? lead.lost_reason ?? "Not recorded" : "Other";
        if (previousStage === stage) row[reason] = Number(row[reason] ?? 0) + 1;
      });
      return row;
    });
    return { data: chartRows, reasons: [...topReasons, ...(totals.size > topReasons.length ? ["Other"] : [])] };
  }, [leads]);

  return (
    <Card>
      <CardHeader><CardTitle>Loss reasons by stage</CardTitle><CardDescription>Lost leads grouped by the last stage reached before loss</CardDescription></CardHeader>
      <CardContent>
        {reasons.length ? <div className="h-[300px] w-full"><ResponsiveContainer width="100%" height="100%"><BarChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: -16 }}><CartesianGrid vertical={false} strokeDasharray="3 3" /><XAxis dataKey="stage" tickLine={false} axisLine={false} /><YAxis allowDecimals={false} tickLine={false} axisLine={false} /><Tooltip /><Legend /><Bar dataKey={reasons[0]} stackId="losses" fill="#334155" radius={[3, 3, 0, 0]} />{reasons.slice(1).map((reason, index) => <Bar key={reason} dataKey={reason} stackId="losses" fill={["#64748b", "#94a3b8", "#cbd5e1"][index % 3]} />)}</BarChart></ResponsiveContainer></div> : <p className="py-16 text-center text-sm text-muted-foreground">No lost leads in this period.</p>}
      </CardContent>
    </Card>
  );
}

export function BranchDetailPage() {
  const { branchId } = useParams<{ branchId: string }>();
  const params = useSearchParams();
  const router = useRouter();
  const query = new URLSearchParams(params.toString());
  const period = validPeriod(params.get("period"));
  const branch = db.branches.find((item) => item.id === branchId);
  const range = useMemo(() => getPeriodRange(period), [period]);
  const leads = useMemo(() => db.leads.filter((lead) => lead.branch_id === branchId && inRange(lead, range)), [branchId, range]);
  const allBranchLeads = useMemo(() => db.leads.filter((lead) => lead.branch_id === branchId), [branchId]);
  const scoped = { ...range, branchId };
  const kpis = getOverviewKPIs(scoped);
  const company = getOverviewKPIs(range);
  const funnel = getFunnel(scoped);
  const reps = useMemo(() => {
    return db.sales_reps.filter((rep) => rep.branch_id === branchId && rep.role === "sales_officer").map((rep) => {
      const assigned = leads.filter((lead) => lead.assigned_to === rep.id);
      const delivered = assigned.filter((lead) => lead.status === "delivered");
      return { ...rep, leads: assigned.length, delivered: delivered.length, revenue: delivered.reduce((sum, lead) => sum + lead.deal_value, 0), winRate: assigned.length ? delivered.length / assigned.length : 0 };
    }).sort((a, b) => b.revenue - a.revenue);
  }, [branchId, leads]);
  const updatePeriod = (nextPeriod: DashboardPeriod) => {
    query.set("period", nextPeriod);
    router.replace(`/branch/${branchId}?${query.toString()}`);
  };
  const crumbs = [{ label: "Overview", href: "/" }, { label: branch?.name ?? "Branch" }];
  if (!branch) return <PageFrame crumbs={crumbs} eyebrow="Branch performance" title="Branch not found" description="The requested branch could not be found."><a className="text-primary underline" href="/">Return to overview</a></PageFrame>;
  return <PageFrame crumbs={crumbs} eyebrow={`${branch.city} · ${branch.id}`} title={branch.name} description="Branch pipeline, team performance, and outcomes compared with the company average." filters={<QueryFilters period={period} onPeriodChange={updatePeriod} />}>
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard label="Leads" value={leads.length.toLocaleString("en-IN")} detail={`${allBranchLeads.length.toLocaleString("en-IN")} total records at this branch`} />
      <MetricCard label="Win rate" value={pct(kpis.winRate)} detail={`${(kpis.winRate - company.winRate >= 0 ? "+" : "")}${((kpis.winRate - company.winRate) * 100).toFixed(1)} pts vs company average (${pct(company.winRate)})`} />
      <MetricCard label="Units delivered" value={kpis.units.toLocaleString("en-IN")} detail={`${kpis.units - company.units >= 0 ? "+" : ""}${(kpis.units - company.units).toLocaleString("en-IN")} vs company total`} />
      <MetricCard label="Open pipeline" value={money(kpis.pipeline)} detail={`Company average win rate ${pct(company.winRate)}`} />
    </section>
    <section className="grid gap-5 lg:grid-cols-2">
      <Card><CardHeader><CardTitle>Lead funnel</CardTitle><CardDescription>Unique branch leads that reached each stage</CardDescription></CardHeader><CardContent className="space-y-4">{funnel.map((item) => <div key={item.stage} className="flex items-center gap-3"><span className="w-24 text-xs text-muted-foreground">{stageLabel(item.stage)}</span><Progress value={leads.length ? item.count / leads.length * 100 : 0} className="h-2 flex-1" /><span className="w-10 text-right text-sm tabular-nums">{item.count}</span></div>)}</CardContent></Card>
      <Card><CardHeader><CardTitle>Company comparison</CardTitle><CardDescription>Same period, branch performance against the company average</CardDescription></CardHeader><CardContent className="space-y-4">{[{ label: "Win rate", branch: kpis.winRate, average: company.winRate }, { label: "Deliveries per lead", branch: leads.length ? kpis.units / leads.length : 0, average: db.leads.filter((lead) => inRange(lead, range)).length ? company.units / db.leads.filter((lead) => inRange(lead, range)).length : 0 }].map((item) => <div key={item.label} className="rounded-lg border p-4"><div className="flex justify-between text-sm"><span>{item.label}</span><span className="font-medium">{pct(item.branch)} <span className="text-muted-foreground">vs {pct(item.average)} avg.</span></span></div><div className="mt-3 h-2 rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(item.branch * 100, 100)}%` }} /></div></div>)}</CardContent></Card>
    </section>
    <BranchLossChart leads={leads} />
    <Card><CardHeader><CardTitle>Sales representatives</CardTitle><CardDescription>Branch team performance for the selected period</CardDescription></CardHeader><CardContent className="px-0"><Table><TableHeader><TableRow><TableHead className="pl-6">Representative</TableHead><TableHead>Leads</TableHead><TableHead>Delivered</TableHead><TableHead>Win rate</TableHead><TableHead className="text-right">Revenue</TableHead></TableRow></TableHeader><TableBody>{reps.map((rep) => <TableRow key={rep.id}><TableCell className="pl-6"><a href={linkWithQuery(`/branch/${branchId}/rep/${rep.id}`, query)} className="font-medium text-primary hover:underline">{rep.name}</a></TableCell><TableCell>{rep.leads}</TableCell><TableCell>{rep.delivered}</TableCell><TableCell>{pct(rep.winRate)}</TableCell><TableCell className="text-right">{money(rep.revenue)}</TableCell></TableRow>)}{!reps.length && <TableRow><TableCell colSpan={5} className="h-20 text-center text-muted-foreground">No sales representatives found.</TableCell></TableRow>}</TableBody></Table></CardContent></Card>
    <Card><CardHeader><CardTitle>Branch leads</CardTitle><CardDescription>{leads.length} leads in the selected period</CardDescription></CardHeader><CardContent className="px-0"><LeadTable leads={leads.slice(0, 50)} /></CardContent></Card>
  </PageFrame>;
}

export function RepDetailPage() {
  const { branchId, repId } = useParams<{ branchId: string; repId: string }>();
  const params = useSearchParams();
  const router = useRouter();
  const query = new URLSearchParams(params.toString());
  const period = validPeriod(params.get("period"));
  const branch = db.branches.find((item) => item.id === branchId);
  const rep = db.sales_reps.find((item) => item.id === repId && item.branch_id === branchId);
  const range = useMemo(() => getPeriodRange(period), [period]);
  const scopedLeads = useMemo(() => db.leads.filter((lead) => lead.branch_id === branchId && inRange(lead, range)), [branchId, range]);
  const leads = useMemo(() => scopedLeads.filter((lead) => lead.assigned_to === repId), [scopedLeads, repId]);
  const staleLeads = getStaleLeads({ ...range, branchId }).filter((lead) => lead.assigned_to === repId);
  const leaderboard = getRepLeaderboard({ ...range, branchId });
  const rank = leaderboard.findIndex((item) => item.id === repId) + 1;
  const position = leaderboard.find((item) => item.id === repId);
  const funnel = getFunnel({ ...range, branchId });
  const stagesForRep = statuses.slice(0, 6).map((stage) => ({ stage, count: leads.filter((lead) => lead.status_history.some((item) => item.status === stage)).length }));
  const updatePeriod = (nextPeriod: DashboardPeriod) => {
    query.set("period", nextPeriod);
    router.replace(`/branch/${branchId}/rep/${repId}?${query.toString()}`);
  };
  const crumbs = [{ label: "Overview", href: "/" }, { label: branch?.name ?? "Branch", href: linkWithQuery(`/branch/${branchId}`, query) }, { label: rep?.name ?? "Representative" }];
  if (!branch || !rep) return <PageFrame crumbs={crumbs} eyebrow="Sales team" title="Representative not found" description="This representative is not assigned to the selected branch."><a className="text-primary underline" href={linkWithQuery(`/branch/${branchId}`, query)}>Return to branch</a></PageFrame>;
  const plot = leaderboard.map((item) => ({ name: item.name, leads: item.leads, winRate: item.leads ? item.delivered / item.leads * 100 : 0, selected: item.id === repId }));
  const companyRank = `${rank} of ${leaderboard.length}`;
  const branchAverage = leaderboard.length ? leaderboard.reduce((sum, item) => sum + item.leads, 0) / leaderboard.length : 0;
  const onPeriod = (value: DashboardPeriod) => updatePeriod(value);

  return <PageFrame crumbs={crumbs} eyebrow={`${branch.name} · Sales team`} title={rep.name} description={`Individual pipeline and performance position · ${rep.role === "branch_manager" ? "Branch manager" : "Sales representative"}`} filters={<QueryFilters period={period} onPeriodChange={onPeriod} />}>
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard label="Leads assigned" value={leads.length.toLocaleString("en-IN")} detail={`${money(leads.reduce((sum, lead) => sum + lead.deal_value, 0))} pipeline value`} />
      <MetricCard label="Delivered" value={String(leads.filter((lead) => lead.status === "delivered").length)} detail={`${pct(leads.length ? leads.filter((lead) => lead.status === "delivered").length / leads.length : 0)} of assigned leads`} />
      <MetricCard label="Stale leads" value={String(staleLeads.length)} detail="Open leads inactive for 7+ days" />
      <MetricCard label="Leaderboard position" value={rank ? `#${rank}` : "—"} detail={`Among ${companyRank} branch representatives`} />
    </section>
    <section className="grid gap-5 lg:grid-cols-2">
      <Card><CardHeader><CardTitle>Rep funnel</CardTitle><CardDescription>Leads assigned to {rep.name} that reached each stage</CardDescription></CardHeader><CardContent className="space-y-4">{stagesForRep.map((item, index) => <div key={item.stage} className="flex items-center gap-3"><span className="w-24 text-xs text-muted-foreground">{stageLabel(item.stage)}</span><Progress value={leads.length ? item.count / leads.length * 100 : 0} className="h-2 flex-1" /><span className="w-10 text-right text-sm tabular-nums">{item.count}</span>{index > 0 && <span className="w-12 text-right text-xs text-muted-foreground">{stagesForRep[index - 1].count ? `${Math.round(item.count / stagesForRep[index - 1].count * 100)}%` : "—"}</span>}</div>)}</CardContent></Card>
      <Card><CardHeader><CardTitle>Leaderboard & team position</CardTitle><CardDescription>Lead volume versus delivery rate for branch representatives</CardDescription></CardHeader><CardContent><div className="h-[280px] w-full"><ResponsiveContainer width="100%" height="100%"><ScatterChart margin={{ top: 10, right: 18, bottom: 10, left: -10 }}><CartesianGrid strokeDasharray="3 3" /><XAxis type="number" dataKey="leads" name="Leads" allowDecimals={false} tickLine={false} /><YAxis type="number" dataKey="winRate" name="Win rate" unit="%" domain={[0, 100]} tickLine={false} /><Tooltip cursor={{ strokeDasharray: "3 3" }} formatter={(value, name) => [name === "winRate" ? `${Number(value).toFixed(1)}%` : value, name === "winRate" ? "Win rate" : "Leads"]} /><Scatter name="Team" data={plot} fill="#64748b" shape={(props) => { const { cx, cy, payload } = props as { cx: number; cy: number; payload: { selected: boolean } }; return <circle cx={cx} cy={cy} r={payload.selected ? 7 : 5} fill={payload.selected ? "#0f172a" : "#94a3b8"} stroke={payload.selected ? "#0f172a" : "none"} />; }} /></ScatterChart></ResponsiveContainer></div><p className="text-center text-xs text-muted-foreground">Your position: #{rank || "—"} by delivered revenue · average team portfolio is {branchAverage.toFixed(1)} leads</p></CardContent></Card>
    </section>
    <Card><CardHeader><CardTitle>Stale leads</CardTitle><CardDescription>Open leads with no activity in at least 7 days</CardDescription></CardHeader><CardContent className="px-0"><LeadTable leads={staleLeads} /></CardContent></Card>
    <Card><CardHeader><CardTitle>Lead portfolio</CardTitle><CardDescription>{leads.length} assigned leads during the selected period</CardDescription></CardHeader><CardContent className="px-0"><LeadTable leads={leads.slice(0, 100)} /></CardContent></Card>
  </PageFrame>;
}

export function LeadsExplorerPage() {
  const params = useSearchParams();
  const router = useRouter();
  const query = new URLSearchParams(params.toString());
  const period = validPeriod(params.get("period") ?? "all");
  const search = params.get("q") ?? "";
  const branchFilter = params.get("branch") ?? "all";
  const statusFilter = params.get("status") ?? "all";
  const sourceFilter = params.get("source") ?? "all";
  const selectedId = params.get("lead");
  const range = useMemo(() => getPeriodRange(period), [period]);
  const filtered = useMemo(() => db.leads.filter((lead) => {
    const term = search.trim().toLowerCase();
    return inRange(lead, range)
      && (branchFilter === "all" || lead.branch_id === branchFilter)
      && (statusFilter === "all" || lead.status === statusFilter)
      && (sourceFilter === "all" || lead.source === sourceFilter)
      && (!term || [lead.customer_name, lead.id, lead.phone, lead.model_interested].some((value) => value.toLowerCase().includes(term)));
  }).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()), [branchFilter, range, search, sourceFilter, statusFilter]);
  const selected = db.leads.find((lead) => lead.id === selectedId);
  const setFilter = (key: string, value: string, defaultValue = "all") => {
    const next = new URLSearchParams(params.toString());
    if (value === defaultValue || !value) next.delete(key);
    else next.set(key, value);
    router.replace(`/leads${next.size ? `?${next.toString()}` : ""}`);
  };
  const selectLead = (lead: Lead) => {
    const next = new URLSearchParams(params.toString());
    next.set("lead", lead.id);
    router.replace(`/leads?${next.toString()}`);
  };
  const closeDrawer = () => setFilter("lead", "", "");
  const branches = db.branches;
  const sources = [...new Set(db.leads.map((lead) => lead.source))].sort();
  const resetFilters = () => router.replace("/leads");

  return <>
    <PageFrame crumbs={[{ label: "Overview", href: "/" }, { label: "Leads" }]} eyebrow="Pipeline explorer" title="Leads" description="Search, filter, and review lead status history across the dealership network." filters={<QueryFilters period={period} onPeriodChange={(value) => setFilter("period", value, "all")} />}>
      <Card><CardContent className="flex flex-col gap-3 p-4 md:flex-row">
        <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs font-medium text-muted-foreground">Search leads<input value={search} onChange={(event) => setFilter("q", event.target.value, "")} placeholder="Customer, ID, phone, or model" className="h-9 rounded-md border bg-background px-3 text-sm font-normal text-foreground" /></label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">Branch<select className="h-9 min-w-40 rounded-md border bg-background px-3 text-sm font-normal text-foreground" value={branchFilter} onChange={(event) => setFilter("branch", event.target.value)}><option value="all">All branches</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">Status<select className="h-9 min-w-36 rounded-md border bg-background px-3 text-sm font-normal text-foreground" value={statusFilter} onChange={(event) => setFilter("status", event.target.value)}><option value="all">All statuses</option>{statuses.map((status) => <option key={status} value={status}>{stageLabel(status)}</option>)}</select></label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">Source<select className="h-9 min-w-36 rounded-md border bg-background px-3 text-sm font-normal text-foreground" value={sourceFilter} onChange={(event) => setFilter("source", event.target.value)}><option value="all">All sources</option>{sources.map((source) => <option key={source} value={source}>{stageLabel(source)}</option>)}</select></label>
        <button type="button" onClick={resetFilters} className="self-end rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground">Reset</button>
      </CardContent></Card>
      <Card><CardHeader><CardTitle>Lead results</CardTitle><CardDescription>{filtered.length.toLocaleString("en-IN")} matching leads · select a row to view its status timeline</CardDescription></CardHeader><CardContent className="px-0"><LeadTable leads={filtered.slice(0, 250)} onSelect={selectLead} />{filtered.length > 250 && <p className="px-5 py-3 text-xs text-muted-foreground">Showing the first 250 results. Refine your filters to narrow the list.</p>}</CardContent></Card>
    </PageFrame>
    {selected && <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onMouseDown={(event) => { if (event.target === event.currentTarget) closeDrawer(); }}>
      <aside role="dialog" aria-modal="true" aria-labelledby="lead-drawer-title" className="h-full w-full max-w-lg overflow-y-auto bg-background p-5 shadow-xl sm:p-7">
        <div className="flex items-start justify-between gap-3"><div><p className="text-sm text-muted-foreground">{selected.id} · {stageLabel(selected.status)}</p><h2 id="lead-drawer-title" className="mt-1 text-xl font-semibold">{selected.customer_name}</h2><p className="text-sm text-muted-foreground">{selected.model_interested} · {money(selected.deal_value)}</p></div><button type="button" onClick={closeDrawer} aria-label="Close lead history" className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted">Close</button></div>
        <Card className="mt-6"><CardHeader><CardTitle>Status history</CardTitle><CardDescription>Activity timeline for this lead</CardDescription></CardHeader><CardContent><ol className="space-y-0">{[...selected.status_history].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()).map((event, index) => <li key={`${event.status}-${event.timestamp}`} className="relative flex gap-4 pb-6 last:pb-0"><div className="flex flex-col items-center"><span className="mt-1 size-3 rounded-full border-2 border-primary bg-background" />{index < selected.status_history.length - 1 && <span className="mt-1 w-px flex-1 bg-border" />}</div><div className="pb-1"><p className="font-medium">{stageLabel(event.status)}</p><time className="text-xs text-muted-foreground">{dateLabel(event.timestamp)}</time><p className="mt-1 text-sm text-muted-foreground">{event.note}</p></div></li>)}</ol></CardContent></Card>
        <dl className="mt-5 grid grid-cols-2 gap-3 rounded-lg border p-4 text-sm"><div><dt className="text-muted-foreground">Source</dt><dd className="mt-1 font-medium">{stageLabel(selected.source)}</dd></div><div><dt className="text-muted-foreground">Phone</dt><dd className="mt-1 font-medium">{selected.phone}</dd></div><div><dt className="text-muted-foreground">Created</dt><dd className="mt-1 font-medium">{dateLabel(selected.created_at)}</dd></div><div><dt className="text-muted-foreground">Expected close</dt><dd className="mt-1 font-medium">{dateLabel(selected.expected_close_date)}</dd></div>{selected.lost_reason && <div className="col-span-2"><dt className="text-muted-foreground">Loss reason</dt><dd className="mt-1 font-medium">{selected.lost_reason}</dd></div>}</dl>
      </aside>
    </div>}
  </>;
}
