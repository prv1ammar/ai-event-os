import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { TrendingUp, MapPin, Activity, RefreshCw, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/api";

export const Route = createFileRoute("/floor-plan")({
  component: FloorPlanPage,
  head: () => ({
    meta: [{ title: "Plan du Salon — AI EVENT OS" }],
  }),
});

// ─── Types ────────────────────────────────────────────────────────────────────
interface Space {
  id: number;
  name?: string;
  code?: string;
  space_type?: string;   // stand | espace_sponsoring | kiosque | espace_networking | autre
  surface_sqm?: string | number;
  price?: string | number;
  status?: string;       // disponible | réservé | occupé | bloqué
  logistics_zones?: { id: number; name?: string } | null;
  "org stands - stand_label"?: string[];
  [key: string]: unknown;
}

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; border: string }> = {
  disponible: { label: "Disponible", bg: "bg-emerald-500/15", text: "text-emerald-700", border: "border-emerald-400/40" },
  "réservé":  { label: "Réservé",    bg: "bg-amber-400/15",   text: "text-amber-700",   border: "border-amber-400/40" },
  "occupé":   { label: "Occupé",     bg: "bg-red-500/20",     text: "text-red-700",     border: "border-red-400/50" },
  "bloqué":   { label: "Bloqué",     bg: "bg-muted",           text: "text-muted-foreground", border: "border-border" },
};
function statusConf(s?: string) {
  return STATUS_CONFIG[s ?? ""] ?? STATUS_CONFIG.disponible;
}

const TYPE_LABELS: Record<string, string> = {
  stand: "Stand", espace_sponsoring: "Espace sponsoring", kiosque: "Kiosque",
  espace_networking: "Espace networking", autre: "Autre",
};

function num(v: string | number | undefined): number {
  const n = Number(v ?? 0);
  return isNaN(n) ? 0 : n;
}

function fmtMAD(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M MAD`;
  if (v >= 1_000) return `${Math.round(v / 1_000)}K MAD`;
  return `${v} MAD`;
}

function formatTime(date: Date) {
  return date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

async function fetchSpaces(): Promise<Space[]> {
  const raw = await apiRequest<Space[] | { list: Space[] }>("/api/v1/booths?limit=500");
  return Array.isArray(raw) ? raw : (raw.list ?? []);
}

// ─── Space cell ───────────────────────────────────────────────────────────────
function SpaceCell({ space, onClick, selected }: {
  space: Space;
  onClick: () => void;
  selected: boolean;
}) {
  const cfg = statusConf(space.status);
  const occupant = space["org stands - stand_label"]?.[0];
  return (
    <button
      onClick={onClick}
      title={`${space.code ?? space.name} — ${cfg.label}${occupant ? ` · ${occupant}` : ""}`}
      className={cn(
        "relative flex flex-col items-center justify-center rounded-md border text-center p-2 min-h-[64px] transition-all duration-150 hover:scale-105 hover:z-10 hover:shadow-md cursor-pointer",
        cfg.bg,
        cfg.border,
        selected && "ring-2 ring-primary ring-offset-1 scale-105 z-10 shadow-glow-sm",
      )}
    >
      <span className={cn("text-[10px] font-bold tracking-wide", cfg.text)}>{space.code ?? `#${space.id}`}</span>
      <span className={cn("text-[9px] font-medium leading-tight mt-0.5 truncate max-w-full", cfg.text)}>
        {space.name ?? TYPE_LABELS[space.space_type ?? ""] ?? ""}
      </span>
      {num(space.surface_sqm) > 0 && (
        <span className={cn("text-[8px] opacity-70 mt-0.5", cfg.text)}>{num(space.surface_sqm)} m²</span>
      )}
    </button>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
function FloorPlanPage() {
  const [selected, setSelected] = useState<Space | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  const { data: spaces = [], isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["commercial-spaces"],
    queryFn: fetchSpaces,
    staleTime: 60_000,
    retry: 1,
    throwOnError: false,
  });

  // Group by logistics zone
  const zones = useMemo(() => {
    const map = new Map<string, Space[]>();
    for (const s of spaces) {
      const zone = s.logistics_zones?.name ?? "Zone non assignée";
      if (!map.has(zone)) map.set(zone, []);
      map.get(zone)!.push(s);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [spaces]);

  const statusCounts = useMemo(
    () => spaces.reduce<Record<string, number>>((acc, s) => {
      const k = s.status ?? "disponible";
      acc[k] = (acc[k] ?? 0) + 1;
      return acc;
    }, {}),
    [spaces],
  );

  const totalValue = useMemo(() => spaces.reduce((a, s) => a + num(s.price), 0), [spaces]);
  const soldValue = useMemo(
    () => spaces.filter((s) => ["réservé", "occupé"].includes(s.status ?? "")).reduce((a, s) => a + num(s.price), 0),
    [spaces],
  );
  const occupancy = spaces.length > 0
    ? Math.round(((statusCounts["réservé"] ?? 0) + (statusCounts["occupé"] ?? 0)) / spaces.length * 100)
    : 0;

  function handleRefresh() {
    refetch();
    setLastUpdated(new Date());
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Espaces commerciaux</p>
          <h1 className="font-display text-xl font-semibold text-foreground mt-0.5">Plan du Salon</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Stands, kiosques et espaces sponsoring par zone · Mise à jour : {formatTime(lastUpdated)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isError && (
            <span className="flex items-center gap-1 text-xs text-destructive">
              <AlertCircle className="h-3.5 w-3.5" />
              Données hors ligne
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={handleRefresh}
            disabled={isFetching}
          >
            <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
            {isFetching ? "Actualisation…" : "Actualiser"}
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: "Espaces total", value: isLoading ? "…" : String(spaces.length), icon: MapPin, tone: "primary" },
          { label: "Taux d'occupation", value: isLoading ? "…" : `${occupancy}%`, icon: Activity, tone: "rose" },
          { label: "Valeur réservée", value: isLoading ? "…" : fmtMAD(soldValue), icon: TrendingUp, tone: "amber" },
          { label: "Valeur catalogue", value: isLoading ? "…" : fmtMAD(totalValue), icon: TrendingUp, tone: "green" },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-border bg-card p-3">
            <div className={cn(
              "flex h-8 w-8 items-center justify-center rounded-lg mb-2",
              s.tone === "primary" && "bg-primary/10 text-primary",
              s.tone === "green" && "bg-success/10 text-success",
              s.tone === "amber" && "bg-warning/10 text-warning",
              s.tone === "rose" && "bg-destructive/10 text-destructive",
            )}>
              <s.icon className="h-4 w-4" />
            </div>
            <p className="text-[11px] text-muted-foreground">{s.label}</p>
            <p className="text-lg font-bold text-foreground tabular-nums mt-0.5">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs font-semibold text-muted-foreground mr-1">Légende :</span>
        {Object.entries(STATUS_CONFIG).map(([k, cfg]) => (
          <div key={k} className="flex items-center gap-1.5">
            <span className={cn("h-3.5 w-3.5 rounded-sm border", cfg.bg, cfg.border)} />
            <span className="text-xs text-muted-foreground">{cfg.label}</span>
            <span className="text-[10px] text-muted-foreground/60">({statusCounts[k] ?? 0})</span>
          </div>
        ))}
      </div>

      {/* Zones */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-5">
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            Chargement des espaces…
          </div>
        ) : zones.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
            Aucun espace commercial défini.
          </div>
        ) : (
          zones.map(([zoneName, zoneSpaces]) => (
            <div key={zoneName}>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-bold text-foreground uppercase tracking-wider">{zoneName}</span>
                <span className="text-[10px] text-muted-foreground">({zoneSpaces.length} espace{zoneSpaces.length !== 1 ? "s" : ""})</span>
                <div className="flex-1 h-px bg-border" />
              </div>
              <div className="grid gap-1.5 grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
                {zoneSpaces.map((space) => (
                  <SpaceCell
                    key={space.id}
                    space={space}
                    selected={selected?.id === space.id}
                    onClick={() => setSelected(selected?.id === space.id ? null : space)}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Selected space detail */}
      {selected && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 flex items-center gap-4">
          <div className={cn(
            "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-xs font-bold",
            statusConf(selected.status).bg,
            statusConf(selected.status).text,
          )}>
            {selected.code ?? `#${selected.id}`}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-foreground">{selected.name ?? "Espace"}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {TYPE_LABELS[selected.space_type ?? ""] ?? selected.space_type} · {selected.logistics_zones?.name ?? "—"}
              {num(selected.surface_sqm) > 0 && <> · {num(selected.surface_sqm)} m²</>}
              {num(selected.price) > 0 && <> · {fmtMAD(num(selected.price))}</>}
              {selected["org stands - stand_label"]?.[0] && <> · {selected["org stands - stand_label"]![0]}</>}
            </p>
          </div>
          <span className={cn(
            "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold border",
            statusConf(selected.status).bg,
            statusConf(selected.status).text,
            statusConf(selected.status).border,
          )}>
            {statusConf(selected.status).label}
          </span>
          <button
            onClick={() => setSelected(null)}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
