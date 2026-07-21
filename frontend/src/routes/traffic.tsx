import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Shield, Activity, LayoutGrid, BarChart3,
  CheckCircle2, XCircle, Users, Zap,
  TrendingUp, TrendingDown, AlertTriangle, MapPin,
  RefreshCw, Download, Clock,
  ScanLine, Lock, Unlock, Eye, ArrowUp, ArrowDown, ChevronRight,
} from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { cn } from "@/lib/utils";
import { useEvent } from "@/lib/event-context";
import { apiRequest } from "@/lib/api";

export const Route = createFileRoute("/traffic")({
  component: TrafficPage,
  head: () => ({ meta: [{ title: "Gestion du Trafic — AI EVENT OS" }] }),
});

// ─── Types ────────────────────────────────────────────────────────────────────
interface Scan {
  id: number;
  visitor_id?: number;
  badge_id?: number;
  badge_type?: string;     // may be absent — derive from badge_id or scan payload
  scan_type?: string;      // "entry" | "exit"
  location?: string;       // real TybotFlow field for entry point
  entry_point?: string;    // fallback alias
  is_valid?: boolean;      // true = authorized, false = denied
  status?: string;         // fallback for older records
  scanned_at?: string;     // real TybotFlow timestamp
  scan_time?: string;
  created_at?: string;
  qr_code?: string;
  event_id?: number;
  [key: string]: unknown;
}

interface Visitor {
  id: number;
  visitor_type?: string;
  event_id?: number | null;
  first_name?: string;
  last_name?: string;
  [key: string]: unknown;
}

// ─── Config types ─────────────────────────────────────────────────────────────
const CONFIG_TYPES = [
  {
    key: "access",
    label: "Contrôle d'Accès",
    icon: Shield,
    gradient: "from-violet-600 to-purple-700",
    bg: "bg-violet-500/10",
    text: "text-violet-600",
    border: "border-violet-500/30",
    desc: "Supervision des entrées, sorties et refus d'accès en temps réel",
  },
  {
    key: "flow",
    label: "Flux en Temps Réel",
    icon: Activity,
    gradient: "from-sky-500 to-blue-600",
    bg: "bg-sky-500/10",
    text: "text-sky-600",
    border: "border-sky-500/30",
    desc: "Suivi du débit d'entrée, taux d'occupation et détection des pics",
  },
  {
    key: "zones",
    label: "Gestion des Zones",
    icon: LayoutGrid,
    gradient: "from-emerald-500 to-teal-600",
    bg: "bg-emerald-500/10",
    text: "text-emerald-600",
    border: "border-emerald-500/30",
    desc: "Répartition du trafic par type de badge et point d'accès",
  },
  {
    key: "analytics",
    label: "Analyse & Rapports",
    icon: BarChart3,
    gradient: "from-amber-500 to-orange-600",
    bg: "bg-amber-500/10",
    text: "text-amber-600",
    border: "border-amber-500/30",
    desc: "Tendances historiques, distribution des badges et exports CSV",
  },
] as const;

type ConfigKey = typeof CONFIG_TYPES[number]["key"];

// ─── Utilities ────────────────────────────────────────────────────────────────
function scanTs(s: Scan | null | undefined): string {
  if (!s) return "";
  return s.scanned_at ?? s.scan_time ?? s.created_at ?? "";
}

function scanLocation(s: Scan | null | undefined): string {
  if (!s) return "Entrée principale";
  return (s.location ?? s.entry_point ?? "") || "Entrée principale";
}

function scanAllowed(s: Scan | null | undefined): boolean {
  if (!s) return false;
  if (s.is_valid !== undefined && s.is_valid !== null) return Boolean(s.is_valid);
  return s.status !== "denied" && s.status !== "refused";
}

function scanBadgeLabel(s: Scan | null | undefined): string {
  if (!s) return "";
  return s.badge_type ?? (s.badge_id !== undefined && s.badge_id !== null ? `Badge #${s.badge_id}` : "");
}

function timeAgo(iso: string): string {
  if (!iso) return "—";
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return `${Math.floor(diff)}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}min`;
  return `${Math.floor(diff / 3600)}h`;
}

function fmtTime(iso: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

const BADGE_COLORS: Record<string, string> = {
  standard: "#7c3aed", vip: "#a855f7", press: "#f59e0b",
  exhibitor: "#10b981", organizer: "#ef4444", speaker: "#0ea5e9",
};
const COLOR_LIST = ["#7c3aed", "#0ea5e9", "#10b981", "#ef4444", "#f59e0b", "#a855f7", "#8b5cf6"];

// ─── Stat card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, icon: Icon, color, trend }: {
  label: string; value: string | number; sub?: string;
  icon: React.ElementType; color: string; trend?: "up" | "down" | "neutral";
}) {
  const cls: Record<string, string> = {
    violet: "bg-violet-500/5 border-violet-500/20",
    sky: "bg-sky-500/5 border-sky-500/20",
    emerald: "bg-emerald-500/5 border-emerald-500/20",
    amber: "bg-amber-500/5 border-amber-500/20",
    red: "bg-red-500/5 border-red-500/20",
  };
  const icls: Record<string, string> = {
    violet: "bg-violet-500/15 text-violet-600",
    sky: "bg-sky-500/15 text-sky-600",
    emerald: "bg-emerald-500/15 text-emerald-600",
    amber: "bg-amber-500/15 text-amber-600",
    red: "bg-red-500/15 text-red-600",
  };
  return (
    <div className={cn("rounded-xl border p-4", cls[color] ?? cls.violet)}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground mb-1">{label}</p>
          <p className="text-2xl font-bold text-foreground">{value}</p>
          {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
        </div>
        <div className={cn("shrink-0 rounded-lg p-2", icls[color] ?? icls.violet)}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      {trend && (
        <div className={cn("flex items-center gap-1 mt-2 text-xs",
          trend === "up" ? "text-emerald-600" : trend === "down" ? "text-red-500" : "text-muted-foreground"
        )}>
          {trend === "up" ? <ArrowUp className="h-3 w-3" /> : trend === "down" ? <ArrowDown className="h-3 w-3" /> : null}
          <span>{trend === "up" ? "En hausse" : trend === "down" ? "En baisse" : "Stable"}</span>
        </div>
      )}
    </div>
  );
}

// ─── ACCESS CONTROL ───────────────────────────────────────────────────────────
function AccessControlView({ scans, loading }: { scans: Scan[]; loading: boolean }) {
  const allowed = scans.filter(scanAllowed).length;
  const denied = scans.length - allowed;

  const recent = useMemo(() =>
    [...scans].sort((a, b) => new Date(scanTs(b)).getTime() - new Date(scanTs(a)).getTime()).slice(0, 15),
    [scans]
  );

  const byPoint = useMemo(() => {
    const acc: Record<string, { in: number; out: number }> = {};
    scans.forEach((s) => {
      const k = scanLocation(s);
      if (!acc[k]) acc[k] = { in: 0, out: 0 };
      if (s.scan_type === "exit") acc[k].out++; else acc[k].in++;
    });
    return acc;
  }, [scans]);

  const maxIn = Math.max(...Object.values(byPoint).map((v) => v.in), 1);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Accès autorisés" value={allowed} icon={CheckCircle2} color="emerald" />
        <StatCard label="Accès refusés" value={denied} icon={XCircle} color="red" />
        <StatCard label="Total scans" value={scans.length} icon={ScanLine} color="sky" />
        <StatCard
          label="Taux d'autorisation"
          value={scans.length ? `${Math.round((allowed / scans.length) * 100)}%` : "—"}
          icon={Shield} color="violet"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 rounded-xl border bg-card">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <h3 className="text-sm font-semibold">Flux de scans en direct</h3>
            </div>
            <span className="text-xs text-muted-foreground">{recent.length} derniers enregistrements</span>
          </div>
          <div className="divide-y max-h-72 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-10 text-muted-foreground text-sm gap-2">
                <RefreshCw className="h-4 w-4 animate-spin" /> Chargement des scans...
              </div>
            ) : recent.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">Aucun scan enregistré pour cet événement</div>
            ) : recent.map((s) => {
              const ok = scanAllowed(s);
              const ts = scanTs(s);
              const badge = scanBadgeLabel(s);
              return (
                <div key={s.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/40 transition-colors">
                  <div className={cn("shrink-0 rounded-full p-1.5",
                    ok ? "bg-emerald-500/15 text-emerald-600" : "bg-red-500/15 text-red-500"
                  )}>
                    {ok ? <Unlock className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">
                      {s.visitor_id ? `Visiteur #${s.visitor_id}` : `Scan #${s.id}`}
                      {badge && (
                        <span className="ml-1.5 capitalize font-normal text-muted-foreground">· {badge}</span>
                      )}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {scanLocation(s)} · {fmtTime(ts)}
                    </p>
                  </div>
                  <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0",
                    ok ? "bg-emerald-500/10 text-emerald-600" : "bg-red-500/10 text-red-500"
                  )}>
                    {ok ? "Autorisé" : "Refusé"}
                  </span>
                  <span className="text-[10px] text-muted-foreground shrink-0 w-10 text-right">
                    {timeAgo(ts)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-xl border bg-card">
          <div className="px-4 py-3 border-b">
            <h3 className="text-sm font-semibold">Points d'accès</h3>
            <p className="text-[10px] text-muted-foreground mt-0.5">Répartition des scans par point d'entrée</p>
          </div>
          <div className="p-4 space-y-3">
            {Object.keys(byPoint).length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-6">Aucun point d'accès détecté</p>
            ) : Object.entries(byPoint)
                .sort((a, b) => (b[1].in + b[1].out) - (a[1].in + a[1].out))
                .map(([point, counts]) => (
              <div key={point} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <MapPin className="h-3 w-3 text-muted-foreground shrink-0" />
                    <span className="font-medium truncate">{point}</span>
                  </div>
                  <span className="text-muted-foreground text-[10px] shrink-0 ml-2">
                    {counts.in}↑ {counts.out}↓
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-violet-500 rounded-full transition-all"
                    style={{ width: `${(counts.in / maxIn) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── REAL-TIME FLOW ───────────────────────────────────────────────────────────
function FlowView({ scans, visitors }: { scans: Scan[]; visitors: Visitor[] }) {
  const hourlyFlow = useMemo(() => {
    const byHour: Record<number, { entries: number; exits: number }> = {};
    for (let h = 7; h <= 20; h++) byHour[h] = { entries: 0, exits: 0 };
    scans.forEach((s) => {
      const ts = scanTs(s);
      if (!ts) return;
      const h = new Date(ts).getHours();
      if (h < 7 || h > 20) return;
      if (s.scan_type === "exit") byHour[h].exits++; else byHour[h].entries++;
    });
    return Object.entries(byHour).map(([h, v]) => ({ h: `${h}h`, entries: v.entries, exits: v.exits }));
  }, [scans]);

  const peakHour = useMemo(() =>
    hourlyFlow.reduce((best, cur) => cur.entries > best.entries ? cur : best, { h: "—", entries: 0, exits: 0 }),
    [hourlyFlow]
  );

  const totalEntries = scans.filter((s) => s.scan_type !== "exit").length;
  const totalExits = scans.filter((s) => s.scan_type === "exit").length;
  const occupancy = Math.max(totalEntries - totalExits, 0);
  const registeredTotal = visitors.length;
  const conversionRate = registeredTotal ? Math.round((totalEntries / registeredTotal) * 100) : 0;
  const estimatedCap = Math.max(registeredTotal, totalEntries, 1);
  const pct = Math.min(Math.round((occupancy / estimatedCap) * 100), 100);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Présents estimés" value={occupancy.toLocaleString("fr-FR")} icon={Eye} color="sky" trend={occupancy > 0 ? "up" : "neutral"} />
        <StatCard label="Entrées totales" value={totalEntries.toLocaleString("fr-FR")} icon={ArrowUp} color="emerald" />
        <StatCard label="Sorties totales" value={totalExits.toLocaleString("fr-FR")} icon={ArrowDown} color="violet" />
        <StatCard label="Taux de présence" value={`${conversionRate}%`} sub={`${registeredTotal} inscrits`} icon={Zap} color="amber" />
      </div>

      <div className="rounded-xl border bg-card p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">Taux d'occupation estimé</h3>
          <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full",
            pct >= 90 ? "bg-red-500/10 text-red-600" :
            pct >= 70 ? "bg-amber-500/10 text-amber-600" :
            "bg-emerald-500/10 text-emerald-600"
          )}>
            {pct >= 90 ? "Critique" : pct >= 70 ? "Élevé" : pct > 0 ? "Normal" : "Faible"}
          </span>
        </div>
        <div className="relative h-6 rounded-full bg-muted overflow-hidden mb-2">
          <div
            className={cn("h-full rounded-full transition-all duration-700",
              pct >= 90 ? "bg-gradient-to-r from-red-500 to-red-600" :
              pct >= 70 ? "bg-gradient-to-r from-amber-400 to-orange-500" :
              "bg-gradient-to-r from-sky-500 to-blue-600"
            )}
            style={{ width: `${Math.max(pct, 2)}%` }}
          />
          <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-white mix-blend-difference">
            {occupancy.toLocaleString("fr-FR")} présents
          </span>
        </div>
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>0</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold">Flux horaire — Entrées &amp; Sorties</h3>
            <p className="text-[10px] text-muted-foreground mt-0.5">Basé sur {scans.length} scans réels</p>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-sky-500" /> Entrées</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-violet-400" /> Sorties</span>
          </div>
        </div>
        {scans.length === 0 ? (
          <div className="flex items-center justify-center h-44 text-sm text-muted-foreground">
            Aucun scan disponible pour cet événement
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={hourlyFlow} margin={{ top: 4, right: 8, bottom: 0, left: -10 }}>
              <defs>
                <linearGradient id="gIn" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gOut" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#7c3aed" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.06} />
              <XAxis dataKey="h" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Area type="monotone" dataKey="entries" name="Entrées" stroke="#0ea5e9" fill="url(#gIn)" strokeWidth={2} dot={false} />
              <Area type="monotone" dataKey="exits" name="Sorties" stroke="#7c3aed" fill="url(#gOut)" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Heure de pointe" value={peakHour.h} sub={`${peakHour.entries} entrées`} icon={TrendingUp} color="violet" />
        <StatCard label="Entrées vs Sorties" value={`${totalEntries} / ${totalExits}`} sub="scans enregistrés" icon={Activity} color="sky" />
        <StatCard label="Scans sans timestamp" value={scans.filter((s) => !scanTs(s)).length} sub="données incomplètes" icon={AlertTriangle} color={scans.filter((s) => !scanTs(s)).length > 0 ? "amber" : "emerald"} />
      </div>
    </div>
  );
}

// ─── ZONES ────────────────────────────────────────────────────────────────────
function ZonesView({ scans, visitors }: { scans: Scan[]; visitors: Visitor[] }) {
  const byPoint = useMemo(() => {
    const acc: Record<string, number> = {};
    scans.forEach((s) => {
      const k = scanLocation(s);
      acc[k] = (acc[k] ?? 0) + 1;
    });
    return Object.entries(acc).sort((a, b) => b[1] - a[1]);
  }, [scans]);

  const byBadge = useMemo(() => {
    const acc: Record<string, number> = {};
    scans.forEach((s) => {
      const k = s.badge_type ?? (s.badge_id !== undefined ? `badge_${s.badge_id}` : "standard");
      acc[k] = (acc[k] ?? 0) + 1;
    });
    return Object.entries(acc).sort((a, b) => b[1] - a[1]);
  }, [scans]);

  const byVisitorType = useMemo(() => {
    const acc: Record<string, number> = {};
    visitors.forEach((v) => { const k = v.visitor_type || "standard"; acc[k] = (acc[k] ?? 0) + 1; });
    return Object.entries(acc).sort((a, b) => b[1] - a[1]);
  }, [visitors]);

  const totalScans = scans.length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Points d'accès" value={byPoint.length || "—"} icon={MapPin} color="emerald" />
        <StatCard label="Types de badges" value={byBadge.length || "—"} icon={Shield} color="violet" />
        <StatCard label="Visiteurs inscrits" value={visitors.length} icon={Users} color="sky" />
        <StatCard label="Scans analysés" value={scans.length} icon={ScanLine} color="amber" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Badge type from real scans */}
        <div className="rounded-xl border bg-card p-5">
          <h3 className="text-sm font-semibold mb-1">Distribution par type de badge</h3>
          <p className="text-[10px] text-muted-foreground mb-4">Source : {scans.length} scans QR réels</p>
          {byBadge.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">Aucun scan disponible</div>
          ) : (
            <div className="space-y-3">
              {byBadge.map(([type, count]) => {
                const pct = totalScans ? Math.round((count / totalScans) * 100) : 0;
                const color = BADGE_COLORS[type] ?? "#94a3b8";
                return (
                  <div key={type} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ background: color }} />
                        <span className="capitalize font-medium">{type}</span>
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <span>{count} scans</span>
                        <span className="font-semibold text-foreground">{pct}%</span>
                      </div>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Visitor types from visitors table */}
        <div className="rounded-xl border bg-card p-5">
          <h3 className="text-sm font-semibold mb-1">Types de visiteurs inscrits</h3>
          <p className="text-[10px] text-muted-foreground mb-4">Source : {visitors.length} visiteurs enregistrés</p>
          {byVisitorType.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">Aucun visiteur disponible</div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={150}>
                <PieChart>
                  <Pie data={byVisitorType.map(([name, value]) => ({ name, value }))} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={65} innerRadius={30}>
                    {byVisitorType.map(([t], i) => (
                      <Cell key={t} fill={BADGE_COLORS[t] ?? COLOR_LIST[i % COLOR_LIST.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-3 space-y-1.5">
                {byVisitorType.map(([type, count], i) => (
                  <div key={type} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full shrink-0" style={{ background: BADGE_COLORS[type] ?? COLOR_LIST[i % COLOR_LIST.length] }} />
                      <span className="capitalize text-muted-foreground">{type}</span>
                    </div>
                    <span className="font-medium">{count}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Entry point breakdown */}
      {byPoint.length > 0 && (
        <div className="rounded-xl border bg-card p-5">
          <h3 className="text-sm font-semibold mb-4">Trafic par point d'accès</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
            <ResponsiveContainer width="100%" height={Math.min(byPoint.length * 36 + 20, 220)}>
              <BarChart
                data={byPoint.slice(0, 8).map(([name, value]) => ({
                  name: name.length > 22 ? name.slice(0, 20) + "…" : name,
                  value,
                }))}
                layout="vertical"
                margin={{ top: 0, right: 16, bottom: 0, left: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="currentColor" strokeOpacity={0.06} />
                <XAxis type="number" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={130} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Bar dataKey="value" name="Scans" fill="#10b981" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <div className="space-y-2">
              {byPoint.map(([point, count], i) => (
                <div key={point} className="flex items-center justify-between text-xs border-b border-border/40 pb-1.5 last:border-0 last:pb-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="h-2 w-2 rounded-full shrink-0" style={{ background: COLOR_LIST[i % COLOR_LIST.length] }} />
                    <span className="text-muted-foreground truncate">{point}</span>
                  </div>
                  <span className="font-semibold shrink-0 ml-2">{count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── ANALYTICS ────────────────────────────────────────────────────────────────
function AnalyticsView({ scans, visitors }: { scans: Scan[]; visitors: Visitor[] }) {
  const dailyData = useMemo(() => {
    const byDay: Record<string, number> = {};
    scans.forEach((s) => {
      const ts = scanTs(s);
      if (!ts) return;
      const d = new Date(ts).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
      byDay[d] = (byDay[d] ?? 0) + 1;
    });
    return Object.entries(byDay)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-14)
      .map(([day, count]) => ({ day, count }));
  }, [scans]);

  const badgeDist = useMemo(() => {
    const acc: Record<string, number> = {};
    scans.forEach((s) => {
      const k = s.badge_type ?? (s.badge_id !== undefined ? `badge_${s.badge_id}` : "standard");
      acc[k] = (acc[k] ?? 0) + 1;
    });
    return Object.entries(acc).sort((a, b) => b[1] - a[1]);
  }, [scans]);

  const peakHour = useMemo(() => {
    const byH: Record<number, number> = {};
    scans.forEach((s) => {
      const ts = scanTs(s);
      if (!ts) return;
      const h = new Date(ts).getHours();
      byH[h] = (byH[h] ?? 0) + 1;
    });
    const sorted = Object.entries(byH).sort((a, b) => Number(b[1]) - Number(a[1]));
    return sorted.length > 0 ? { hour: `${sorted[0][0]}h`, count: Number(sorted[0][1]) } : { hour: "—", count: 0 };
  }, [scans]);

  const todayScans = useMemo(() =>
    scans.filter((s) => {
      const ts = scanTs(s);
      return ts && new Date(ts).toDateString() === new Date().toDateString();
    }).length,
    [scans]
  );

  function exportCSV() {
    const rows = [
      ["Type de badge", "Scans", "% Total"],
      ...badgeDist.map(([t, n]) => [t, n, scans.length ? `${Math.round((n / scans.length) * 100)}%` : "0%"]),
    ];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `traffic-analytics-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Total visiteurs" value={visitors.length} icon={Users} color="violet" />
        <StatCard label="Total scans" value={scans.length} icon={ScanLine} color="sky" />
        <StatCard label="Heure de pointe" value={peakHour.hour} sub={`${peakHour.count} scans`} icon={TrendingUp} color="emerald" />
        <StatCard label="Scans aujourd'hui" value={todayScans} icon={Clock} color="amber" />
      </div>

      {/* Daily scan trend */}
      <div className="rounded-xl border bg-card p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold">Scans par jour</h3>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {dailyData.length > 0 ? `${dailyData.length} jours de données réelles` : "Aucune donnée disponible"}
            </p>
          </div>
          <button
            onClick={exportCSV}
            className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <Download className="h-3.5 w-3.5" />
            Exporter CSV
          </button>
        </div>
        {dailyData.length === 0 ? (
          <div className="flex items-center justify-center h-44 text-sm text-muted-foreground">
            {scans.length === 0 ? "Aucun scan enregistré pour cet événement" : "Les scans ne contiennent pas de timestamp exploitable"}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={dailyData} margin={{ top: 4, right: 8, bottom: 0, left: -10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.06} />
              <XAxis dataKey="day" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Bar dataKey="count" name="Scans" fill="#7c3aed" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Badge distribution */}
      <div className="rounded-xl border bg-card p-5">
        <h3 className="text-sm font-semibold mb-4">Distribution par type de badge</h3>
        {badgeDist.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">Aucun scan disponible</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 items-center">
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={badgeDist.map(([name, value]) => ({ name, value }))} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} innerRadius={35}>
                  {badgeDist.map(([t], i) => (
                    <Cell key={t} fill={BADGE_COLORS[t] ?? COLOR_LIST[i % COLOR_LIST.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-3">
              {badgeDist.map(([type, count], i) => {
                const pct = scans.length ? Math.round((count / scans.length) * 100) : 0;
                const color = BADGE_COLORS[type] ?? COLOR_LIST[i % COLOR_LIST.length];
                return (
                  <div key={type}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-sm" style={{ background: color }} />
                        <span className="capitalize font-medium">{type}</span>
                      </div>
                      <span className="text-muted-foreground">
                        {count} · <span className="font-semibold text-foreground">{pct}%</span>
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="Taux de participation"
          value={visitors.length ? `${Math.min(Math.round((scans.length / visitors.length) * 100), 100)}%` : "—"}
          sub="scans / inscrits"
          icon={TrendingUp} color="sky"
        />
        <StatCard
          label="Scans non identifiés"
          value={scans.filter((s) => !s.badge_type && s.badge_id === undefined).length}
          sub="sans badge associé"
          icon={AlertTriangle}
          color={scans.filter((s) => !s.badge_type && s.badge_id === undefined).length > 0 ? "amber" : "emerald"}
        />
        <StatCard
          label="Types de visiteurs"
          value={new Set(visitors.map((v) => v.visitor_type || "standard")).size}
          sub="catégories distinctes"
          icon={TrendingDown} color="violet"
        />
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
function TrafficPage() {
  const { activeEvent } = useEvent();
  const eventId = activeEvent.id !== "0" ? Number(activeEvent.id) : null;
  const [configType, setConfigType] = useState<ConfigKey>("access");
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, [autoRefresh]);

  const scansUrl = `/api/v1/scans?limit=500${eventId ? `&event_id=${eventId}` : ""}`;
  const visitorsUrl = `/api/v1/visitors?limit=500${eventId ? `&event_id=${eventId}` : ""}`;

  const { data: rawScans, isLoading: scansLoading, isError: scansError } = useQuery({
    queryKey: ["traffic-scans", eventId, tick],
    queryFn: () => apiRequest<Scan[]>(scansUrl),
    staleTime: 30_000,
    retry: false,
    throwOnError: false,
  });

  const { data: rawVisitors, isLoading: visitorsLoading } = useQuery({
    queryKey: ["traffic-visitors", eventId],
    queryFn: () => apiRequest<Visitor[]>(visitorsUrl),
    staleTime: 60_000,
    retry: false,
    throwOnError: false,
  });

  // Strip any null/undefined items that TybotFlow can occasionally return
  const scans: Scan[] = Array.isArray(rawScans) ? rawScans.filter(Boolean) as Scan[] : [];
  const visitors: Visitor[] = Array.isArray(rawVisitors) ? rawVisitors.filter(Boolean) as Visitor[] : [];

  const active = CONFIG_TYPES.find((c) => c.key === configType)!;
  const loading = scansLoading || visitorsLoading;

  return (
    <div className="flex flex-col gap-6 p-6 max-w-7xl mx-auto w-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground">Gestion du Trafic</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {activeEvent.name}
            {scansError && <span className="ml-2 text-amber-500">· Erreur de chargement des scans</span>}
            {!loading && !scansError && (
              <span className="ml-2">· {scans.length} scans · {visitors.length} visiteurs</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAutoRefresh((v) => !v)}
            className={cn(
              "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
              autoRefresh
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600"
                : "border-border text-muted-foreground hover:text-foreground"
            )}
          >
            <RefreshCw className={cn("h-3.5 w-3.5", autoRefresh && "animate-spin")} />
            Auto {autoRefresh ? "ON" : "OFF"}
          </button>
          <button
            onClick={() => setTick((t) => t + 1)}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            Actualiser
          </button>
        </div>
      </div>

      {/* Config selector */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {CONFIG_TYPES.map((c) => {
          const selected = configType === c.key;
          return (
            <button
              key={c.key}
              onClick={() => setConfigType(c.key)}
              className={cn(
                "group relative rounded-xl border p-4 text-left transition-all duration-200",
                selected ? cn("shadow-md", c.border, c.bg) : "border-border hover:border-border/80 hover:bg-muted/40"
              )}
            >
              {selected && (
                <div className={cn("absolute inset-0 rounded-xl bg-gradient-to-br opacity-5", c.gradient)} />
              )}
              <div className="relative flex items-start justify-between gap-2">
                <div className={cn("rounded-lg p-2 transition-colors",
                  selected ? cn(c.bg, c.text) : "bg-muted text-muted-foreground group-hover:bg-muted/80"
                )}>
                  <c.icon className="h-4 w-4" />
                </div>
                {selected && <ChevronRight className={cn("h-3.5 w-3.5 mt-1 shrink-0", c.text)} />}
              </div>
              <div className="relative mt-3">
                <p className={cn("text-sm font-semibold", selected ? c.text : "text-foreground")}>{c.label}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">{c.desc}</p>
              </div>
              {selected && (
                <div className={cn("absolute bottom-0 left-4 right-4 h-0.5 rounded-full bg-gradient-to-r", c.gradient)} />
              )}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div>
        {configType === "access" && <AccessControlView scans={scans} loading={scansLoading} />}
        {configType === "flow" && <FlowView scans={scans} visitors={visitors} />}
        {configType === "zones" && <ZonesView scans={scans} visitors={visitors} />}
        {configType === "analytics" && <AnalyticsView scans={scans} visitors={visitors} />}
      </div>
    </div>
  );
}
