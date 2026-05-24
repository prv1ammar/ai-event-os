import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Download,
  Printer,
  Search,
  Filter,
  Plus,
  Settings2,
  QrCode,
  CheckCircle2,
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

interface Badge {
  id: number;
  badge_type?: string;
  visitor_type?: string;
  type?: string;
  printed?: boolean;
  status?: string;
  [key: string]: unknown;
}

async function fetchBadges(): Promise<Badge[]> {
  const raw = await apiRequest<Badge[] | { list: Badge[] }>("/api/v1/data/badges");
  return Array.isArray(raw) ? raw : raw.list;
}

type BadgeType = "VISITEUR" | "VIP" | "PRESSE" | "EXPOSANT" | "ORGANISATEUR";

const badgeTemplates: {
  type: BadgeType;
  accent: string;
  accentText: string;
  accentBg: string;
  headerBg: string;
  headerText: string;
  count: number;
  printed: number;
}[] = [
  {
    type: "VISITEUR",
    accent: "oklch(0.55 0.24 240)",
    accentText: "text-sky-600",
    accentBg: "bg-sky-500/10",
    headerBg: "bg-sky-600",
    headerText: "text-white",
    count: 3456,
    printed: 2210,
  },
  {
    type: "VIP",
    accent: "oklch(0.55 0.24 280)",
    accentText: "text-purple-600",
    accentBg: "bg-purple-500/10",
    headerBg: "bg-gradient-to-br from-purple-600 to-indigo-600",
    headerText: "text-white",
    count: 186,
    printed: 186,
  },
  {
    type: "PRESSE",
    accent: "oklch(0.7 0.22 50)",
    accentText: "text-orange-600",
    accentBg: "bg-orange-500/10",
    headerBg: "bg-orange-500",
    headerText: "text-white",
    count: 54,
    printed: 40,
  },
  {
    type: "EXPOSANT",
    accent: "oklch(0.65 0.2 152)",
    accentText: "text-emerald-600",
    accentBg: "bg-emerald-500/10",
    headerBg: "bg-emerald-600",
    headerText: "text-white",
    count: 243,
    printed: 243,
  },
  {
    type: "ORGANISATEUR",
    accent: "oklch(0.6 0.22 22)",
    accentText: "text-red-600",
    accentBg: "bg-red-500/10",
    headerBg: "bg-red-600",
    headerText: "text-white",
    count: 28,
    printed: 28,
  },
];

function Barcode({ value, width = 120, height = 32 }: { value: string; width?: number; height?: number }) {
  const bars: { x: number; w: number; filled: boolean }[] = [];
  let x = 0;
  const totalWidth = width;
  const avgBarWidth = totalWidth / 60;

  for (let i = 0; i < 50; i++) {
    const charCode = value.charCodeAt(i % value.length);
    const w = Math.max(1, ((charCode * (i + 1) * 13) % 3) + 1) * avgBarWidth;
    const filled = (charCode + i) % 3 !== 0;
    bars.push({ x, w, filled });
    x += w + avgBarWidth * 0.3;
    if (x > totalWidth) break;
  }

  const scale = totalWidth / x;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      {bars.map((b, i) =>
        b.filled ? (
          <rect
            key={i}
            x={b.x * scale}
            y={0}
            width={Math.max(1, b.w * scale - 0.5)}
            height={height}
            fill="currentColor"
          />
        ) : null,
      )}
    </svg>
  );
}

function MockQR({ size = 64 }: { size?: number }) {
  const n = 7;
  const cell = size / n;
  const pattern = [
    [1, 1, 1, 1, 1, 1, 1],
    [1, 0, 0, 0, 0, 0, 1],
    [1, 0, 1, 1, 1, 0, 1],
    [1, 0, 1, 0, 1, 0, 1],
    [1, 0, 1, 1, 1, 0, 1],
    [1, 0, 0, 0, 0, 0, 1],
    [1, 1, 1, 1, 1, 1, 1],
  ];
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {pattern.map((row, r) =>
        row.map((c, col) =>
          c ? (
            <rect key={`${r}-${col}`} x={col * cell + 0.5} y={r * cell + 0.5} width={cell - 1} height={cell - 1} fill="currentColor" />
          ) : null,
        ),
      )}
    </svg>
  );
}

function BadgeCard({ template, active, onClick }: {
  template: (typeof badgeTemplates)[number];
  active: boolean;
  onClick: () => void;
}) {
  const { activeEvent } = useEvent();
  return (
    <div
      onClick={onClick}
      className={cn(
        "cursor-pointer rounded-2xl border-2 transition-all duration-200",
        active ? "border-primary shadow-glow-sm scale-[1.02]" : "border-border hover:border-primary/40 hover:shadow-card",
      )}
    >
      {/* Badge card */}
      <div className="rounded-[14px] overflow-hidden bg-white shadow-card w-full">
        {/* Header */}
        <div className={cn("px-4 py-3 text-center", template.headerBg, template.headerText)}>
          <p className="text-[10px] font-bold tracking-[0.22em] uppercase opacity-80">AI EVENT OS</p>
          <p className="font-display text-xs font-bold tracking-wider mt-0.5 uppercase">{template.type}</p>
        </div>

        {/* Body */}
        <div className="px-4 py-4 flex flex-col items-center gap-3">
          {/* Avatar placeholder */}
          <div
            className={cn("h-14 w-14 rounded-full flex items-center justify-center text-lg font-bold ring-2 ring-offset-2", template.accentBg)}
            style={{ ringColor: template.accent }}
          >
            <span className={template.accentText}>NN</span>
          </div>

          {/* Meta */}
          <div className="text-center">
            <p className="font-display text-sm font-bold text-gray-900">Prénom Nom</p>
            <p className="text-xs text-gray-500 mt-0.5">Société / Organisation</p>
            <p className="text-[10px] text-gray-400 mt-0.5">Fonction / Titre</p>
          </div>

          {/* QR for VIP, barcode for others */}
          <div className={cn("p-2 rounded-lg", template.accentBg)}>
            {template.type === "VIP" ? (
              <div className={template.accentText}>
                <MockQR size={60} />
              </div>
            ) : (
              <div className={cn("flex flex-col items-center gap-1", template.accentText)}>
                <Barcode value={template.type} width={100} height={28} />
                <p className="font-mono text-[9px] tracking-widest opacity-70">
                  {template.type.slice(0, 3)}-00001
                </p>
              </div>
            )}
          </div>

          {/* Event info */}
          <div className="w-full rounded-md bg-gray-50 px-3 py-2 text-center">
            <p className="text-[10px] font-semibold text-gray-700 leading-tight truncate">{activeEvent.shortName}</p>
            <p className="text-[9px] text-gray-400 mt-0.5">{activeEvent.dates}</p>
            <p className="text-[9px] text-gray-400 truncate">Casablanca · Maroc</p>
          </div>
        </div>

        {/* Footer */}
        <div className={cn("px-4 py-2 text-center", template.accentBg)}>
          <p className={cn("text-[9px] font-semibold uppercase tracking-wider", template.accentText)}>Accès autorisé</p>
        </div>
      </div>

      {/* Stats below */}
      <div className="px-3 py-2 flex items-center justify-between text-xs">
        <span className="text-muted-foreground">
          <span className="font-semibold text-foreground">{template.printed.toLocaleString("fr-FR")}</span> / {template.count.toLocaleString("fr-FR")} imprimés
        </span>
        <span className={cn(
          "rounded-full px-2 py-0.5 text-[10px] font-medium",
          template.printed === template.count
            ? "bg-success/10 text-success"
            : "bg-warning/10 text-warning",
        )}>
          {template.printed === template.count ? "Complet" : "En cours"}
        </span>
      </div>
    </div>
  );
}

function BadgesPage() {
  const [activeTemplate, setActiveTemplate] = useState<BadgeType>("VISITEUR");
  const [searchVal, setSearchVal] = useState("");

  const { data: badges = [] } = useQuery({
    queryKey: ["badges"],
    queryFn: fetchBadges,
  });

  const totalBadges = badges.length > 0 ? badges.length : badgeTemplates.reduce((a, b) => a + b.count, 0);
  const totalPrinted = badges.length > 0
    ? badges.filter((b) => b.status === "active").length
    : badgeTemplates.reduce((a, b) => a + b.printed, 0);

  // Map template types to actual badge_type values in the API
  const TYPE_MAP: Record<BadgeType, string[]> = {
    VISITEUR: ["visitor"],
    VIP: ["vip"],
    PRESSE: ["press"],
    EXPOSANT: ["exhibitor"],
    ORGANISATEUR: ["staff", "speaker"],
  };

  const enrichedTemplates = badgeTemplates.map((t) => {
    if (badges.length === 0) return t;
    const validTypes = TYPE_MAP[t.type];
    const matching = badges.filter((b) =>
      validTypes.includes((b.badge_type ?? "").toLowerCase())
    );
    return {
      ...t,
      count: matching.length > 0 ? matching.length : t.count,
      printed: matching.filter((b) => b.status === "active").length,
    };
  });

  return (
    <div className="p-6 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Accréditation</p>
          <h1 className="font-display text-2xl font-semibold text-foreground mt-0.5">Badges & QR Codes</h1>
          <p className="text-sm text-muted-foreground mt-1">Générateur de badges par type d'accès</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-9">
            <Settings2 className="h-4 w-4" />
            Personnaliser
          </Button>
          <Button variant="outline" size="sm" className="h-9">
            <Printer className="h-4 w-4" />
            Impression lot
          </Button>
          <Button size="sm" className="h-9 bg-gradient-primary text-primary-foreground shadow-glow-sm">
            <Download className="h-4 w-4" />
            Exporter tout
          </Button>
        </div>
      </div>

      {/* Stats ribbon */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: "Total badges", value: totalBadges.toLocaleString("fr-FR"), icon: QrCode, tone: "primary" },
          { label: "Imprimés", value: totalPrinted.toLocaleString("fr-FR"), icon: Printer, tone: "green" },
          { label: "En attente", value: (totalBadges - totalPrinted).toLocaleString("fr-FR"), icon: CheckCircle2, tone: "amber" },
          { label: "Templates actifs", value: String(badgeTemplates.length), icon: Filter, tone: "blue" },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-border bg-card p-4">
            <div className={cn(
              "flex h-9 w-9 items-center justify-center rounded-lg mb-3",
              s.tone === "primary" && "bg-primary/10 text-primary",
              s.tone === "green" && "bg-success/10 text-success",
              s.tone === "amber" && "bg-warning/10 text-warning",
              s.tone === "blue" && "bg-info/10 text-info",
            )}>
              <s.icon className="h-4 w-4" />
            </div>
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <p className="text-2xl font-bold text-foreground tracking-tight tabular-nums mt-1">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Search + filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Rechercher un participant..."
            value={searchVal}
            onChange={(e) => setSearchVal(e.target.value)}
            className="h-9 pl-9 bg-card"
          />
        </div>
        <Button variant="outline" size="sm" className="h-9 bg-card">
          <Plus className="h-4 w-4" />
          Générer badge
        </Button>
      </div>

      {/* Badge gallery */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground mb-4">Templates de badges</p>
        <div className="grid grid-cols-2 gap-5 md:grid-cols-3 lg:grid-cols-5">
          {enrichedTemplates.map((t) => (
            <BadgeCard
              key={t.type}
              template={t}
              active={activeTemplate === t.type}
              onClick={() => setActiveTemplate(t.type)}
            />
          ))}
        </div>
      </div>

      {/* Selected type stats */}
      {(() => {
        const t = enrichedTemplates.find((x) => x.type === activeTemplate)!;
        const pct = Math.round((t.printed / t.count) * 100);
        return (
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display text-base font-semibold text-foreground">
                Statut impression — {activeTemplate}
              </h3>
              <span className="text-xs text-muted-foreground">{pct}% complété</span>
            </div>
            <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-primary transition-all duration-700"
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
              <span>{t.printed.toLocaleString("fr-FR")} imprimés</span>
              <span>{(t.count - t.printed).toLocaleString("fr-FR")} restants</span>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
