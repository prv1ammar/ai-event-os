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

interface LeadRecord    { id: number; lead_status?: string; source?: string; country?: string; events_id?: number; [k: string]: unknown }
interface VisitorRecord { id: number; registration_status?: string; arrived_at?: string; events_id?: number; [k: string]: unknown }
interface ExhibitorRecord { id: number; registration_status?: string; company_name?: string; events_id?: number; [k: string]: unknown }
interface SessionRecord { id: number; session_type?: string; events_id?: number; [k: string]: unknown }
interface OrderRecord   { id: number; total?: string | number; status?: string; order_type?: string; events_id?: number; [k: string]: unknown }
interface EventRecord   {
  id: number; name: string; status?: string; event_type?: string; is_free?: boolean;
  start_date?: string; end_date?: string;
  venues?: Array<{ id: number; name?: string }>;
  [k: string]: unknown;
}

// ── API ────────────────────────────────────────────────────────────────────────

const fetchAll = <T,>(path: string) => async (): Promise<T[]> => {
  const raw = await apiRequest<T[] | { list: T[] }>(`${path}?limit=500`);
  return Array.isArray(raw) ? raw : (raw as { list: T[] }).list ?? [];
};

async function triggerDownload(table: string, label: string) {
  const token = getToken();
  const url = `${API_BASE}/api/v1/reports/export?table=${table}&format=csv&limit=500`;
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
  ongoing: "bg-emerald-500/10 text-emerald-600 ring-emerald-500/20",
  published: "bg-sky-500/10 text-sky-600 ring-sky-500/20",
  draft: "bg-amber-500/10 text-amber-600 ring-amber-500/20",
  closed: "bg-muted text-muted-foreground ring-border",
  archived: "bg-muted text-muted-foreground ring-border",
};
const STATUS_LABELS: Record<string, string> = {
  ongoing: "En cours", published: "Publié", draft: "Brouillon", closed: "Clôturé", archived: "Archivé",
};
const LEAD_STATUS_META: Record<string, { label: string; desc: string }> = {
  new:       { label: "Nouveaux",  desc: "À qualifier — premier contact à établir" },
  qualified: { label: "Qualifiés", desc: "Profil validé — à contacter rapidement" },
  contacted: { label: "Contactés", desc: "Échange en cours — suivre la relance" },
  converted: { label: "Convertis", desc: "Déjà client ou partenaire" },
  lost:      { label: "Perdus",    desc: "Sans suite — à requalifier plus tard" },
};
const DOWNLOAD_ITEMS = [
  { label: "Leads",     desc: "Contacts CRM, statut, source",  icon: FileSpreadsheet, color: "bg-success/10 text-success",         table: "leads" },
  { label: "Visiteurs", desc: "Inscriptions et arrivées",      icon: FileSpreadsheet, color: "bg-info/10 text-info",               table: "visitors" },
  { label: "Exposants", desc: "Sociétés et statuts",           icon: FileText,        color: "bg-destructive/10 text-destructive", table: "exhibitors" },
  { label: "Programme", desc: "Sessions et horaires",          icon: Presentation,    color: "bg-warning/10 text-warning",         table: "sessions" },
  { label: "Commandes", desc: "Billets, stands, sponsoring",   icon: FileSpreadsheet, color: "bg-primary/10 text-primary",         table: "orders" },
];

// ── Small helpers ──────────────────────────────────────────────────────────────

function fmtMAD(n: number) {
  if (!n) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M MAD`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K MAD`;
  return `${Math.round(n)} MAD`;
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
function byEvent<T extends { events_id?: number }>(rows: T[], eventId: string): T[] {
  if (eventId === "all") return rows;
  return rows.filter((r) => String(r.events_id) === eventId);
}

// ── Main ───────────────────────────────────────────────────────────────────────

function Rapports() {
  const { activeEvent } = useEvent();
  const selectedEventId = activeEvent.id !== "0" ? activeEvent.id : "all";

  const [checkedIds, setCheckedIds]   = useState<Set<number>>(new Set());
  const [downloading, setDownloading] = useState<string | null>(null);

  const results = useQueries({
    queries: [
      { queryKey: ["rap-visitors"],   queryFn: fetchAll<VisitorRecord>("/api/v1/visitors") },
      { queryKey: ["rap-leads"],      queryFn: fetchAll<LeadRecord>("/api/v1/leads") },
      { queryKey: ["rap-exhibitors"], queryFn: fetchAll<ExhibitorRecord>("/api/v1/exhibitors") },
      { queryKey: ["rap-sessions"],   queryFn: fetchAll<SessionRecord>("/api/v1/sessions") },
      { queryKey: ["rap-events"],     queryFn: fetchAll<EventRecord>("/api/v1/events") },
      { queryKey: ["rap-orders"],     queryFn: fetchAll<OrderRecord>("/api/v1/orders") },
    ],
  });

  const events    = results[4].data ?? [];
  const isLoading = results.some((r) => r.isLoading);

  const selectedEvent = events.find((e) => String(e.id) === selectedEventId) ?? null;
  const isFiltered = selectedEventId !== "all";
  const scopeLabel = isFiltered ? "cet événement" : "global";

  // Every table now carries a real events_id FK → precise per-event filtering
  const visitors   = byEvent(results[0].data ?? [], selectedEventId);
  const leads      = byEvent(results[1].data ?? [], selectedEventId);
  const exhibitors = byEvent(results[2].data ?? [], selectedEventId);
  const sessions   = byEvent(results[3].data ?? [], selectedEventId);
  const orders     = byEvent(results[5].data ?? [], selectedEventId);

  // ── Metrics ───────────────────────────────────────────────────────────────────

  const statusCount = (s: string) => leads.filter((l) => l.lead_status === s).length;
  const qualifiedLeads = statusCount("qualified") + statusCount("contacted") + statusCount("converted");
  const leadQualityPct = leads.length > 0 ? Math.round((qualifiedLeads / leads.length) * 100) : 0;
  const convRate = visitors.length > 0 ? ((leads.length / visitors.length) * 100).toFixed(1) : "—";
  const uniqueCountries = new Set(leads.map((l) => l.country).filter(Boolean)).size;
  const arrivedVisitors = visitors.filter((v) => !!v.arrived_at).length;
  const confirmedExhibitors = exhibitors.filter((e) => e.registration_status === "confirmed").length;
  const revenue = orders
    .filter((o) => ["paid", "partial"].includes(o.status ?? ""))
    .reduce((s, o) => { const n = Number(o.total); return isNaN(n) ? s : s + n; }, 0);

  // ── Chart data ─────────────────────────────────────────────────────────────────

  const leadsQuality = Object.entries(LEAD_STATUS_META)
    .map(([key, meta], i) => ({ key, name: meta.label, desc: meta.desc, value: statusCount(key), color: COLORS[i % COLORS.length] }))
    .filter((l) => l.value > 0);

  const topCountries = groupCount(leads, "country").slice(0, 8);
  const leadSources  = groupCount(leads, "source");
  const exhibStatus  = groupCount(exhibitors, "registration_status");
  const sessionTypes = groupCount(sessions, "session_type");

  // Radar
  const radarLeads      = leadQualityPct;
  const radarConversion = visitors.length > 0 ? Math.min(Math.round(leads.length / visitors.length * 100), 100) : 0;
  const radarArrival    = visitors.length > 0 ? Math.round(arrivedVisitors / visitors.length * 100) : 0;
  const radarExposants  = exhibitors.length > 0 ? Math.round(confirmedExhibitors / exhibitors.length * 100) : 0;
  const sessionTarget   = Math.max((isFiltered ? 1 : events.length) * 2, 1);
  const radarProgramme  = Math.min(Math.round(sessions.length / sessionTarget * 100), 100);

  const radarData = [
    { axis: "Leads qualité",  value: radarLeads,      goal: 80, detail: `${qualifiedLeads}/${leads.length} qualifiés` },
    { axis: "Conversion",     value: radarConversion, goal: 75, detail: `${leads.length} leads / ${visitors.length} visiteurs` },
    { axis: "Présence",       value: radarArrival,    goal: 70, detail: `${arrivedVisitors}/${visitors.length} arrivés sur site` },
    { axis: "Exposants",      value: radarExposants,  goal: 80, detail: `${confirmedExhibitors}/${exhibitors.length} confirmés` },
    { axis: "Programme",      value: radarProgramme,  goal: 75, detail: `${sessions.length} sessions` },
  ];

  // Recommendations
  const recommendations: { text: string; impact: string; effort: string }[] = [];
  const newLeads = statusCount("new");
  if (newLeads > 0) recommendations.push({ text: `Qualifier les ${newLeads} nouveau${newLeads > 1 ? "x" : ""} lead${newLeads > 1 ? "s" : ""} — premier contact à établir rapidement`, impact: "Très élevé", effort: "Faible" });
  const qualifiedOnly = statusCount("qualified");
  if (qualifiedOnly > 0) recommendations.push({ text: `Contacter les ${qualifiedOnly} lead${qualifiedOnly > 1 ? "s" : ""} qualifié${qualifiedOnly > 1 ? "s" : ""} avant la fin de l'événement`, impact: "Très élevé", effort: "Faible" });
  const pendingVisitors = visitors.filter((v) => v.registration_status === "pending").length;
  if (pendingVisitors > 0) recommendations.push({ text: `Relancer les ${pendingVisitors} inscription${pendingVisitors > 1 ? "s" : ""} en attente par email de confirmation`, impact: "Élevé", effort: "Faible" });
  const pendingOrders = orders.filter((o) => o.status === "pending").length;
  if (pendingOrders > 0) recommendations.push({ text: `Encaisser les ${pendingOrders} commande${pendingOrders > 1 ? "s" : ""} en attente de paiement`, impact: "Très élevé", effort: "Moyen" });
  if (uniqueCountries >= 3) recommendations.push({ text: `Capitaliser sur la diversité internationale — ${uniqueCountries} pays représentés dans le CRM`, impact: "Élevé", effort: "Moyen" });
  const pendingExhibitors = exhibitors.length - confirmedExhibitors;
  if (pendingExhibitors > 0) recommendations.push({ text: `Finaliser les ${pendingExhibitors} dossier${pendingExhibitors > 1 ? "s" : ""} exposant${pendingExhibitors > 1 ? "s" : ""} non confirmé${pendingExhibitors > 1 ? "s" : ""}`, impact: "Élevé", effort: "Moyen" });

  // KPIs
  const kpis = [
    { label: "Visiteurs",       value: isLoading ? "…" : visitors.length.toLocaleString("fr-FR"),   delta: `${arrivedVisitors} arrivés`,         sub: scopeLabel, icon: Users,        tone: "primary" as KpiTone, trend: "up" as const },
    { label: "Leads générés",   value: isLoading ? "…" : leads.length.toLocaleString("fr-FR"),      delta: `${leadQualityPct}% qualifiés`,        sub: scopeLabel, icon: TrendingUp,   tone: "green"   as KpiTone, trend: "up" as const },
    { label: "Exposants",       value: isLoading ? "…" : exhibitors.length.toLocaleString("fr-FR"), delta: `${confirmedExhibitors} confirmés`,    sub: scopeLabel, icon: Building2,    tone: "blue"    as KpiTone, trend: "up" as const },
    { label: "Sessions",        value: isLoading ? "…" : sessions.length.toLocaleString("fr-FR"),   delta: selectedEvent ? selectedEvent.name.slice(0, 16) : `${events.length} événements`, sub: scopeLabel, icon: CalendarDays, tone: "violet" as KpiTone, trend: "up" as const },
    { label: "Revenu encaissé", value: isLoading ? "…" : fmtMAD(revenue),                            delta: `${convRate}% conversion`,             sub: scopeLabel, icon: Globe,        tone: "amber"   as KpiTone, trend: "up" as const },
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
                {selectedEvent.venues?.[0]?.name ?? "—"}
              </p>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Accès</p>
                <p className="font-semibold text-foreground mt-0.5">{selectedEvent.is_free ? "Gratuit" : "Payant"}</p>
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
                {selectedEvent ? `Périmètre : ${selectedEvent.name}` : "Périmètre : tous les événements"}
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
            <InfoTip text="lead_status de chaque contact CRM — qualified/contacted/converted = qualifiés." />
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
                      {leadsQuality.map((e) => <Cell key={e.key} fill={e.color} />)}
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
                  <li key={l.key} className="rounded-lg bg-muted/40 px-3 py-2">
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
          <h2 className="font-display text-base font-semibold text-foreground mb-1">Top pays leads</h2>
          <p className="text-xs text-muted-foreground mb-3">{uniqueCountries} pays · {leads.length} leads · {scopeLabel}</p>
          {topCountries.length === 0 ? <p className="text-sm text-muted-foreground py-6 text-center">Aucune donnée</p> : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={topCountries} layout="vertical" margin={{ left: 0, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="oklch(0.92 0.012 285)" />
                <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={72} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} formatter={(v: number) => [v, "Leads"]} />
                <Bar dataKey="value" fill="oklch(0.55 0.24 280)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Surface>

        <Surface className="p-6">
          <h2 className="font-display text-base font-semibold text-foreground mb-1">Sources des leads</h2>
          <p className="text-xs text-muted-foreground mb-3">{leads.length} leads · {leadSources.length} sources · {scopeLabel}</p>
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
          <h2 className="font-display text-base font-semibold text-foreground mb-1">Statut des exposants</h2>
          <p className="text-xs text-muted-foreground mb-3">{exhibitors.length} exposants · {scopeLabel}</p>
          {exhibStatus.length === 0 ? <p className="text-sm text-muted-foreground py-6 text-center">Aucune donnée</p> : (
            <>
              <ResponsiveContainer width="100%" height={140}>
                <BarChart data={exhibStatus} layout="vertical" margin={{ left: 0, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="oklch(0.92 0.012 285)" />
                  <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={90} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} formatter={(v: number) => [v, "Exposants"]} />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                    {exhibStatus.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <ul className="mt-3 space-y-1">
                {exhibStatus.map((s, i) => (
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
                    ? `Générées depuis les données de "${selectedEvent.name}"`
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
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
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
