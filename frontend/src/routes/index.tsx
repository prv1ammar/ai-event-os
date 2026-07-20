import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import {
  Users, Building2, CalendarDays, DollarSign, Target,
  TrendingUp, ArrowRight, Layers, CheckCircle2, Clock3, XCircle, ChevronDown,
  type LucideIcon,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar,
} from "recharts";
import { cn } from "@/lib/utils";
import { PageShell, Surface } from "@/components/PageShell";
import { KpiCard, type KpiTone } from "@/components/KpiCard";
import { apiRequest } from "@/lib/api";
import { useEvent, type ActiveEvent } from "@/lib/event-context";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";

export const Route = createFileRoute("/")({
  component: Dashboard,
  head: () => ({ meta: [{ title: "Tableau de bord — AI EVENT OS" }] }),
});

// ── Types ──────────────────────────────────────────────────────────────────────

interface DashboardData {
  events: Array<{
    id: number; name?: string; start_date?: string; end_date?: string;
    event_type?: string; status?: string; is_free?: boolean;
    venue?: { id: number; name?: string } | null;
  }>;
  kpis: {
    visitors_total: number; visitors_confirmed: number; visitors_arrived: number;
    exhibitors_total: number; exhibitors_confirmed: number;
    sessions_total: number;
    orders_total: number; orders_paid: number;
    leads_total: number;
    revenue_paid: number; revenue_pending: number;
    visitors_by_status: Record<string, number>;
    exhibitors_by_status: Record<string, number>;
    sessions_by_type: Record<string, number>;
    sessions_by_status: Record<string, number>;
    orders_by_status: Record<string, number>;
    orders_by_type: Record<string, number>;
  };
  top_orders: Array<{
    id: number; order_number?: string; total: number;
    status?: string; order_type?: string;
  }>;
  visitors_chart: Array<{ date: string; count: number }>;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmt(n: number): string { return n.toLocaleString("fr-FR"); }

function fmtMAD(val: number): string {
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)} MDH`;
  if (val >= 1_000) return `${Math.round(val / 1_000)}K MAD`;
  return `${Math.round(val)} MAD`;
}

function fmtDate(iso?: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
}

const REG_STATUS_LABELS: Record<string, string> = {
  confirmed: "Confirmé", pending: "En attente", cancelled: "Annulé", no_show: "Absent",
};
const REG_STATUS_COLORS: Record<string, string> = {
  confirmed: "oklch(0.55 0.18 145)",
  pending: "oklch(0.78 0.16 75)",
  cancelled: "oklch(0.6 0.05 270)",
  no_show: "oklch(0.55 0.22 22)",
};
const SESSION_TYPE_COLORS: Record<string, string> = {
  keynote: "oklch(0.55 0.24 280)",
  workshop: "oklch(0.72 0.18 200)",
  panel: "oklch(0.78 0.16 75)",
  networking: "oklch(0.55 0.18 145)",
  conference: "oklch(0.6 0.05 270)",
};
const ORDER_TYPE_LABELS: Record<string, string> = {
  billet: "Billet", stand: "Stand", sponsoring: "Sponsoring", package: "Package",
};
const ORDER_STATUS_LABELS: Record<string, string> = {
  draft: "Brouillon", pending: "En attente", paid: "Payée", partial: "Partielle",
  cancelled: "Annulée", refunded: "Remboursée",
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

// ── Event multi-select ──────────────────────────────────────────────────────────

function EventMultiSelect({ events, selected, onChange }: {
  events: ActiveEvent[]; selected: string[]; onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);

  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  }

  const label =
    selected.length === 0 ? "Sélectionner des événements"
    : selected.length === events.length ? "Tous les événements"
    : selected.length === 1 ? (events.find((e) => e.id === selected[0])?.shortName ?? "1 événement")
    : `${selected.length} événements`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 min-w-[200px] justify-between gap-2 text-xs">
          <span className="truncate">{label}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[300px] p-0">
        <Command>
          <CommandInput placeholder="Rechercher un événement…" className="text-xs" />
          <CommandList>
            <CommandEmpty>Aucun événement trouvé.</CommandEmpty>
            <CommandGroup>
              {events.map((e) => {
                const checked = selected.includes(e.id);
                return (
                  <CommandItem
                    key={e.id}
                    value={e.name}
                    onSelect={() => toggle(e.id)}
                    className="cursor-pointer gap-2"
                  >
                    <Checkbox checked={checked} onCheckedChange={() => toggle(e.id)} />
                    <span className="flex-1 truncate text-xs">{e.name}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────

function Dashboard() {
  const { activeEvent, allEvents } = useEvent();
  const [selectedEventIds, setSelectedEventIds] = useState<string[]>([]);

  useEffect(() => {
    if (selectedEventIds.length === 0 && activeEvent.id !== "0") {
      setSelectedEventIds([activeEvent.id]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeEvent.id]);

  const sortedIds = selectedEventIds.slice().sort();
  const eventSelector = <EventMultiSelect events={allEvents} selected={selectedEventIds} onChange={setSelectedEventIds} />;

  const { data, isLoading, isError } = useQuery<DashboardData>({
    queryKey: ["dashboard", sortedIds.join(",")],
    queryFn: () => apiRequest<DashboardData>(`/api/v1/analytics/dashboard?event_ids=${sortedIds.join(",")}`),
    enabled: sortedIds.length > 0,
    staleTime: 60_000,
    retry: false,
  });

  if (sortedIds.length === 0) return (
    <PageShell eyebrow="Tableau de bord" title="Tableau de bord" actions={eventSelector}>
      <div className="flex flex-col items-center justify-center h-96 gap-3 text-center">
        <CalendarDays className="h-12 w-12 text-muted-foreground/30" />
        <p className="text-sm font-medium text-foreground">Sélectionnez un ou plusieurs événements</p>
        <p className="text-xs text-muted-foreground">Utilisez le sélecteur ci-dessus pour choisir un ou plusieurs événements à afficher.</p>
      </div>
    </PageShell>
  );

  if (isLoading) return (
    <PageShell eyebrow="Tableau de bord" title="Tableau de bord" actions={eventSelector}><DashSkeleton /></PageShell>
  );

  if (isError || !data) return (
    <PageShell eyebrow="Tableau de bord" title="Tableau de bord" actions={eventSelector}>
      <div className="flex items-center justify-center h-64 text-sm text-muted-foreground">
        Impossible de charger les données TybotFlow.
      </div>
    </PageShell>
  );

  const { kpis, top_orders, visitors_chart, events } = data;
  const isMulti = events.length > 1;
  const dashboardTitle = isMulti ? `${events.length} événements sélectionnés` : (events[0]?.name ?? activeEvent.name);
  const dashboardDescription = isMulti
    ? events.map((e) => e.name).join(" · ")
    : [
        fmtDate(events[0]?.start_date) !== "—" ? `${fmtDate(events[0]?.start_date)} — ${fmtDate(events[0]?.end_date)}` : null,
        events[0]?.venue?.name ?? null,
      ].filter(Boolean).join(" · ");

  // ── KPI cards ────────────────────────────────────────────────────────────────
  const kpiCards: Array<{ label: string; value: string; sub: string; icon: LucideIcon; tone: KpiTone }> = [
    {
      label: "Visiteurs inscrits",
      value: fmt(kpis.visitors_total),
      sub: `${fmt(kpis.visitors_confirmed)} confirmés`,
      icon: Users, tone: "primary",
    },
    {
      label: "Exposants",
      value: fmt(kpis.exhibitors_total),
      sub: `${fmt(kpis.exhibitors_confirmed)} confirmés`,
      icon: Building2, tone: "blue",
    },
    {
      label: "Leads générés",
      value: fmt(kpis.leads_total),
      sub: "contacts CRM",
      icon: Target, tone: "green",
    },
    {
      label: "Sessions",
      value: fmt(kpis.sessions_total),
      sub: "au programme",
      icon: CalendarDays, tone: "amber",
    },
    {
      label: "Revenu encaissé",
      value: kpis.revenue_paid > 0 ? fmtMAD(kpis.revenue_paid) : "—",
      sub: kpis.revenue_pending > 0 ? `${fmtMAD(kpis.revenue_pending)} en attente` : "commandes payées",
      icon: DollarSign, tone: "rose",
    },
  ];

  // ── Registrations pie ────────────────────────────────────────────────────────
  const regData = Object.entries(kpis.visitors_by_status)
    .map(([k, v]) => ({
      key: k,
      name: REG_STATUS_LABELS[k] ?? k,
      value: v,
      color: REG_STATUS_COLORS[k] ?? "oklch(0.6 0.05 270)",
    }))
    .filter((d) => d.value > 0);

  // ── Sessions bar ─────────────────────────────────────────────────────────────
  const sessionsData = Object.entries(kpis.sessions_by_type).map(([type, count]) => ({
    name: type.charAt(0).toUpperCase() + type.slice(1),
    count,
    fill: SESSION_TYPE_COLORS[type] ?? "oklch(0.6 0.05 270)",
  }));

  const maxOrder = Math.max(...top_orders.map((o) => o.total), 1);

  return (
    <PageShell
      eyebrow="Tableau de bord"
      title={dashboardTitle}
      description={dashboardDescription}
      actions={eventSelector}
    >
      {/* KPI row */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
        {kpiCards.map((k) => <KpiCard key={k.label} {...k} />)}
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
                  : `${fmt(kpis.visitors_total)} visiteurs inscrits sur cet événement`}
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
          {/* Arrivals vs registrations */}
          {kpis.visitors_total > 0 && (
            <div className="mt-3 space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Arrivés sur site</span>
                <span className="font-medium text-foreground">
                  {fmt(kpis.visitors_arrived)} / {fmt(kpis.visitors_total)}
                </span>
              </div>
              <ProgressBar value={kpis.visitors_arrived} max={kpis.visitors_total} />
            </div>
          )}
        </Surface>

        {/* Registrations pie */}
        <Surface className="lg:col-span-2 p-6">
          <h2 className="font-display text-base font-semibold">Statut des inscriptions</h2>
          <p className="text-xs text-muted-foreground mt-0.5 mb-4">
            Visiteurs par statut d'inscription
          </p>
          {regData.length === 0 ? (
            <div className="flex items-center justify-center h-44 text-sm text-muted-foreground">
              Aucun visiteur inscrit
            </div>
          ) : (
            <div className="flex items-center gap-4">
              <div className="relative h-44 w-44 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={regData} innerRadius={52} outerRadius={78} paddingAngle={3} dataKey="value" stroke="none">
                      {regData.map((e) => <Cell key={e.key} fill={e.color} />)}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <p className="font-display text-2xl font-bold tabular-nums">{fmt(kpis.visitors_total)}</p>
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Inscrits</p>
                </div>
              </div>
              <div className="flex-1 space-y-3 min-w-0">
                {regData.map(({ key, name, value, color }) => (
                  <div key={key} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ background: color }} />
                        <span className="text-foreground">{name}</span>
                      </div>
                      <span className="text-muted-foreground tabular-nums">
                        {fmt(value)} <span className="opacity-60">({kpis.visitors_total > 0 ? ((value / kpis.visitors_total) * 100).toFixed(0) : 0}%)</span>
                      </span>
                    </div>
                    <ProgressBar value={value} max={kpis.visitors_total} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </Surface>
      </div>

      {/* Bottom row */}
      <div className="grid gap-4 lg:grid-cols-3">

        {/* Top orders */}
        <Surface className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-base font-semibold">Top commandes</h2>
            <span className="text-[11px] text-muted-foreground">par montant</span>
          </div>
          {top_orders.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune commande</p>
          ) : (
            <div className="space-y-3.5">
              {top_orders.map((o, i) => (
                <div key={o.id}>
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="font-medium flex items-center gap-2">
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-muted text-[10px] font-bold text-muted-foreground">{i + 1}</span>
                      <span className="truncate max-w-[110px]">{o.order_number ?? `#${o.id}`}</span>
                      {o.order_type && (
                        <span className="text-[10px] text-muted-foreground">{ORDER_TYPE_LABELS[o.order_type] ?? o.order_type}</span>
                      )}
                    </span>
                    <span className="text-muted-foreground tabular-nums">{fmtMAD(o.total)}</span>
                  </div>
                  <ProgressBar value={o.total} max={maxOrder} />
                </div>
              ))}
            </div>
          )}
          {kpis.orders_total > 0 && (
            <div className="mt-4 pt-3 border-t border-border/50 space-y-1.5">
              {Object.entries(kpis.orders_by_status).map(([status, count]) => (
                <div key={status} className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{ORDER_STATUS_LABELS[status] ?? status}</span>
                  <span className="font-medium tabular-nums">{fmt(count)}</span>
                </div>
              ))}
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
              { icon: CheckCircle2, label: "Confirmés", value: fmt(kpis.visitors_confirmed), color: "bg-emerald-500/10 text-emerald-600" },
              { icon: Clock3, label: "En attente", value: fmt(kpis.visitors_by_status["pending"] ?? 0), color: "bg-warning/10 text-warning" },
              { icon: XCircle, label: "Annulés", value: fmt(kpis.visitors_by_status["cancelled"] ?? 0), color: "bg-muted text-muted-foreground" },
              { icon: Layers, label: "Revenu encaissé", value: kpis.revenue_paid > 0 ? fmtMAD(kpis.revenue_paid) : "—", color: "bg-accent text-accent-foreground" },
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
