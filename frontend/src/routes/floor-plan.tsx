import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Users, TrendingUp, MapPin, Activity, RefreshCw, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/api";

export const Route = createFileRoute("/floor-plan")({
  component: FloorPlanPage,
  head: () => ({
    meta: [{ title: "Plan du Salon — AI EVENT OS" }],
  }),
});

type Density = "faible" | "moyenne" | "forte" | "tres-forte" | "special";

const densityConfig: Record<Density, { label: string; bg: string; text: string; border: string }> = {
  faible: {
    label: "Faible activité",
    bg: "bg-emerald-500/15",
    text: "text-emerald-700",
    border: "border-emerald-400/40",
  },
  moyenne: {
    label: "Moyenne",
    bg: "bg-amber-400/15",
    text: "text-amber-700",
    border: "border-amber-400/40",
  },
  forte: {
    label: "Forte",
    bg: "bg-orange-500/15",
    text: "text-orange-700",
    border: "border-orange-400/40",
  },
  "tres-forte": {
    label: "Très forte",
    bg: "bg-red-500/20",
    text: "text-red-700",
    border: "border-red-400/50",
  },
  special: {
    label: "Zone spéciale",
    bg: "bg-primary/10",
    text: "text-primary",
    border: "border-primary/30",
  },
};

type Booth = {
  id: string;
  exhibitor?: string;
  density: Density;
  visitors?: number;
};

interface ApiBooth {
  id: string | number;
  number?: string;
  zone?: string;
  status?: string;
  exhibitor_name?: string;
  price_mad?: number;
  size_m2?: number;
  [key: string]: unknown;
}

function statusToDensity(status?: string): Density {
  if (status === "occupied") return "forte";
  if (status === "reserved") return "moyenne";
  return "faible";
}

function makeBooth(id: string, exhibitor?: string, density: Density = "faible", visitors?: number): Booth {
  return { id, exhibitor, density, visitors };
}

// Static floor plan layout — defines spatial arrangement of Hall A and Hall B
const hallALayout: Booth[][] = [
  [
    makeBooth("A01", "AgroMaroc", "tres-forte", 142),
    makeBooth("A02", "Green Foods", "forte", 98),
    makeBooth("A03", "Atlas Fruits", "tres-forte", 156),
    makeBooth("A04", "BioNature", "forte", 87),
    makeBooth("A05", "Fresh Export", "moyenne", 54),
    makeBooth("A06", "Medina Dates", "faible", 23),
    makeBooth("A07", "Maroc Organic", "moyenne", 41),
    makeBooth("A08", "Nature Valley", "forte", 76),
  ],
  [
    makeBooth("A09", "Olive Co.", "faible", 18),
    makeBooth("A10", "Argan Plus", "moyenne", 47),
    makeBooth("A11", "Sahara Grains", "forte", 89),
    makeBooth("A12", "Casablanca Bio", "tres-forte", 134),
    makeBooth("A13", "Fès Légumes", "faible", 12),
    makeBooth("A14", "Rabat Dairy", "moyenne", 55),
    makeBooth("A15", "Agadir Sea", "forte", 91),
    makeBooth("A16", "TechAgro", "faible", 31),
  ],
  [
    makeBooth("A17", "BioMarket", "moyenne", 49),
    makeBooth("A18", "GreenBridge", "forte", 78),
    makeBooth("A19", "Atlas Bio", "tres-forte", 121),
    makeBooth("A20", "Marrakech Oils", "forte", 95),
    makeBooth("A21", "SunFoods", "faible", 22),
    makeBooth("A22", "Medina Spices", "moyenne", 63),
    makeBooth("A23", "FoodTech MA", "tres-forte", 148),
    makeBooth("A24", "AquaFarming", "faible", 16),
  ],
  [
    makeBooth("A25", "BioPack", "forte", 82),
    makeBooth("A26", "Harvest Gold", "moyenne", 44),
    makeBooth("A27", "ColdChain MA", "faible", 29),
    makeBooth("A28", "EcoProcess", "forte", 73),
    makeBooth("A29", "NutriLab", "moyenne", 58),
    makeBooth("A30", "OrganoFarm", "faible", 19),
    makeBooth("A31", "MorocBev", "tres-forte", 138),
    makeBooth("A32", "Agroplus", "forte", 86),
  ],
];

const hallBLayout: Booth[][] = [
  [
    makeBooth("B01", "GulfExport", "tres-forte", 161),
    makeBooth("B02", "PanAfrica", "forte", 94),
    makeBooth("B03", "EuroFresh", "moyenne", 51),
    makeBooth("B04", "AsiaLink", "faible", 27),
    makeBooth("B05", "Mediterra", "forte", 88),
    makeBooth("B06", "Sahel Trade", "tres-forte", 143),
    makeBooth("B07", "Atlantic Bio", "faible", 35),
    makeBooth("B08", "Iberia Foods", "moyenne", 67),
  ],
  [
    makeBooth("B09", "FranceFresh", "forte", 79),
    makeBooth("B10", "ItalyOrg.", "tres-forte", 152),
    makeBooth("B11", "SpainOlive", "forte", 103),
    makeBooth("B12", "GermBio", "faible", 24),
    makeBooth("B13", "BelgiqueChoc", "moyenne", 53),
    makeBooth("B14", "NLSeeds", "forte", 71),
    makeBooth("B15", "UK Organic", "faible", 14),
    makeBooth("B16", "CanadaGrain", "tres-forte", 127),
  ],
  [
    makeBooth("B17", "USANuts", "forte", 96),
    makeBooth("B18", "BrazilFruit", "tres-forte", 165),
    makeBooth("B19", "ArgentineMeat", "forte", 82),
    makeBooth("B20", "ChileVines", "faible", 31),
    makeBooth("B21", "IndiaTea", "moyenne", 68),
    makeBooth("B22", "ChinaRice", "tres-forte", 139),
    makeBooth("B23", "JapanUmami", "forte", 87),
    makeBooth("B24", "KoreaKimchi", "faible", 22),
  ],
  [
    makeBooth("B25", "TurkeyFig", "moyenne", 57),
    makeBooth("B26", "EgyptDate", "forte", 93),
    makeBooth("B27", "UAESpice", "tres-forte", 148),
    makeBooth("B28", "SaudiHerbs", "forte", 76),
    makeBooth("B29", "TunisOlive", "faible", 25),
    makeBooth("B30", "AlgeriaVeg", "moyenne", 43),
    makeBooth("B31", "SenegalFish", "forte", 89),
    makeBooth("B32", "GhanaCoconut", "tres-forte", 131),
  ],
];

function formatTime(date: Date) {
  return date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function mergeApiData(layout: Booth[][], apiMap: Map<string, ApiBooth>): Booth[][] {
  return layout.map((row) =>
    row.map((booth) => {
      const api = apiMap.get(booth.id.toUpperCase());
      if (!api) return booth;
      return {
        ...booth,
        exhibitor: api.exhibitor_name || booth.exhibitor,
        density: statusToDensity(api.status),
      };
    }),
  );
}

function BoothCell({ booth, onClick, selected }: {
  booth: Booth;
  onClick: () => void;
  selected: boolean;
}) {
  const cfg = densityConfig[booth.density];
  return (
    <button
      onClick={onClick}
      title={`${booth.id} — ${booth.exhibitor ?? "Libre"} · ${booth.visitors ?? 0} visiteurs`}
      className={cn(
        "relative flex flex-col items-center justify-center rounded-md border text-center p-1 transition-all duration-150 hover:scale-105 hover:z-10 hover:shadow-md cursor-pointer",
        cfg.bg,
        cfg.border,
        selected && "ring-2 ring-primary ring-offset-1 scale-105 z-10 shadow-glow-sm",
      )}
      style={{ minWidth: 0 }}
    >
      <span className={cn("text-[9px] font-bold tracking-wide", cfg.text)}>{booth.id}</span>
      {booth.visitors && (
        <span className={cn("text-[8px] font-medium leading-tight mt-0.5", cfg.text)}>
          {booth.visitors}
        </span>
      )}
    </button>
  );
}

function SpecialZone({ label, icon: Icon, className }: {
  label: string;
  icon: typeof MapPin;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-primary/30 bg-primary/5 p-2 text-center", className)}>
      <Icon className="h-4 w-4 text-primary mb-1" />
      <span className="text-[9px] font-semibold text-primary uppercase tracking-wide leading-tight">{label}</span>
    </div>
  );
}

function FloorPlanPage() {
  const [selectedBooth, setSelectedBooth] = useState<Booth | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  const { data: apiBooths, isLoading, isError, refetch, isFetching } = useQuery<ApiBooth[]>({
    queryKey: ["booths-floor-plan"],
    queryFn: () => apiRequest<ApiBooth[]>("/api/v1/booths?limit=100"),
    staleTime: 60_000,
    retry: 1,
    throwOnError: false,
  });

  // Build lookup map: booth number (uppercase) → api booth
  const apiMap = useMemo(() => {
    const map = new Map<string, ApiBooth>();
    if (apiBooths) {
      for (const b of apiBooths) {
        if (b.number) map.set(b.number.toUpperCase(), b);
      }
    }
    return map;
  }, [apiBooths]);

  // Merge API data into layout (falls back to static data if API unavailable)
  const hallA = useMemo(() => mergeApiData(hallALayout, apiMap), [apiMap]);
  const hallB = useMemo(() => mergeApiData(hallBLayout, apiMap), [apiMap]);

  const allBooths = useMemo(() => [...hallA.flat(), ...hallB.flat()], [hallA, hallB]);

  const densityCounts = useMemo(
    () =>
      allBooths.reduce((acc, b) => {
        acc[b.density] = (acc[b.density] ?? 0) + 1;
        return acc;
      }, {} as Record<Density, number>),
    [allBooths],
  );

  const totalVisitors = useMemo(
    () => allBooths.reduce((a, b) => a + (b.visitors ?? 0), 0),
    [allBooths],
  );

  const hotBooths = useMemo(
    () => allBooths.filter((b) => b.density === "tres-forte"),
    [allBooths],
  );

  const peakBooth = useMemo(
    () =>
      allBooths.reduce(
        (max, b) => ((b.visitors ?? 0) > (max?.visitors ?? 0) ? b : max),
        allBooths[0],
      ),
    [allBooths],
  );

  function handleRefresh() {
    refetch();
    setLastUpdated(new Date());
    if (selectedBooth) {
      // Re-sync selected booth in case data changed
      const updated = allBooths.find((b) => b.id === selectedBooth.id);
      if (updated) setSelectedBooth(updated);
    }
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Suivi en Temps Réel</p>
          <h1 className="font-display text-xl font-semibold text-foreground mt-0.5">Plan du Salon</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Densité de trafic en temps réel · Mise à jour : {formatTime(lastUpdated)}
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
          { label: "Visiteurs présents", value: totalVisitors.toLocaleString("fr-FR"), icon: Users, tone: "primary" },
          { label: "Stands très actifs", value: hotBooths.length.toString(), icon: Activity, tone: "rose" },
          { label: "Pic d'affluence", value: peakBooth ? `Stand ${peakBooth.id}` : "—", icon: TrendingUp, tone: "amber" },
          { label: "Stands occupés", value: `${allBooths.length}/64`, icon: MapPin, tone: "green" },
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
        {(["faible", "moyenne", "forte", "tres-forte"] as Density[]).map((d) => {
          const cfg = densityConfig[d];
          return (
            <div key={d} className="flex items-center gap-1.5">
              <span className={cn("h-3.5 w-3.5 rounded-sm border", cfg.bg, cfg.border)} />
              <span className="text-xs text-muted-foreground">{cfg.label}</span>
              <span className="text-[10px] text-muted-foreground/60">({densityCounts[d] ?? 0})</span>
            </div>
          );
        })}
      </div>

      {/* Floor plan grid */}
      <div className={cn(
        "rounded-xl border border-border bg-card p-4 space-y-4 overflow-x-auto transition-opacity",
        isLoading && "opacity-60 pointer-events-none",
      )}>
        {isLoading && (
          <div className="flex items-center justify-center gap-2 py-2 text-sm text-muted-foreground">
            <RefreshCw className="h-4 w-4 animate-spin" />
            Chargement des stands…
          </div>
        )}

        {/* Entrance */}
        <div className="flex justify-center">
          <SpecialZone label="Entrée Principale" icon={MapPin} className="w-40 h-10" />
        </div>

        {/* Hall A */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-bold text-foreground uppercase tracking-wider">Hall A</span>
            <div className="flex-1 h-px bg-border" />
          </div>
          <div className="space-y-1.5">
            {hallA.map((row, ri) => (
              <div key={ri} className="grid gap-1" style={{ gridTemplateColumns: `repeat(${row.length}, minmax(0, 1fr))` }}>
                {row.map((booth) => (
                  <BoothCell
                    key={booth.id}
                    booth={booth}
                    selected={selectedBooth?.id === booth.id}
                    onClick={() => setSelectedBooth(selectedBooth?.id === booth.id ? null : booth)}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Corridor + special zones */}
        <div className="grid grid-cols-3 gap-2 py-1">
          <SpecialZone label="Espace Conférences" icon={Users} className="h-12" />
          <SpecialZone label="Scène Principale" icon={Activity} className="h-12" />
          <SpecialZone label="Food Court" icon={MapPin} className="h-12" />
        </div>

        {/* Hall B */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-bold text-foreground uppercase tracking-wider">Hall B</span>
            <div className="flex-1 h-px bg-border" />
          </div>
          <div className="space-y-1.5">
            {hallB.map((row, ri) => (
              <div key={ri} className="grid gap-1" style={{ gridTemplateColumns: `repeat(${row.length}, minmax(0, 1fr))` }}>
                {row.map((booth) => (
                  <BoothCell
                    key={booth.id}
                    booth={booth}
                    selected={selectedBooth?.id === booth.id}
                    onClick={() => setSelectedBooth(selectedBooth?.id === booth.id ? null : booth)}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Selected booth detail */}
      {selectedBooth && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 flex items-center gap-4">
          <div className={cn(
            "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-sm font-bold",
            densityConfig[selectedBooth.density].bg,
            densityConfig[selectedBooth.density].text,
          )}>
            {selectedBooth.id}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-foreground">{selectedBooth.exhibitor ?? "Stand libre"}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {selectedBooth.id} · Densité : {densityConfig[selectedBooth.density].label} · {selectedBooth.visitors ?? 0} visiteurs actifs
            </p>
          </div>
          <span className={cn(
            "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold border",
            densityConfig[selectedBooth.density].bg,
            densityConfig[selectedBooth.density].text,
            densityConfig[selectedBooth.density].border,
          )}>
            {densityConfig[selectedBooth.density].label}
          </span>
          <button
            onClick={() => setSelectedBooth(null)}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
