import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import QRCode from "react-qr-code";
import {
  Download, Printer, Search, QrCode, CheckCircle2, Clock, Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useEvent } from "@/lib/event-context";
import { apiRequest } from "@/lib/api";

export const Route = createFileRoute("/badges")({
  component: BadgesPage,
  head: () => ({
    meta: [{ title: "Badges & QR Codes — AI EVENT OS" }],
  }),
});

// ─── Types ────────────────────────────────────────────────────────────────────
interface Badge {
  id: number;
  badge_number?: string;
  qr_code?: string;
  badge_type?: string;
  status?: string;
  issued_at?: string;
  [key: string]: unknown;
}

interface Visitor {
  id: number;
  firstname?: string;
  lastname?: string;
  email?: string;
  company?: string;
  job_title?: string;
  country?: string;
  visitor_type?: string;
  badges_id?: number | null;
  event_id?: number | null;
  [key: string]: unknown;
}

// ─── Fetchers ─────────────────────────────────────────────────────────────────
async function fetchBadges(): Promise<Badge[]> {
  const raw = await apiRequest<Badge[] | { list: Badge[] }>("/api/v1/badges?limit=500");
  return Array.isArray(raw) ? raw : (raw.list ?? []);
}

async function fetchVisitors(eventId: string | null): Promise<Visitor[]> {
  const url = eventId ? `/api/v1/visitors?limit=500&event_id=${eventId}` : `/api/v1/visitors?limit=500`;
  const raw = await apiRequest<Visitor[] | { list: Visitor[] }>(url);
  return Array.isArray(raw) ? raw : (raw.list ?? []);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getFullName(v: Visitor) {
  const first = v.firstname ?? "";
  const last = v.lastname ?? "";
  return `${first} ${last}`.trim() || `Visiteur #${v.id}`;
}

function getInitials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");
}

const TYPE_STYLES: Record<string, { headerBg: string; accentText: string; accentBg: string; label: string }> = {
  vip: { headerBg: "bg-gradient-to-br from-purple-600 to-indigo-600", accentText: "text-purple-600", accentBg: "bg-purple-500/10", label: "VIP" },
  press: { headerBg: "bg-orange-500", accentText: "text-orange-600", accentBg: "bg-orange-500/10", label: "PRESSE" },
  presse: { headerBg: "bg-orange-500", accentText: "text-orange-600", accentBg: "bg-orange-500/10", label: "PRESSE" },
  exhibitor: { headerBg: "bg-emerald-600", accentText: "text-emerald-600", accentBg: "bg-emerald-500/10", label: "EXPOSANT" },
  staff: { headerBg: "bg-red-600", accentText: "text-red-600", accentBg: "bg-red-500/10", label: "ORGANISATEUR" },
  standard: { headerBg: "bg-sky-600", accentText: "text-sky-600", accentBg: "bg-sky-500/10", label: "VISITEUR" },
};

function getTypeStyle(type?: string) {
  return TYPE_STYLES[(type ?? "standard").toLowerCase()] ?? TYPE_STYLES.standard;
}

// QR value format: AIEVENT|{visitor_id}|{badge_type}|{badge_number}
function buildQRValue(visitor: Visitor, badge?: Badge): string {
  const type = visitor.visitor_type ?? badge?.badge_type ?? "standard";
  const num = badge?.badge_number ?? `VIS-${String(visitor.id).padStart(4, "0")}`;
  return `AIEVENT|${visitor.id}|${type}|${num}`;
}

// ─── Badge Card ───────────────────────────────────────────────────────────────
function BadgeCard({ visitor, badge, eventName }: {
  visitor: Visitor;
  badge?: Badge;
  eventName: string;
}) {
  const name = getFullName(visitor);
  const initials = getInitials(name);
  const type = visitor.visitor_type ?? badge?.badge_type ?? "standard";
  const style = getTypeStyle(type);
  const badgeNum = badge?.badge_number ?? `VIS-${String(visitor.id).padStart(4, "0")}`;
  const qrValue = buildQRValue(visitor, badge);
  const isActive = badge?.status === "active" || !badge;

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm hover:shadow-md transition-shadow">
      {/* Badge visual */}
      <div className="bg-white rounded-xl overflow-hidden m-2 shadow-sm">
        <div className={cn("px-3 py-2 text-center text-white", style.headerBg)}>
          <p className="text-[9px] font-bold tracking-[0.2em] uppercase opacity-80">AI EVENT OS</p>
          <p className="text-[10px] font-bold tracking-wider uppercase">{style.label}</p>
        </div>
        <div className="px-3 py-3 flex flex-col items-center gap-2">
          <div className={cn("h-12 w-12 rounded-full flex items-center justify-center text-sm font-bold", style.accentBg)}>
            <span className={style.accentText}>{initials || "?"}</span>
          </div>
          <div className="text-center">
            <p className="text-xs font-bold text-gray-900 leading-tight">{name}</p>
            <p className="text-[10px] text-gray-500">{visitor.company ?? "—"}</p>
            {visitor.job_title && <p className="text-[9px] text-gray-400">{visitor.job_title}</p>}
          </div>
          <div className={cn("p-1.5 rounded-lg bg-white")}>
            <QRCode value={qrValue} size={52} level="M" />
          </div>
          <p className="font-mono text-[9px] text-gray-400 tracking-widest">{badgeNum}</p>
          <div className="w-full rounded bg-gray-50 px-2 py-1 text-center">
            <p className="text-[9px] font-semibold text-gray-600 truncate">{eventName}</p>
          </div>
        </div>
        <div className={cn("px-3 py-1.5 text-center", style.accentBg)}>
          <p className={cn("text-[9px] font-semibold uppercase tracking-wider", style.accentText)}>Accès autorisé</p>
        </div>
      </div>

      {/* Info row */}
      <div className="px-3 pb-3 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs">
          <span className={cn("h-2 w-2 rounded-full", isActive ? "bg-emerald-500" : "bg-amber-400")} />
          <span className="text-muted-foreground">{isActive ? "Actif" : "En attente"}</span>
        </div>
        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground">
          <Download className="h-3 w-3" /> PDF
        </Button>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
function BadgesPage() {
  const { activeEvent } = useEvent();
  const eventId = activeEvent.id !== "0" ? activeEvent.id : null;
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  const { data: visitors = [], isLoading: loadingV } = useQuery({
    queryKey: ["visitors", eventId],
    queryFn: () => fetchVisitors(eventId),
    staleTime: 60_000,
  });

  const { data: badges = [], isLoading: loadingB } = useQuery({
    queryKey: ["badges"],
    queryFn: fetchBadges,
    staleTime: 60_000,
  });

  const isLoading = loadingV || loadingB;

  // Build badge map: badge_id → badge
  const badgeMap = new Map<number, Badge>(badges.map((b) => [b.id, b]));

  // Filter visitors
  const filtered = visitors.filter((v) => {
    if (typeFilter !== "all") {
      const t = (v.visitor_type ?? "standard").toLowerCase();
      if (typeFilter === "vip" && t !== "vip") return false;
      if (typeFilter === "press" && !["press", "presse"].includes(t)) return false;
      if (typeFilter === "standard" && t !== "standard") return false;
    }
    if (search) {
      const q = search.toLowerCase();
      const name = getFullName(v).toLowerCase();
      const company = (v.company ?? "").toLowerCase();
      if (!name.includes(q) && !company.includes(q)) return false;
    }
    return true;
  });

  const stats = {
    total: visitors.length,
    active: badges.filter((b) => b.status === "active").length,
    pending: badges.filter((b) => b.status !== "active").length + Math.max(0, visitors.length - badges.length),
    vip: visitors.filter((v) => (v.visitor_type ?? "").toLowerCase() === "vip").length,
  };

  const typeOptions = [
    { value: "all", label: `Tous (${visitors.length})` },
    { value: "vip", label: `VIP (${stats.vip})` },
    { value: "standard", label: `Standard` },
    { value: "press", label: `Presse` },
  ];

  return (
    <div className="p-6 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Accréditation</p>
          <h1 className="font-display text-2xl font-semibold text-foreground mt-0.5">Badges & QR Codes</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isLoading ? "Chargement…" : `${visitors.length} participant(s) — ${activeEvent.name}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-9">
            <Printer className="h-4 w-4" /> Impression lot
          </Button>
          <Button size="sm" className="h-9 bg-gradient-primary text-primary-foreground shadow-glow-sm">
            <Download className="h-4 w-4" /> Exporter tout
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: "Total badges", value: stats.total, icon: QrCode, cls: "bg-primary/10 text-primary" },
          { label: "Actifs", value: stats.active, icon: CheckCircle2, cls: "bg-emerald-500/10 text-emerald-600" },
          { label: "En attente", value: stats.pending, icon: Clock, cls: "bg-amber-500/10 text-amber-600" },
          { label: "VIP", value: stats.vip, icon: Users, cls: "bg-purple-500/10 text-purple-600" },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-border bg-card p-4">
            <div className={cn("flex h-9 w-9 items-center justify-center rounded-lg mb-3", s.cls)}>
              <s.icon className="h-4 w-4" />
            </div>
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <p className="text-2xl font-bold text-foreground tracking-tight tabular-nums mt-1">
              {isLoading ? "…" : s.value.toLocaleString("fr-FR")}
            </p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Rechercher par nom ou entreprise…" value={search}
            onChange={(e) => setSearch(e.target.value)} className="h-9 pl-9 bg-card" />
        </div>
        <div className="flex gap-2">
          {typeOptions.map((opt) => (
            <button key={opt.value} onClick={() => setTypeFilter(opt.value)}
              className={cn("rounded-lg px-3 py-1.5 text-sm font-medium border transition-colors",
                typeFilter === opt.value
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card border-border text-muted-foreground hover:text-foreground")}>
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Badge grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-24 text-muted-foreground gap-2">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span className="text-sm">Chargement des badges…</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-border bg-card py-20 text-center text-muted-foreground text-sm">
          Aucun badge trouvé
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {filtered.map((v) => (
            <BadgeCard
              key={v.id}
              visitor={v}
              badge={v.badges_id ? badgeMap.get(v.badges_id) : undefined}
              eventName={activeEvent.shortName ?? activeEvent.name}
            />
          ))}
        </div>
      )}

      {/* Progress bar */}
      {!isLoading && visitors.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-display text-base font-semibold text-foreground">Progression d'impression</h3>
            <span className="text-xs text-muted-foreground">
              {Math.round((stats.active / Math.max(1, stats.total)) * 100)}% complété
            </span>
          </div>
          <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden">
            <div className="h-full rounded-full bg-gradient-primary transition-all duration-700"
              style={{ width: `${Math.round((stats.active / Math.max(1, stats.total)) * 100)}%` }} />
          </div>
          <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
            <span>{stats.active.toLocaleString("fr-FR")} imprimés</span>
            <span>{(stats.total - stats.active).toLocaleString("fr-FR")} restants</span>
          </div>
        </div>
      )}
    </div>
  );
}
