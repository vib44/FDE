"use client";

import { Suspense, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Bell,
  Building2,
  CarFront,
  ChevronRight,
  CircleHelp,
  LayoutDashboard,
  Menu,
  Target,
  Users,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ChartContainer, ChartTooltipContent } from "@/components/ui/chart";
import {
  db,
  formatMoney,
  getBranchSummaries,
  getDeliveryDelays,
  getDeliveryDistribution,
  getFunnel,
  getLostReasons,
  getMonthlyTrend,
  getNeverContactedLost,
  getNeverContactedLostValue,
  getOverviewKPIs,
  getPeriodRange,
  getTargetAttainment,
  type DashboardPeriod,
} from "@/lib/metrics";

const branches = [{ id: "all", name: "All branches" }, ...db.branches];
const funnelLabels = {
  new: "New",
  contacted: "Contacted",
  test_drive: "Test drive",
  negotiation: "Negotiation",
  order_placed: "Order placed",
  delivered: "Delivered",
};
const money = (n: number) => formatMoney(n);
const percent = (value: number) => `${value.toFixed(1)}%`;
const percentChange = (current: number, previous: number) =>
  previous ? ((current - previous) / previous) * 100 : 0;
const formatDate = (date: Date) =>
  new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);

function Sidebar({ range }: { range: { from: Date; to: Date } }) {
  return (
    <aside className="hidden w-56 shrink-0 border-r border-border bg-card md:flex md:flex-col">
      <div className="flex h-16 items-center gap-3 border-b px-5">
        <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <CarFront />
        </div>
        <div>
          <div className="font-semibold tracking-tight">DealerPulse</div>
          <div className="text-xs text-muted-foreground">
            Performance intelligence
          </div>
        </div>
      </div>
      <nav className="flex flex-col gap-1 p-3">
        <a
          className="flex items-center gap-3 rounded-md bg-secondary px-3 py-2.5 text-sm font-medium"
          href="#"
        >
          <LayoutDashboard className="size-4" />
          Overview
        </a>
        <a
          className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm text-muted-foreground hover:bg-secondary"
          href="#branches"
        >
          <Building2 className="size-4" />
          Branches
        </a>
        <a
          className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm text-muted-foreground hover:bg-secondary"
          href="#reps"
        >
          <Users className="size-4" />
          Sales team
        </a>
        <a
          className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm text-muted-foreground hover:bg-secondary"
          href="/leads"
        >
          <CircleHelp className="size-4" />
          Lead explorer
        </a>
        <a
          className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm text-muted-foreground hover:bg-secondary"
          href="#targets"
        >
          <Target className="size-4" />
          Targets
        </a>
      </nav>
      <div className="mt-auto border-t p-4 text-xs text-muted-foreground">
        Data through
        <span className="font-medium text-foreground">
          {formatDate(range.to)}
        </span>
        <br />
        Source data is refreshed from the dealership JSON
      </div>
    </aside>
  );
}
function Kpi({
  label,
  value,
  delta,
  icon: Icon,
}: {
  label: string;
  value: string;
  delta: string;
  icon: any;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="text-sm text-muted-foreground">{label}</div>
          <Icon className="size-4 text-muted-foreground" />
        </div>
        <div className="mt-3 tabular-nums text-2xl font-semibold tracking-tight">
          {value}
        </div>
        <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
          <ArrowUpRight className="size-3 text-emerald-600" />
          {delta} <span>vs previous period</span>
        </div>
      </CardContent>
    </Card>
  );
}
function Status({ children }: { children: string }) {
  return (
    <Badge
      variant={
        children === "Healthy"
          ? "secondary"
          : children === "Watch"
            ? "outline"
            : "destructive"
      }
    >
      {children}
    </Badge>
  );
}

function Dashboard() {
  const params = useSearchParams();
  const router = useRouter();
  const period = (params.get("period") as DashboardPeriod | null) ?? "last-six";
  const branch = params.get("branch") ?? "all";
  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    next.set(key, value);
    router.push(`/?${next.toString()}`);
  };

  const range = useMemo(() => getPeriodRange(period), [period]);
  const branchId = branch === "all" ? undefined : branch;
  const input = { ...range, branchId };
  const kpis = useMemo(() => getOverviewKPIs(input), [input]);
  const previousRange = useMemo(() => {
    if (period === "30") {
      const previousTo = new Date(range.from.getTime() - 86400000);
      return {
        from: new Date(previousTo.getTime() - 29 * 86400000),
        to: previousTo,
      };
    }
    const monthCount = period === "quarter" ? 3 : period === "all" ? 6 : 6;
    const previousTo = new Date(
      Date.UTC(
        range.from.getUTCFullYear(),
        range.from.getUTCMonth(),
        0,
        23,
        59,
        59,
        999,
      ),
    );
    const previousFrom = new Date(
      Date.UTC(
        previousTo.getUTCFullYear(),
        previousTo.getUTCMonth() - monthCount + 1,
        1,
      ),
    );
    return { from: previousFrom, to: previousTo };
  }, [period, range]);
  const previousKpis = useMemo(
    () => getOverviewKPIs({ ...previousRange, branchId }),
    [previousRange, branchId],
  );
  const branchSummaries = useMemo(
    () => getBranchSummaries(input),
    [input],
  );
  const monthlyTrend = useMemo(() => getMonthlyTrend(input), [input]);
  const funnel = useMemo(() => getFunnel(input), [input]);
  const lostReasons = useMemo(() => getLostReasons(input), [input]);
  const delayedOrders = useMemo(() => getDeliveryDelays(input), [input]);
  const deliveryDistribution = useMemo(
    () => getDeliveryDistribution(input),
    [input],
  );
  const neverContacted = useMemo(
    () => getNeverContactedLost(input),
    [input],
  );
  const neverContactedValue = useMemo(
    () => getNeverContactedLostValue(input),
    [input],
  );
  const targetAttainmentByBranch = useMemo(
    () =>
      branchSummaries.map((branchSummary) =>
        getTargetAttainment({ ...input, branchId: branchSummary.id }),
      ),
    [branchSummaries, input],
  );
  const avgDelivery = kpis.avgDelivery;
  const delayedCount = delayedOrders.filter((order) => order.days_to_deliver > 30).length;
  const neverContactedCount = [...neverContacted.values()].reduce((sum, count) => sum + count, 0);
  const worstBranch = [...branchSummaries].sort((a, b) => a.winRate - b.winRate)[0];
  const funnelMax = Math.max(...funnel.map((stage) => stage.count), 1);
  const previousUnitsChange = percentChange(kpis.units, previousKpis.units);
  const previousRevenueChange = percentChange(kpis.revenue, previousKpis.revenue);
  const previousWinRateChange = percentChange(kpis.winRate, previousKpis.winRate);
  const previousPipelineChange = percentChange(kpis.pipeline, previousKpis.pipeline);
  const previousDeliveryChange = percentChange(avgDelivery, previousKpis.avgDelivery);

  return (
    <div className="flex min-h-screen bg-muted/30">
      <Sidebar range={range} />
      <main className="min-w-0 flex-1">
        <header
          className="sticky top-0 z-10 flex min-h-16 flex-wrap items-center 
            justify-between gap-3 border-b bg-background/95 px-4 py-3 backdrop-blur sm:px-5 md:px-6"
        >
          <div className="flex items-center gap-3">
            <button
              className="rounded-md p-2 hover:bg-muted xl:hidden"
              aria-label="Open navigation"
            >
              <Menu className="size-5" />
            </button>
            <div>
              <p className="text-xs text-muted-foreground">
                Executive overview
              </p>
              <h1 className="text-lg font-semibold tracking-tight">
                Performance dashboard
              </h1>
            </div>
          </div>
          <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
            <Select
              value={period}
              onValueChange={(v) => setParam("period", v ?? period)}
            >
              <SelectTrigger className="w-[140px] bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All time</SelectItem>
                <SelectItem value="last-six">Last 6 months</SelectItem>
                <SelectItem value="quarter">Last quarter</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={branch}
              onValueChange={(v) => setParam("branch", v ?? branch)}
            >
              <SelectTrigger className="hidden w-[170px] bg-background sm:flex">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {branches.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <button
              className="rounded-md p-2 hover:bg-muted"
              aria-label="Notifications"
            >
              <Bell className="size-4" />
            </button>
          </div>
        </header>
        <div
          className="mx-auto max-w-[1500px] space-y-5 p-4 sm:p-5 
                                                            md:space-y-6 md:p-6 xl:p-8"
        >
          <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
            <ol className="flex items-center gap-2">
              <li><span aria-current="page" className="font-medium text-foreground">Overview</span></li>
            </ol>
          </nav>
          <section>
            <div className="mb-4 flex items-end justify-between">
              <div>
                <p className="text-sm font-medium text-primary">
                  Needs attention
                </p>
                <h2 className="mt-1 text-2xl font-semibold tracking-tight">
                  Where focus will move the needle
                </h2>
              </div>
              <button
                className="hidden items-center gap-1 text-sm text-muted-foreground 
                                                                        hover:text-foreground sm:flex"
              >
                View all insights
                <ChevronRight className="size-4" />
              </button>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <Card className="border-l-4 border-l-destructive">
                <CardContent className="flex items-start gap-3 p-4">
                  <div
                    className="mt-0.5 rounded-full bg-destructive/10 p-2 
                                                                                        text-destructive"
                  >
                    <Activity className="size-4" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">
                      {worstBranch?.name ?? "No branch data"} needs intervention
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {percent(worstBranch?.winRate ?? 0)} win rate, {worstBranch?.units ?? 0} deliveries from {worstBranch?.leads ?? 0} leads
                    </p>
                    <a
                      href="#branches"
                      className="mt-2 inline-flex items-center text-xs font-medium text-primary"
                    >
                      Review branch <ChevronRight className="size-3" />
                    </a>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="flex items-start gap-3 p-4">
                  <div className="mt-0.5 rounded-full bg-muted p-2">
                    <CarFront className="size-4" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">
                      {delayedCount} orders waiting 30+ days
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Average delivery is {avgDelivery.toFixed(1)} days in this period
                    </p>
                    <a
                      href="#delivery"
                      className="mt-2 inline-flex items-center text-xs font-medium text-primary"
                    >
                      See delays <ChevronRight className="size-3" />
                    </a>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="flex items-start gap-3 p-4">
                  <div className="mt-0.5 rounded-full bg-muted p-2">
                    <Users className="size-4" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">
                      {neverContactedCount} lost leads never contacted
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {money(neverContactedValue)} in missed opportunity value
                    </p>
                    <a
                      href="#funnel"
                      className="mt-2 inline-flex items-center text-xs font-medium text-primary"
                    >
                      Open funnel <ChevronRight className="size-3" />
                    </a>
                  </div>
                </CardContent>
              </Card>
            </div>
          </section>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <Kpi
              label="Units delivered"
              value={kpis.units.toLocaleString("en-IN")}
              delta={`${previousUnitsChange.toFixed(1)}%`}
              icon={CarFront}
            />
            <Kpi
              label="Revenue"
              value={money(kpis.revenue)}
              delta={`${previousRevenueChange.toFixed(1)}%`}
              icon={BarChart3}
            />
            <Kpi
              label="Win rate"
              value={percent(kpis.winRate)}
              delta={`${previousWinRateChange.toFixed(1)} pts`}
              icon={ArrowUpRight}
            />
            <Kpi
              label="Open pipeline"
              value={money(kpis.pipeline)}
              delta={`${previousPipelineChange.toFixed(1)}%`}
              icon={Activity}
            />
            <Kpi
              label="Avg. delivery"
              value={`${avgDelivery.toFixed(1)} days`}
              delta={`${previousDeliveryChange.toFixed(1)} days`}
              icon={ArrowDownRight}
            />
          </section>
          <section className="grid gap-6 xl:grid-cols-[1.55fr_1fr]">
            <Card>
              <CardHeader className="flex-row items-start justify-between">
                <div>
                  <CardTitle>Delivery & revenue trend</CardTitle>
                  <CardDescription>
                    Monthly performance in the selected period
                  </CardDescription>
                </div>
                <Badge variant="outline">
                  {formatDate(range.from)} – {formatDate(range.to)}
                </Badge>
              </CardHeader>
              <CardContent>
                <ChartContainer
                  config={{
                    units: { label: "Units", color: "var(--chart-2)" },
                    revenue: { label: "Revenue", color: "var(--chart-1)" },
                  }}
                  className="h-[260px] w-full"
                >
                  <AreaChart data={monthlyTrend}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    <XAxis dataKey="name" tickLine={false} axisLine={false} />
                    <YAxis yAxisId="left" tickLine={false} axisLine={false} />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip content={<ChartTooltipContent />} />
                    <Area
                      yAxisId="left"
                      type="monotone"
                      dataKey="units"
                      stroke="var(--color-units)"
                      fill="var(--color-units)"
                      fillOpacity={0.12}
                      strokeWidth={2}
                    />
                    <Area
                      yAxisId="right"
                      type="monotone"
                      dataKey="revenue"
                      stroke="var(--color-revenue)"
                      fill="var(--color-revenue)"
                      fillOpacity={0.04}
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ChartContainer>
              </CardContent>
            </Card>
            <Card id="funnel">
              <CardHeader>
                <CardTitle>Lead funnel</CardTitle>
                <CardDescription>
                  Reached stage at any point in history
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {funnel.map((stage, index) => (
                  <div key={stage.stage} className="flex items-center gap-3">
                    <span className="w-24 text-xs text-muted-foreground">
                      {funnelLabels[stage.stage]}
                    </span>
                    <Progress
                      value={(stage.count / funnelMax) * 100}
                      className="h-2 flex-1"
                    />
                    <span className="w-8 text-right text-sm tabular-nums font-medium">
                      {stage.count}
                    </span>
                    {index > 0 && (
                      <span className="w-10 text-right text-xs text-muted-foreground">
                        {Math.round((stage.count / funnel[index - 1].count) * 100)}%
                      </span>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          </section>
          <section
            id="branches"
            className="grid gap-6 xl:grid-cols-[1.55fr_1fr]"
          >
            <Card>
              <CardHeader>
                <CardTitle>Branch comparison</CardTitle>
                <CardDescription>
                  Win rate and stale lead health by location
                </CardDescription>
              </CardHeader>
              <CardContent className="px-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-6">Branch</TableHead>
                      <TableHead>Leads</TableHead>
                      <TableHead>Units</TableHead>
                      <TableHead>Win rate</TableHead>
                      <TableHead>Pipeline</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {branchSummaries.map((branchSummary) => (
                      <TableRow key={branchSummary.id}>
                        <TableCell className="pl-6">
                          <a
                            href={`/branch/${branchSummary.id}?period=${period}`}
                            className="font-medium hover:underline"
                          >
                            {branchSummary.name}
                            <span className="block text-xs font-normal text-muted-foreground">
                              {branchSummary.city}
                            </span>
                          </a>
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {branchSummary.leads}
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {branchSummary.units}
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {percent(branchSummary.winRate)}
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {money(branchSummary.pipeline)}
                        </TableCell>
                        <TableCell>
                          <Status>{branchSummary.status}</Status>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            <Card id="targets">
              <CardHeader>
                <CardTitle>Target attainment</CardTitle>
                <CardDescription className="flex items-center gap-1">
                  Neutral pacing view <CircleHelp className="size-3" />
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                {branchSummaries.map((branchSummary, index) => {
                  const attainment = targetAttainmentByBranch[index].units;
                  return (
                    <div key={branchSummary.id}>
                      <div className="mb-2 flex justify-between text-sm">
                        <span className="truncate pr-2">{branchSummary.name}</span>
                        <span className="tabular-nums text-muted-foreground">
                          {attainment.toFixed(1)}%
                        </span>
                      </div>
                      <Progress value={Math.min(100, attainment)} />
                    </div>
                  );
                })}
                <p className="border-t pt-4 text-xs text-muted-foreground">
                  Target attainment is calculated from source delivery totals and
                  target records for the selected period.
                </p>
              </CardContent>
            </Card>
          </section>
          <section className="grid gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Lost value by reason</CardTitle>
                <CardDescription>
                  Based on recorded lost reason only
                </CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-[160px_1fr] items-center gap-4">
                <div className="h-[170px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={lostReasons}
                        dataKey="value"
                        nameKey="reason"
                        innerRadius={48}
                        outerRadius={72}
                        paddingAngle={3}
                      >
                        {lostReasons.map((_, index) => (
                          <Cell
                            key={index}
                            fill={
                              ["#334155", "#64748b", "#94a3b8", "#cbd5e1"][index]
                            }
                          />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => money(Number(value))} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-3">
                  {lostReasons.map((reason, index) => (
                    <div
                      key={reason.reason}
                      className="flex items-center justify-between gap-4 text-sm"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="size-2 rounded-full"
                          style={{
                            backgroundColor: [
                              "#334155",
                              "#64748b",
                              "#94a3b8",
                              "#cbd5e1",
                            ][index],
                          }}
                        />
                        {reason.reason}
                      </div>
                      <span className="tabular-nums text-muted-foreground">
                        {money(reason.value)} · {reason.count}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
            <Card id="delivery">
              <CardHeader>
                <CardTitle>Delivery delays</CardTitle>
                <CardDescription>
                  {delayedCount} orders are waiting longer than 30 days
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-end gap-3">
                  <div className="text-4xl font-semibold tabular-nums">
                    {avgDelivery.toFixed(1)}
                  </div>
                  <div className="pb-1 text-sm text-muted-foreground">
                    average days to deliver
                  </div>
                </div>
                <div className="mt-5 h-[120px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={deliveryDistribution}>
                      <XAxis dataKey="name" tickLine={false} axisLine={false} />
                      <YAxis hide />
                      <Tooltip cursor={false} />
                      <Bar
                        dataKey="value"
                        fill="#64748b"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </section>
        </div>
      </main>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-muted/30" />}>
      <Dashboard />
    </Suspense>
  );
}
