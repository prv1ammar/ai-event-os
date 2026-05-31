import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQueries } from "@tanstack/react-query";
import {
  Download, FileText, FileSpreadsheet, Presentation,
  Sparkles, CheckSquare, Square, CheckCircle2,
  Users, TrendingUp, Building2, CalendarDays, Globe,
  Loader2, Info, MapPin, BadgeCheck,
} from "lucide-react";
import {
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  Radar, ResponsiveContainer,
  PieChart, Pie, Cell,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";
import { PageShell, Surface } from "@/components/PageShell";
import { KpiCard, type KpiTone } from "@/components/KpiCard";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { apiRequest, API_BASE } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { useEvent } from "@/lib/event-context";

export const Route = createFileRoute("/rapports")({
  component: Rapports,
  head: () => ({
    meta: [
      { title: "Rapports — AI EVENT OS" },
      { name: "description", content: "Analyses, ROI et recommandations IA." },
    ],
  }),
});

// ── Types ──────────────────────────────────────────────────────────────────────

interface LeadRecord    { id: number; interest_level?: string; source?: string; lead_score?: number; event_id?: number; [k: string]: unknown }
interface VisitorRecord { id: number; country?: string; buyer_level?: string; event_id?: number; [k: string]: unknown }
interface ExhibitorRecord { id: number; sector?: string; annual_revenue?: number; event_id?: number; [k: string]: unknown }
interface SessionRecord { id: number; type?: string; capacity?: number; event_id?: number; [k: string]: unknown }
interface EventRecord   {
  id: number; name: string; budget?: string | number; status?: string;
  start_date?: string; end_date?: string; city?: string; country?: string; venue_name?: string;
  [k: string]: unknown;
}

// ── API ────────────────────────────────────────────────────────────────────────

const fetch100 = <T,>(path: string) => async (): Promise<T[]> => {
  const raw = await apiRequest<T[] | { list: T[] }>(`${path}?limit=100`);
  return Array.isArray(raw) ? raw : (raw as { list: T[] }).list ?? [];
};

async function triggerDownload(table: string, label: string) {
  const token = getToken();
  const url = `${API_BASE}/api/v1/reports/export?table=${table}&format=csv&limit=100`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Erreur ${res.status}`);
  const blob = await res.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${label}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ── Constants ──────────────────────────────────────────────────────────────────

const COLORS = [
  "oklch(0.55 0.24 280)", "oklch(0.72 0.21 295)", "oklch(0.68 0.17 152)",
  "oklch(0.75 0.18 45)",  "oklch(0.62 0.20 230)", "oklch(0.65 0.22 340)",
];
const impactColors: Record<string, string> = {
  "Très élevé": "text-primary font-semibold", "Élevé": "text-success",
  "Moyen": "text-warning", "Faible": "text-muted-foreground",
};
const STATUS_STYLES: Record<string, string> = {
  live: "bg-emerald-500/10 text-emerald-600 ring-emerald-500/20",
  published: "bg-sky-500/10 text-sky-600 ring-sky-500/20",
  draft: "bg-amber-500/10 text-amber-600 ring-amber-500/20",
  closed: "bg-muted text-muted-foreground ring-border",
};
const STATUS_LABELS: Record<string, string> = {
  live: "En cours", published: "Publié", draft: "Brouillon", closed: "Clôturé",
};
const DOWNLOAD_ITEMS = [
  { label: "Leads",     desc: "Scores, sources, intérêt",   icon: FileSpreadsheet, color: "bg-success/10 text-success",       table: "leads" },
  { label: "Visiteurs", desc: "Pays, type, niveau d'achat", icon: FileSpreadsheet, color: "bg-info/10 text-info",              table: "visitors" },
  { label: "Exposants", desc: "Secteurs, revenus",          icon: FileText,        color: "bg-destructive/10 text-destructive", table: "exhibitors" },
  { label: "Programme", desc: "Sessions et horaires",       icon: Presentation,    color: "bg-warning/10 text-warning",         table: "sessions" },
];

// ── Small helpers ──────────────────────────────────────────────────────────────

function fmtNum(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}
function fmtBudget(n: number) {
  if (!n) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M MAD`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K MAD`;
  return `${n} MAD`;
}
function fmtDate(iso?: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}
function groupCount<T>(arr: T[], key: keyof T) {
  const map = new Map<string, number>();
  for (const item of arr) {
    const k = String(item[key] ?? "");
    if (!k || k === "null" || k === "undefined") continue;
    map.set(k, (map.get(k) ?? 0) + 1);
  }
  return Array.from(map.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
}
function InfoTip({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex cursor-help">
      <Info className="h-3.5 w-3.5 text-muted-foreground/60 hover:text-muted-foreground" />
      <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden w-56 rounded-lg bg-popover border border-border px-3 py-2 text-xs text-muted-foreground shadow-lg group-hover:block z-50">
        {text}
      </span>
    </span>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────

function Rapports() {
  const { activeEvent } = useEvent();
  const selectedEventId = activeEvent.id !== "0" ? activeEvent.id : "all";

  const [checkedIds, setCheckedIds]   = useState<Set<number>>(new Set());
  const [downloading, setDownloading] = useState<string | null>(null);

  const results = useQueries({
    queries: [
      { queryKey: ["rap-visitors"],   queryFn: fetch100<VisitorRecord>("/api/v1/visitors") },
      { queryKey: ["rap-leads"],      queryFn: fetch100<LeadRecord>("/api/v1/leads") },
      { queryKey: ["rap-exhibitors"], queryFn: fetch100<ExhibitorRecord>("/api/v1/exhibitors") },
      { queryKey: ["rap-sessions"],   queryFn: fetch100<SessionRecord>("/api/v1/sessions") },
      { queryKey: ["rap-events"],     queryFn: fetch100<EventRecord>("/api/v1/events") },
    ],
  });

  const allVisitors   = results[0].data ?? [];
  const allLeads      = results[1].data ?? [];
  const allExhibitors = results[2].data ?? [];
  const allSessions   = results[3].data ?? [];
  const events        = results[4].data ?? [];
  const isLoading     = results.some((r) => r.isLoading);

  const selectedEvent = events.find((e) => String(e.id) === selectedEventId) ?? null;

  // ── Event-scoped data ─────────────────────────────────────────────────────────
  // Sessions have event_id (one-to-one with event) → filtered precisely by active event
  // Visitors / Leads / Exhibitors are M2M with events via TybotFlow's app-layer link field
  // (not a database FK → PostgREST can't filter through it) → always show global data
  const sessions   = selectedEventId === "all"
    ? allSessions
    : allSessions.filter((s) => String(s.event_id) === selectedEventId);

  const visitors   = allVisitors;
  const leads      = allLeads;
  const exhibitors = allExhibitors;

  const isFiltered = selectedEventId !== "all";

  // ── Metrics ───────────────────────────────────────────────────────────────────

  const hotCount  = leads.filter((l) => l.interest_level === "hot").length;
  const warmCount = leads.filter((l) => l.interest_level === "warm").length;
  const coldCount = leads.filter((l) => l.interest_level === "cold").length;
  const convCount = leads.filter((l) => l.interest_level === "converted").length;
  const qualifiedLeads = hotCount + warmCount + convCount;
  const leadQualityPct = leads.length > 0 ? Math.round((qualifiedLeads / leads.length) * 100) : 0;
  const avgScore = leads.length > 0
    ? Math.round(leads.reduce((s, l) => s + (Number(l.lead_score) || 0), 0) / leads.length) : 0;
  const convRate = visitors.length > 0 ? ((leads.length / visitors.length) * 100).toFixed(1) : "—";
  const uniqueCountries = new Set(visitors.map((v) => v.country).filter(Boolean)).size;
  const decisionMakers  = visitors.filter((v) => v.buyer_level === "decision_maker").length;
  const totalBudget = selectedEvent ? Number(selectedEvent.budget) || 0
    : events.reduce((s, e) => { const n = Number(e.budget); return isNaN(n) ? s : s + n; }, 0);
  const totalRevenue = exhibitors.reduce((s, e) => { const n = Number(e.annual_revenue); return isNaN(n) ? s : s + n; }, 0);

  // ── Chart data ─────────────────────────────────────────────────────────────────

  const leadsQuality = [
    { name: "Chauds",    value: hotCount,  color: COLORS[0], desc: "Fort intérêt — à relancer en priorité" },
    { name: "Tièdes",    value: warmCount, color: COLORS[1], desc: "Intérêt modéré — nurturing nécessaire" },
    { name: "Convertis", value: convCount, color: COLORS[2], desc: "Déjà client ou partenaire" },
    { name: "Froids",    value: coldCount, color: COLORS[3], desc: "Faible intérêt — à requalifier" },
  ].filter((l) => l.value > 0);

  const topCountries = groupCount(visitors, "country").slice(0, 8);
  const leadSources  = groupCount(leads, "source");
  const exhibSectors = groupCount(exhibitors, "sector").slice(0, 6);
  const sessionTypes = groupCount(sessions, "type");

  // Radar
  const radarLeads      = leadQualityPct;
  const radarConversion = visitors.length > 0 ? Math.min(Math.round(leads.length / visitors.length * 100), 95) : 0;
  const radarIntl       = visitors.length > 0 ? Math.round(uniqueCountries / visitors.length * 100) : 0;
  const radarExposants  = exhibitors.length > 0 ? Math.round(exhibitors.filter((e) => Number(e.annual_revenue) > 0).length / exhibitors.length * 100) : 0;
  const sessionTarget   = Math.max((selectedEvent ? 1 : events.length) * 2, 1);
  const radarProgramme  = Math.min(Math.round(sessions.length / sessionTarget * 100), 100);

  const radarData = [
    { axis: "Leads qualité",  value: radarLeads,      goal: 80, detail: `${qualifiedLeads}/${leads.length} qualifiés` },
    { axis: "Conversion",     value: radarConversion, goal: 75, detail: `${leads.length} leads / ${visitors.length} visiteurs` },
    { axis: "International",  value: radarIntl,       goal: 70, detail: `${uniqueCountries} pays distincts` },
    { axis: "Exposants",      value: radarExposants,  goal: 80, detail: `${exhibitors.filter((e) => Number(e.annual_revenue) > 0).length}/${exhibitors.length} avec CA` },
    { axis: "Programme",      value: radarProgramme,  goal: 75, detail: `${sessions.length} sessions` },
  ];

  // Recommendations
  const recommendations: { text: string; impact: string; effort: string }[] = [];
  if (hotCount > 0) recommendations.push({ text: `Accélérer le suivi des ${hotCount} lead${hotCount > 1 ? "s" : ""} chaud${hotCount > 1 ? "s" : ""} — fort potentiel de conversion immédiat`, impact: "Très élevé", effort: "Faible" });
  if (coldCount > 0 && coldCount >= leads.length * 0.25) recommendations.push({ text: `Relancer les ${coldCount} leads froids avec une campagne email personnalisée`, impact: "Moyen", effort: "Faible" });
  const matchLeads = leads.filter((l) => l.source === "matchmaking").length;
  if (leads.length > 0 && matchLeads / leads.length < 0.3) recommendations.push({ text: "Développer le matchmaking IA B2B pour augmenter les leads qualifiés", impact: "Élevé", effort: "Moyen" });
  if (uniqueCountries >= 5) recommendations.push({ text: `Capitaliser sur la diversité internationale — ${uniqueCountries} pays représentés`, impact: "Élevé", effort: "Moyen" });
  if (decisionMakers > 0) recommendations.push({ text: `Programme VIP pour les ${decisionMakers} décideur${decisionMakers > 1 ? "s" : ""} identifié${decisionMakers > 1 ? "s" : ""}`, impact: "Très élevé", effort: "Moyen" });
  if (totalBudget > 0) recommendations.push({ text: `Optimiser l'allocation du budget ${fmtBudget(totalBudget)} sur les événements à fort ROI`, impact: "Élevé", effort: "Élevé" });

  // KPIs
  const kpis = [
    { label: "Visiteurs",       value: isLoading ? "…" : visitors.length.toLocaleString("fr-FR"),   delta: `${uniqueCountries} pays`,                                  sub: "global",   icon: Users,        tone: "primary" as KpiTone, trend: "up" as const },
    { label: "Leads générés",   value: isLoading ? "…" : leads.length.toLocaleString("fr-FR"),      delta: `score moy. ${avgScore}`,                                   sub: "global",   icon: TrendingUp,   tone: "green"   as KpiTone, trend: "up" as const },
    { label: "Exposants",       value: isLoading ? "…" : exhibitors.length.toLocaleString("fr-FR"), delta: totalRevenue > 0 ? `CA ${fmtNum(totalRevenue)}` : undefined, sub: "global",  icon: Building2,    tone: "blue"    as KpiTone, trend: "up" as const },
    { label: "Sessions",        value: isLoading ? "…" : sessions.length.toLocaleString("fr-FR"),   delta: selectedEvent ? selectedEvent.name.slice(0, 16) : `${events.length} événements`, sub: isFiltered ? "cet événement" : "global", icon: CalendarDays, tone: "violet" as KpiTone, trend: "up" as const },
    { label: "Taux conversion", value: isLoading ? "…" : `${convRate}%`,                            delta: `${hotCount} leads chauds`,                                 sub: "global",   icon: Globe,        tone: "amber"   as KpiTone, trend: "up" as const },
  ];

  return (
    <PageShell
      eyebrow="Rapports & analyses"
      title="Bilan & performance"
      description="Toutes les métriques calculées depuis vos données TybotFlow."
      actions={
        <Button size="sm" className="h-9 bg-gradient-primary text-primary-foreground shadow-glow-sm">
          <Sparkles className="h-4 w-4" /> Rapport IA
        </Button>
      }
    >
      {/* ── Active event banner ── */}
      {selectedEvent && (
        <Surface className="p-4">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Événement actif</p>
              <p className="font-semibold text-foreground mt-0.5 truncate">{selectedEvent.name}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Dates</p>
              <p className="font-medium text-foreground mt-0.5 text-sm">
                {fmtDate(selectedEvent.start_date)}{selectedEvent.end_date ? ` → ${fmtDate(selectedEvent.end_date)}` : ""}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Lieu</p>
              <p className="font-medium text-foreground mt-0.5 text-sm flex items-center gap-1">
                <MapPin className="h-3 w-3 text-muted-foreground shrink-0" />
                {[selectedEvent.venue_name, selectedEvent.city, selectedEvent.country].filter(Boolean).join(", ") || "—"}
              </p>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Budget</p>
                <p className="font-semibold text-foreground mt-0.5">{fmtBudget(Number(selectedEvent.budget) || 0)}</p>
              </div>
              <span className={cn("inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset", STATUS_STYLES[selectedEvent.status ?? "draft"] ?? STATUS_STYLES.draft)}>
                <BadgeCheck className="h-3 w-3 mr-1" />{STATUS_LABELS[selectedEvent.status ?? "draft"] ?? selectedEvent.status}
              </span>
            </div>
          </div>
        </Surface>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
        {kpis.map((k) => <KpiCard key={k.label} {...k} />)}
      </div>

      {/* Radar + Leads quality */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Surface className="p-6 lg:col-span-2">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h2 className="font-display text-base font-semibold text-foreground flex items-center gap-1.5">
                Performance multidimensionnelle
                <InfoTip text="5 axes calculés sur les données de la sélection actuelle." />
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Sessions : {selectedEvent ? selectedEvent.name : "tous événements"} · leads/visiteurs/exposants : global
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-primary" /> Réalisé</span>
              <span className="inline-flex items-center gap-1.5 text-muted-foreground"><span className="h-2 w-2 rounded-sm bg-muted-foreground/40" /> Objectif</span>
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData} outerRadius={85}>
                <PolarGrid stroke="oklch(0.92 0.012 285)" />
                <PolarAngleAxis dataKey="axis" tick={{ fontSize: 11, fill: "oklch(0.4 0.03 270)", fontWeight: 500 }} />
                <PolarRadiusAxis tick={false} axisLine={false} domain={[0, 100]} />
                <Radar dataKey="goal" stroke="oklch(0.5 0.03 270)" fill="oklch(0.5 0.03 270)" fillOpacity={0.1} strokeDasharray="3 3" />
                <Radar dataKey="value" stroke="oklch(0.55 0.24 280)" fill="oklch(0.55 0.24 280)" fillOpacity={0.35} strokeWidth={2} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 divide-y divide-border/40">
            {radarData.map((d) => (
              <div key={d.axis} className="flex items-center gap-3 py-1.5">
                <div className="w-28 shrink-0">
                  <p className="text-xs font-medium text-foreground">{d.axis}</p>
                  <p className="text-[10px] text-muted-foreground">{d.detail}</p>
                </div>
                <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full bg-gradient-primary transition-all" style={{ width: `${d.value}%` }} />
                </div>
                <span className="text-xs font-bold text-foreground tabular-nums w-7 text-right">{d.value}</span>
                <span className="text-[10px] text-muted-foreground w-14 text-right">obj. {d.goal}</span>
              </div>
            ))}
          </div>
        </Surface>

        <Surface className="p-6">
          <h2 className="font-display text-base font-semibold text-foreground flex items-center gap-1.5">
            Qualité des leads
            <InfoTip text="interest_level de chaque lead — hot/warm/converted = qualifiés." />
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5 mb-3">
            {leads.length} leads · {leadQualityPct}% qualifiés
          </p>
          {leads.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Aucun lead</p>
          ) : (
            <>
              <div className="relative h-40 w-40 mx-auto">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={leadsQuality} innerRadius={46} outerRadius={72} paddingAngle={3} dataKey="value" stroke="none">
                      {leadsQuality.map((e) => <Cell key={e.name} fill={e.color} />)}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <p className="font-display text-2xl font-bold text-foreground">{leadQualityPct}%</p>
                  <p className="text-[10px] text-muted-foreground">qualifiés</p>
                </div>
              </div>
              <ul className="space-y-2 mt-3">
                {leadsQuality.map((l) => (
                  <li key={l.name} className="rounded-lg bg-muted/40 px-3 py-2">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                        <span className="h-2 w-2 rounded-sm" style={{ background: l.color }} />{l.name}
                      </span>
                      <span className="text-xs font-bold tabular-nums">{l.value} <span className="font-normal text-muted-foreground">({((l.value/leads.length)*100).toFixed(0)}%)</span></span>
                    </div>
                    <p className="text-[10px] text-muted-foreground">{l.desc}</p>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Surface>
      </div>

      {/* Charts row */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Surface className="p-6">
          <h2 className="font-display text-base font-semibold text-foreground mb-1">Top pays visiteurs</h2>
          <p className="text-xs text-muted-foreground mb-3">{uniqueCountries} pays · {visitors.length} visiteurs · global</p>
          {topCountries.length === 0 ? <p className="text-sm text-muted-foreground py-6 text-center">Aucune donnée</p> : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={topCountries} layout="vertical" margin={{ left: 0, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="oklch(0.92 0.012 285)" />
                <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={72} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} formatter={(v: number) => [v, "Visiteurs"]} />
                <Bar dataKey="value" fill="oklch(0.55 0.24 280)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Surface>

        <Surface className="p-6">
          <h2 className="font-display text-base font-semibold text-foreground mb-1">Sources des leads</h2>
          <p className="text-xs text-muted-foreground mb-3">{leads.length} leads · {leadSources.length} sources · global</p>
          {leadSources.length === 0 ? <p className="text-sm text-muted-foreground py-6 text-center">Aucune donnée</p> : (
            <>
              <ResponsiveContainer width="100%" height={130}>
                <BarChart data={leadSources} margin={{ left: -10, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="oklch(0.92 0.012 285)" />
                  <XAxis dataKey="name" tick={{ fontSize: 9 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} formatter={(v: number) => [v, "Leads"]} />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {leadSources.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <ul className="mt-3 space-y-1">
                {leadSources.map((s, i) => (
                  <li key={s.name} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                      <span className="capitalize text-foreground">{s.name.replace(/_/g, " ")}</span>
                    </span>
                    <span className="font-semibold tabular-nums">{s.value}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Surface>

        <Surface className="p-6">
          <h2 className="font-display text-base font-semibold text-foreground mb-1">Secteurs exposants</h2>
          <p className="text-xs text-muted-foreground mb-3">{exhibitors.length} exposants · global</p>
          {exhibSectors.length === 0 ? <p className="text-sm text-muted-foreground py-6 text-center">Aucune donnée</p> : (
            <>
              <ResponsiveContainer width="100%" height={140}>
                <BarChart data={exhibSectors} layout="vertical" margin={{ left: 0, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="oklch(0.92 0.012 285)" />
                  <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={90} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} formatter={(v: number) => [v, "Exposants"]} />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                    {exhibSectors.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <ul className="mt-3 space-y-1">
                {exhibSectors.map((s, i) => (
                  <li key={s.name} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                      <span className="text-foreground">{s.name}</span>
                    </span>
                    <span className="font-semibold tabular-nums">{s.value}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Surface>
      </div>

      {/* Sessions types + AI Reco */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Surface className="p-6">
          <h2 className="font-display text-base font-semibold text-foreground mb-3">Types de sessions</h2>
          <p className="text-xs text-muted-foreground -mt-2 mb-3">
            {sessions.length} session{sessions.length !== 1 ? "s" : ""}
            {selectedEvent ? ` · ${selectedEvent.name}` : " · tous événements"}
          </p>
          {sessionTypes.length === 0 ? <p className="text-sm text-muted-foreground py-6 text-center">Aucune session</p> : (
            <ul className="space-y-2.5">
              {sessionTypes.map((s, i) => {
                const pct = Math.round((s.value / sessions.length) * 100);
                return (
                  <div key={s.name}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="capitalize font-medium text-foreground">{s.name}</span>
                      <span className="text-muted-foreground">{s.value} ({pct}%)</span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: COLORS[i % COLORS.length] }} />
                    </div>
                  </div>
                );
              })}
            </ul>
          )}
        </Surface>

        <Surface className="p-6 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-primary text-primary-foreground shadow-glow-sm">
                <Sparkles className="h-4 w-4" />
              </div>
              <div>
                <h2 className="font-display text-base font-semibold text-foreground">Recommandations IA</h2>
                <p className="text-xs text-muted-foreground">
                  {selectedEvent
                    ? `Générées depuis les leads, visiteurs et exposants de "${selectedEvent.name}"`
                    : "Générées depuis l'ensemble de vos données — sélectionnez un événement dans l'en-tête pour affiner"}
                </p>
              </div>
            </div>
            {recommendations.length > 0 && (
              <div className="flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1">
                <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs font-semibold text-primary">{checkedIds.size}/{recommendations.length}</span>
              </div>
            )}
          </div>
          {recommendations.length > 0 && (
            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden mb-4">
              <div className="h-full rounded-full bg-gradient-primary transition-all duration-500" style={{ width: `${(checkedIds.size / recommendations.length) * 100}%` }} />
            </div>
          )}
          {isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground py-6 justify-center"><Loader2 className="h-4 w-4 animate-spin" /><span className="text-sm">Analyse…</span></div>
          ) : recommendations.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Pas assez de données pour générer des recommandations.</p>
          ) : (
            <ul className="space-y-2">
              {recommendations.map((r, i) => {
                const checked = checkedIds.has(i);
                return (
                  <li key={i} onClick={() => setCheckedIds((prev) => { const n = new Set(prev); if (n.has(i)) n.delete(i); else n.add(i); return n; })}
                    className={cn("flex items-start gap-3 rounded-lg p-2.5 -mx-2 transition-all cursor-pointer select-none",
                      checked ? "bg-success/5 hover:bg-success/10" : "bg-gradient-subtle/40 hover:bg-accent/50")}>
                    <div className="mt-0.5 shrink-0">{checked ? <CheckSquare className="h-4 w-4 text-success" /> : <Square className="h-4 w-4 text-muted-foreground" />}</div>
                    <div className="flex-1 min-w-0">
                      <p className={cn("text-sm text-foreground leading-snug", checked && "line-through text-muted-foreground")}>{r.text}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={cn("text-[10px] font-semibold", impactColors[r.impact] ?? "text-muted-foreground")}>Impact : {r.impact}</span>
                        <span className="text-[10px] text-muted-foreground">· Effort : {r.effort}</span>
                      </div>
                    </div>
                    <span className={cn("shrink-0 flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold",
                      checked ? "bg-success text-white" : "bg-primary text-primary-foreground")}>{i + 1}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </Surface>
      </div>

      {/* Downloads */}
      <Surface className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-base font-semibold text-foreground">Exports CSV</h2>
          <p className="text-xs text-muted-foreground">Données temps réel depuis TybotFlow</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          {DOWNLOAD_ITEMS.map((d) => {
            const isThisDownloading = downloading === d.table;
            return (
              <button key={d.table}
                onClick={async () => { setDownloading(d.table); try { await triggerDownload(d.table, d.label); } finally { setDownloading(null); } }}
                disabled={!!downloading}
                className="group flex items-center gap-3 rounded-xl border border-border/60 p-3 text-left transition-all hover:border-primary/40 hover:shadow-card hover-lift bg-card disabled:opacity-60 disabled:cursor-not-allowed">
                <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${d.color} shrink-0`}>
                  {isThisDownloading ? <Loader2 className="h-5 w-5 animate-spin" /> : <d.icon className="h-5 w-5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{d.label}</p>
                  <p className="text-xs text-muted-foreground truncate">{d.desc}</p>
                </div>
                <Download className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-y-0.5 shrink-0" />
              </button>
            );
          })}
        </div>
      </Surface>
    </PageShell>
  );
}
