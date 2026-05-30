import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Users, Building2, Target, CalendarDays, DollarSign,
  TrendingUp, ArrowRight, Layers, Flame, Thermometer, Snowflake,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar,
} from "recharts";
import { cn } from "@/lib/utils";
import { PageShell, Surface } from "@/components/PageShell";
import { KpiCard, type KpiTone } from "@/components/KpiCard";
import { apiRequest } from "@/lib/api";
import { useEvent } from "@/lib/event-context";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/")({
  component: Dashboard,
  head: () => ({ meta: [{ title: "Tableau de bord — AI EVENT OS" }] }),
});

// ── Types ──────────────────────────────────────────────────────────────────────

interface DashboardData {
  event: {
    id: number; name?: string; start_date?: string; end_date?: string;
    city?: string; country?: string; venue_name?: string; status?: string;
    budget?: number; expected_visitors?: number; expected_exhibitors?: number;
    type?: string; language?: string;
  };
  kpis: {
    visitors_total: number; expected_visitors: number;
    exhibitors_total: number; expected_exhibitors: number;
    leads_total: number; hot_leads: number; warm_leads: number; cold_leads: number;
    sessions_total: number; avg_lead_score: number; budget: number;
    visitors_by_type: Record<string, number>;
    leads_by_interest: Record<string, number>;
    sessions_by_type: Record<string, number>;
    sessions_by_status: Record<string, number>;
  };
  top_exhibitors: Array<{
    id: number; company_name?: string; annual_revenue?: number;
    sector?: string; country?: string;
  }>;
  visitors_chart: Array<{ date: string; count: number }>;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmt(n: number): string { return n.toLocaleString("fr-FR"); }

function fmtRevenue(val: number): string {
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)} MDH`;
  if (val >= 1_000) return `${Math.round(val / 1_000)}K MAD`;
  return `${val} MAD`;
}

function fmtDate(iso?: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
}

const INTEREST_LABELS: Record<string, string> = { hot: "Chaud", warm: "Tiède", cold: "Froid" };
const INTEREST_COLORS: Record<string, string> = {
  hot: "oklch(0.55 0.22 22)",
  warm: "oklch(0.78 0.16 75)",
  cold: "oklch(0.55 0.24 240)",
};
const SESSION_TYPE_COLORS: Record<string, string> = {
  keynote: "oklch(0.55 0.24 280)",
  workshop: "oklch(0.72 0.18 200)",
  panel: "oklch(0.78 0.16 75)",
  networking: "oklch(0.55 0.18 145)",
  conference: "oklch(0.6 0.05 270)",
};

// ── Skeleton ───────────────────────────────────────────────────────────────────

function DashSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
      </div>
      <div className="grid gap-4 lg:grid-cols-5">
        <Skeleton className="lg:col-span-3 h-80 rounded-2xl" />
        <Skeleton className="lg:col-span-2 h-80 rounded-2xl" />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-64 rounded-2xl" />)}
      </div>
    </div>
  );
}

// ── Progress bar ───────────────────────────────────────────────────────────────

function ProgressBar({ value, max, color = "bg-gradient-primary" }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
      <div className={cn("h-full rounded-full transition-all duration-700", color)} style={{ width: `${pct}%` }} />
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────

function Dashboard() {
  const { activeEvent } = useEvent();
  const eventId = activeEvent.id !== "0" ? activeEvent.id : null;

  const { data, isLoading, isError } = useQuery<DashboardData>({
    queryKey: ["dashboard", eventId],
    queryFn: () => apiRequest<DashboardData>(`/api/v1/analytics/dashboard/${eventId}`),
    enabled: !!eventId,
    staleTime: 60_000,
    retry: false,
  });

  if (!eventId) return (
    <PageShell eyebrow="Tableau de bord" title="Tableau de bord">
      <div className="flex flex-col items-center justify-center h-96 gap-3 text-center">
        <CalendarDays className="h-12 w-12 text-muted-foreground/30" />
        <p className="text-sm font-medium text-foreground">Sélectionnez un événement</p>
        <p className="text-xs text-muted-foreground">Utilisez le menu « Événement actif » en haut pour choisir un événement.</p>
      </div>
    </PageShell>
  );

  if (isLoading) return (
    <PageShell eyebrow="Tableau de bord" title={activeEvent.name}><DashSkeleton /></PageShell>
  );

  if (isError || !data) return (
    <PageShell eyebrow="Tableau de bord" title={activeEvent.name}>
      <div className="flex items-center justify-center h-64 text-sm text-muted-foreground">
        Impossible de charger les données TybotFlow.
      </div>
    </PageShell>
  );

  const { kpis, top_exhibitors, visitors_chart, event } = data;

  // ── KPI cards ────────────────────────────────────────────────────────────────
  const kpiCards: Array<{ label: string; value: string; sub: string; icon: React.ElementType; tone: KpiTone }> = [
    {
      label: "Visiteurs inscrits",
      value: fmt(kpis.visitors_total),
      sub: kpis.expected_visitors > 0 ? `/${fmt(kpis.expected_visitors)} attendus` : "total plateforme",
      icon: Users, tone: "primary",
    },
    {
      label: "Exposants",
      value: fmt(kpis.exhibitors_total),
      sub: kpis.expected_exhibitors > 0 ? `/${fmt(kpis.expected_exhibitors)} attendus` : "total plateforme",
      icon: Building2, tone: "blue",
    },
    {
      label: "Leads générés",
      value: fmt(kpis.leads_total),
      sub: `${fmt(kpis.hot_leads)} chauds`,
      icon: Target, tone: "green",
    },
    {
      label: "Sessions",
      value: fmt(kpis.sessions_total),
      sub: `pour cet événement`,
      icon: CalendarDays, tone: "amber",
    },
    {
      label: "Budget",
      value: kpis.budget ? fmtRevenue(kpis.budget) : "—",
      sub: "budget alloué",
      icon: DollarSign, tone: "rose",
    },
  ];

  // ── Leads pie ────────────────────────────────────────────────────────────────
  const leadsData = (["hot", "warm", "cold"] as const)
    .map((k) => ({ name: INTEREST_LABELS[k], value: kpis.leads_by_interest[k] ?? 0, color: INTEREST_COLORS[k] }))
    .filter((d) => d.value > 0);

  // ── Sessions bar ─────────────────────────────────────────────────────────────
  const sessionsData = Object.entries(kpis.sessions_by_type).map(([type, count]) => ({
    name: type.charAt(0).toUpperCase() + type.slice(1),
    count,
    fill: SESSION_TYPE_COLORS[type] ?? "oklch(0.6 0.05 270)",
  }));

  const maxRevenue = Math.max(...top_exhibitors.map((e) => e.annual_revenue ?? 0), 1);

  return (
    <PageShell
      eyebrow="Tableau de bord"
      title={event.name ?? activeEvent.name}
      description={[
        fmtDate(event.start_date) !== "—" ? `${fmtDate(event.start_date)} — ${fmtDate(event.end_date)}` : null,
        [event.venue_name, event.city, event.country].filter(Boolean).join(", ") || null,
      ].filter(Boolean).join(" · ")}
    >
      {/* KPI row */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
        {kpiCards.map((k) => <KpiCard key={k.label} {...k} delta={null} />)}
      </div>

      {/* Charts row */}
      <div className="grid gap-4 lg:grid-cols-5">

        {/* Visitors area chart */}
        <Surface className="lg:col-span-3 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-display text-base font-semibold">Inscriptions visiteurs</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {visitors_chart.length > 0
                  ? `${fmt(kpis.visitors_total)} inscrits · données par date`
                  : `${fmt(kpis.visitors_total)} visiteurs inscrits sur la plateforme`}
              </p>
            </div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <TrendingUp className="h-3.5 w-3.5" /> par date
            </div>
          </div>
          <div className="h-64">
            {visitors_chart.length === 0 ? (
              <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                Aucune donnée de date disponible
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={visitors_chart} margin={{ top: 10, right: 10, bottom: 0, left: -10 }}>
                  <defs>
                    <linearGradient id="ag" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="oklch(0.55 0.24 280)" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="oklch(0.55 0.24 280)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.92 0.012 285)" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={fmtShortDate} fontSize={11} tickLine={false} axisLine={false} stroke="oklch(0.5 0.03 270)" />
                  <YAxis fontSize={11} tickLine={false} axisLine={false} stroke="oklch(0.5 0.03 270)" allowDecimals={false} />
                  <Tooltip
                    labelFormatter={(v) => fmtShortDate(v as string)}
                    formatter={(v) => [`${v} inscrits`, "Visiteurs"]}
                    contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 12 }}
                  />
                  <Area type="monotone" dataKey="count" stroke="oklch(0.55 0.24 280)" strokeWidth={3} fill="url(#ag)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
          {/* Expected vs actual */}
          {kpis.expected_visitors > 0 && (
            <div className="mt-3 space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Objectif visiteurs</span>
                <span className="font-medium text-foreground">
                  {fmt(kpis.visitors_total)} / {fmt(kpis.expected_visitors)}
                </span>
              </div>
              <ProgressBar value={kpis.visitors_total} max={kpis.expected_visitors} />
            </div>
          )}
        </Surface>

        {/* Leads pipeline pie */}
        <Surface className="lg:col-span-2 p-6">
          <h2 className="font-display text-base font-semibold">Pipeline leads</h2>
          <p className="text-xs text-muted-foreground mt-0.5 mb-4">
            Niveau d'intérêt · Score moy. <span className="font-medium text-foreground">{kpis.avg_lead_score}/100</span>
          </p>
          {leadsData.length === 0 ? (
            <div className="flex items-center justify-center h-44 text-sm text-muted-foreground">
              Aucun lead enregistré
            </div>
          ) : (
            <div className="flex items-center gap-4">
              <div className="relative h-44 w-44 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={leadsData} innerRadius={52} outerRadius={78} paddingAngle={3} dataKey="value" stroke="none">
                      {leadsData.map((e) => <Cell key={e.name} fill={e.color} />)}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <p className="font-display text-2xl font-bold tabular-nums">{fmt(kpis.leads_total)}</p>
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Leads</p>
                </div>
              </div>
              <div className="flex-1 space-y-3 min-w-0">
                {[
                  { key: "hot", label: "Chaud", icon: Flame, value: kpis.hot_leads },
                  { key: "warm", label: "Tiède", icon: Thermometer, value: kpis.warm_leads },
                  { key: "cold", label: "Froid", icon: Snowflake, value: kpis.cold_leads },
                ].map(({ key, label, icon: Icon, value }) => (
                  <div key={key} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ background: INTEREST_COLORS[key] }} />
                        <Icon className="h-3 w-3" style={{ color: INTEREST_COLORS[key] }} />
                        <span className="text-foreground">{label}</span>
                      </div>
                      <span className="text-muted-foreground tabular-nums">
                        {fmt(value)} <span className="opacity-60">({kpis.leads_total > 0 ? ((value / kpis.leads_total) * 100).toFixed(0) : 0}%)</span>
                      </span>
                    </div>
                    <ProgressBar value={value} max={kpis.leads_total} color={key === "hot" ? "bg-rose-500" : key === "warm" ? "bg-amber-400" : "bg-blue-500"} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </Surface>
      </div>

      {/* Bottom row */}
      <div className="grid gap-4 lg:grid-cols-3">

        {/* Top exhibitors */}
        <Surface className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-base font-semibold">Top exposants</h2>
            <span className="text-[11px] text-muted-foreground">par CA annuel</span>
          </div>
          {top_exhibitors.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun exposant</p>
          ) : (
            <div className="space-y-3.5">
              {top_exhibitors.map((e, i) => (
                <div key={e.id}>
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="font-medium flex items-center gap-2">
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-muted text-[10px] font-bold text-muted-foreground">{i + 1}</span>
                      <span className="truncate max-w-[120px]">{e.company_name ?? `#${e.id}`}</span>
                    </span>
                    <span className="text-muted-foreground tabular-nums">
                      {e.annual_revenue ? fmtRevenue(e.annual_revenue) : "—"}
                    </span>
                  </div>
                  <ProgressBar value={e.annual_revenue ?? 0} max={maxRevenue} />
                </div>
              ))}
            </div>
          )}
          {kpis.expected_exhibitors > 0 && (
            <div className="mt-4 pt-3 border-t border-border/50 space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Objectif exposants</span>
                <span className="font-medium text-foreground">{fmt(kpis.exhibitors_total)} / {fmt(kpis.expected_exhibitors)}</span>
              </div>
              <ProgressBar value={kpis.exhibitors_total} max={kpis.expected_exhibitors} />
            </div>
          )}
        </Surface>

        {/* Sessions par type */}
        <Surface className="p-6">
          <h2 className="font-display text-base font-semibold mb-1">Sessions de l'événement</h2>
          <p className="text-xs text-muted-foreground mb-4">{fmt(kpis.sessions_total)} sessions au programme</p>
          {sessionsData.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
              Aucune session programmée
            </div>
          ) : (
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={sessionsData} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.92 0.012 285)" vertical={false} />
                  <XAxis dataKey="name" fontSize={11} tickLine={false} axisLine={false} stroke="oklch(0.5 0.03 270)" />
                  <YAxis fontSize={11} tickLine={false} axisLine={false} stroke="oklch(0.5 0.03 270)" allowDecimals={false} />
                  <Tooltip
                    formatter={(v) => [`${v}`, "Sessions"]}
                    contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 12 }}
                  />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {sessionsData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className="mt-3 space-y-1.5">
            {Object.entries(kpis.sessions_by_status).map(([status, count]) => (
              <div key={status} className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground capitalize">{status}</span>
                <span className="font-medium tabular-nums">{fmt(count)}</span>
              </div>
            ))}
          </div>
        </Surface>

        {/* Résumé événement */}
        <Surface className="p-6">
          <h2 className="font-display text-base font-semibold mb-4">Résumé événement</h2>
          <ul className="space-y-3">
            {[
              { icon: Users, label: "Visiteurs", value: fmt(kpis.visitors_total), color: "bg-primary/10 text-primary" },
              { icon: Building2, label: "Exposants", value: fmt(kpis.exhibitors_total), color: "bg-info/10 text-info" },
              { icon: Flame, label: "Leads chauds", value: fmt(kpis.hot_leads), color: "bg-rose-500/10 text-rose-500" },
              { icon: CalendarDays, label: "Sessions", value: fmt(kpis.sessions_total), color: "bg-warning/10 text-warning" },
              { icon: Layers, label: "Score moy. leads", value: `${kpis.avg_lead_score}/100`, color: "bg-accent text-accent-foreground" },
            ].map(({ icon: Icon, label, value, color }) => (
              <li key={label} className="flex items-center gap-3 rounded-lg p-2 -mx-2 hover:bg-muted/40 transition-colors">
                <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", color)}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="flex flex-1 items-center justify-between min-w-0">
                  <p className="text-sm text-muted-foreground">{label}</p>
                  <p className="text-sm font-semibold tabular-nums">{value}</p>
                </div>
              </li>
            ))}
          </ul>
          <button className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-primary hover:gap-2 transition-all">
            Voir rapports détaillés <ArrowRight className="h-3 w-3" />
          </button>
        </Surface>

      </div>
    </PageShell>
  );
}
