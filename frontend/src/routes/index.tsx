import { createFileRoute } from "@tanstack/react-router";
import { useQueries } from "@tanstack/react-query";
import {
  Plus,
  Users,
  Building2,
  Target,
  CalendarDays,
  DollarSign,
  AlertTriangle,
  UserPlus,
  Sparkles,
  CalendarPlus,
  CreditCard,
  ArrowRight,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PageShell, Surface } from "@/components/PageShell";
import { KpiCard, type KpiTone } from "@/components/KpiCard";
import { apiRequest } from "@/lib/api";

export const Route = createFileRoute("/")({
  component: Dashboard,
  head: () => ({
    meta: [
      { title: "Tableau de bord — AI EVENT OS" },
      { name: "description", content: "Vue d'ensemble en temps réel : visiteurs, exposants, leads, revenus et alertes." },
    ],
  }),
});

async function fetchCount(table: string): Promise<unknown[]> {
  const raw = await apiRequest<unknown[] | { list: unknown[] }>(`/api/v1/data/${table}`);
  return Array.isArray(raw) ? raw : raw.list;
}

interface Event {
  id: number;
  name?: string;
  start_date?: string;
  end_date?: string;
  city?: string;
  country?: string;
  venue_name?: string;
  status?: string;
  budget?: number;
}

interface Lead {
  id: number;
  interest_level?: string;
  lead_score?: number;
}

const visitorsChartData = [
  { day: "J-4", v: 0 },
  { day: "J-3", v: 0 },
  { day: "J-2", v: 0 },
  { day: "J-1", v: 0 },
  { day: "Jour 1", v: 0 },
  { day: "Jour 2", v: 0 },
  { day: "Jour 3", v: 0 },
];

const toneBg: Record<KpiTone, string> = {
  primary: "bg-primary/10 text-primary",
  blue: "bg-info/10 text-info",
  green: "bg-success/10 text-success",
  amber: "bg-warning/10 text-warning",
  rose: "bg-destructive/10 text-destructive",
  violet: "bg-accent text-accent-foreground",
};

const activities = [
  { icon: UserPlus, text: "Nouveau visiteur inscrit", time: "il y a 2 min", tone: "primary" as KpiTone },
  { icon: Sparkles, text: "Lead qualifié — score élevé détecté", time: "il y a 5 min", tone: "green" as KpiTone },
  { icon: CalendarPlus, text: "Nouveau RDV B2B programmé", time: "il y a 7 min", tone: "blue" as KpiTone },
  { icon: CreditCard, text: "Paiement reçu — nouvel exposant", time: "il y a 10 min", tone: "amber" as KpiTone },
];

function formatRevenue(val: number): string {
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(2)} MDH`;
  if (val >= 1_000) return `${Math.round(val / 1_000)}K MAD`;
  return `${val} MAD`;
}

function formatDate(iso?: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

function Dashboard() {
  const results = useQueries({
    queries: [
      { queryKey: ["dash-events"], queryFn: () => fetchCount("events") },
      { queryKey: ["dash-visitors"], queryFn: () => fetchCount("visitors") },
      { queryKey: ["dash-exhibitors"], queryFn: () => fetchCount("exhibitors") },
      { queryKey: ["dash-leads"], queryFn: () => fetchCount("leads") },
    ],
  });

  const [eventsQ, visitorsQ, exhibitorsQ, leadsQ] = results;
  const isLoading = results.some((r) => r.isLoading);

  const events = (eventsQ.data ?? []) as Event[];
  const visitors = visitorsQ.data ?? [];
  const exhibitors = exhibitorsQ.data ?? [];
  const leads = (leadsQ.data ?? []) as Lead[];

  const activeEvent = events.find((e) => e.status === "live") ?? events[0];

  const totalBudget = events.reduce((sum, e) => sum + (e.budget ?? 0), 0);

  const hotLeads = leads.filter((l) => l.interest_level === "hot").length;
  const warmLeads = leads.filter((l) => l.interest_level === "warm").length;
  const coldLeads = leads.filter((l) => l.interest_level === "cold").length;

  const leadsData = [
    { name: "Chaud", value: hotLeads || 1, color: "oklch(0.55 0.22 22)" },
    { name: "Tiède", value: warmLeads || 1, color: "oklch(0.78 0.16 75)" },
    { name: "Froid", value: coldLeads || 1, color: "oklch(0.55 0.24 240)" },
  ];
  const totalLeads = leads.length;

  const topExhibitors = (exhibitorsQ.data ?? []).slice(0, 5) as { id: number; company_name?: string; annual_revenue?: number }[];
  const maxRevenue = Math.max(...topExhibitors.map((e) => e.annual_revenue ?? 0), 1);

  const kpis = [
    {
      label: "Visiteurs inscrits",
      value: isLoading ? "…" : visitors.length.toLocaleString("fr-FR"),
      delta: null,
      sub: `${events.length} événements`,
      icon: Users,
      tone: "primary" as KpiTone,
    },
    {
      label: "Exposants",
      value: isLoading ? "…" : exhibitors.length.toLocaleString("fr-FR"),
      delta: null,
      sub: "profils actifs",
      icon: Building2,
      tone: "blue" as KpiTone,
    },
    {
      label: "Leads générés",
      value: isLoading ? "…" : leads.length.toLocaleString("fr-FR"),
      delta: null,
      sub: `${hotLeads} chauds`,
      icon: Target,
      tone: "green" as KpiTone,
    },
    {
      label: "Événements",
      value: isLoading ? "…" : events.length.toLocaleString("fr-FR"),
      delta: null,
      sub: events.filter((e) => e.status === "live").length + " en cours",
      icon: CalendarDays,
      tone: "amber" as KpiTone,
    },
    {
      label: "Budget total",
      value: isLoading ? "…" : formatRevenue(totalBudget),
      delta: null,
      sub: "tous événements",
      icon: DollarSign,
      tone: "rose" as KpiTone,
    },
  ];

  const alertes = [
    {
      text: `${exhibitors.length} exposants enregistrés`,
      severity: "success",
    },
    {
      text: `${visitors.length} visiteurs inscrits`,
      severity: "info",
    },
    {
      text: activeEvent ? `Événement actif : ${activeEvent.name ?? "—"}` : "Aucun événement actif",
      severity: activeEvent ? "success" : "warning",
    },
  ];

  return (
    <PageShell
      eyebrow="Tableau de bord"
      title={activeEvent?.name ?? "Tableau de bord"}
      description={
        activeEvent
          ? `${formatDate(activeEvent.start_date)} — ${formatDate(activeEvent.end_date)} · ${[activeEvent.venue_name, activeEvent.city, activeEvent.country].filter(Boolean).join(", ")}`
          : "Vue d'ensemble de votre plateforme événementielle"
      }
      actions={
        <>
          <Button variant="outline" size="sm" className="h-9">
            Exporter
          </Button>
          <Button size="sm" className="h-9 bg-gradient-primary text-primary-foreground shadow-glow-sm hover:shadow-glow">
            <Plus className="h-4 w-4" />
            Nouvelle action
          </Button>
        </>
      }
    >
      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
        {kpis.map((k) => (
          <KpiCard key={k.label} {...k} />
        ))}
      </div>

      {/* Charts row */}
      <div className="grid gap-4 lg:grid-cols-5">
        <Surface className="lg:col-span-3 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-display text-base font-semibold text-foreground">Visiteurs par jour</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Évolution des inscriptions</p>
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={visitorsChartData} margin={{ top: 10, right: 10, bottom: 0, left: -10 }}>
                <defs>
                  <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="oklch(0.55 0.24 280)" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="oklch(0.55 0.24 280)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="lineGrad" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="oklch(0.55 0.24 280)" />
                    <stop offset="100%" stopColor="oklch(0.72 0.21 295)" />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.92 0.012 285)" vertical={false} />
                <XAxis dataKey="day" stroke="oklch(0.5 0.03 270)" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="oklch(0.5 0.03 270)" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ background: "oklch(1 0 0)", border: "1px solid oklch(0.92 0.012 285)", borderRadius: 12, fontSize: 12 }} />
                <Area type="monotone" dataKey="v" stroke="url(#lineGrad)" strokeWidth={3} fill="url(#areaGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          {visitors.length > 0 && (
            <p className="text-xs text-muted-foreground mt-2 text-center">
              Données temps-réel à venir · {visitors.length} inscrits au total
            </p>
          )}
        </Surface>

        <Surface className="lg:col-span-2 p-6">
          <h2 className="font-display text-base font-semibold text-foreground">Leads par intérêt</h2>
          <p className="text-xs text-muted-foreground mt-0.5 mb-4">Répartition du pipeline commercial</p>
          <div className="flex items-center gap-4">
            <div className="relative h-44 w-44 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={leadsData} innerRadius={56} outerRadius={82} paddingAngle={3} dataKey="value" stroke="none">
                    {leadsData.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <p className="font-display text-2xl font-bold text-foreground tabular-nums">
                  {isLoading ? "…" : totalLeads.toLocaleString("fr-FR")}
                </p>
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Leads</p>
              </div>
            </div>
            <div className="flex-1 space-y-2.5 min-w-0">
              {leadsData.map((l) => {
                const pct = totalLeads > 0 ? ((l.value / totalLeads) * 100).toFixed(1) : "0.0";
                return (
                  <div key={l.name} className="flex items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ background: l.color }} />
                      <span className="text-foreground truncate">{l.name}</span>
                    </div>
                    <span className="text-muted-foreground tabular-nums whitespace-nowrap">
                      {l.value.toLocaleString("fr-FR")} <span className="opacity-60">({pct}%)</span>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </Surface>
      </div>

      {/* Bottom 3 columns */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Surface className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-base font-semibold text-foreground">Top exposants</h2>
            <span className="text-[11px] text-muted-foreground">par CA annuel</span>
          </div>
          <div className="space-y-3.5">
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Chargement…</p>
            ) : topExhibitors.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun exposant</p>
            ) : (
              topExhibitors.map((e, i) => (
                <div key={e.id}>
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="text-foreground font-medium flex items-center gap-2">
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-muted text-[10px] font-bold text-muted-foreground">
                        {i + 1}
                      </span>
                      {e.company_name ?? `Exposant #${e.id}`}
                    </span>
                    <span className="text-muted-foreground tabular-nums font-medium">
                      {formatRevenue(e.annual_revenue ?? 0)}
                    </span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-primary transition-all duration-700"
                      style={{ width: `${((e.annual_revenue ?? 0) / maxRevenue) * 100}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </Surface>

        <Surface className="p-6">
          <h2 className="font-display text-base font-semibold text-foreground mb-4">Activité récente</h2>
          <ul className="space-y-3.5">
            {activities.map((a, i) => (
              <li key={i} className="flex items-start gap-3">
                <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", toneBg[a.tone])}>
                  <a.icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-foreground leading-snug">{a.text}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{a.time}</p>
                </div>
              </li>
            ))}
          </ul>
          <button className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-primary hover:gap-2 transition-all">
            Voir tout le flux <ArrowRight className="h-3 w-3" />
          </button>
        </Surface>

        <Surface className="p-6">
          <h2 className="font-display text-base font-semibold text-foreground mb-4">Résumé plateforme</h2>
          <ul className="space-y-3">
            {alertes.map((a, i) => (
              <li key={i} className="flex items-start gap-3 rounded-lg p-2 -mx-2 transition-colors hover:bg-muted/40">
                <div className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                  a.severity === "warning" && "bg-warning/10 text-warning",
                  a.severity === "info" && "bg-info/10 text-info",
                  a.severity === "success" && "bg-success/10 text-success",
                )}>
                  <AlertTriangle className="h-4 w-4" />
                </div>
                <p className="text-sm text-foreground leading-snug pt-1.5">{a.text}</p>
              </li>
            ))}
          </ul>
          <button className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-primary hover:gap-2 transition-all">
            Voir toutes les alertes <ArrowRight className="h-3 w-3" />
          </button>
        </Surface>
      </div>
    </PageShell>
  );
}
