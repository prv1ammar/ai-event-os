import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Settings2, Printer, Download, Pencil, CheckCircle2,
  Users, Crown, Newspaper, Building2, ShieldCheck, X, Save,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useEvent } from "@/lib/event-context";
import { apiRequest } from "@/lib/api";

export const Route = createFileRoute("/badges")({
  component: BadgesPage,
  head: () => ({
    meta: [{ title: "Badges & QR — Gestion des types" }],
  }),
});

// ─── Types ────────────────────────────────────────────────────────────────────
interface Badge {
  id: number;
  qr_code?: string;
  badge_number?: string;
  print_status?: string;   // not_printed | printed | reprinted
  pickup_status?: string;  // pending | picked_up | lost
  visiteurs_id?: number | null;
  exposants_id?: number | null;
  vip_id?: number | null;
  staff_id?: number | null;
  sponsors_id?: number | null;
  partenaires_id?: number | null;
  [key: string]: unknown;
}

interface BadgeTypeConfig {
  key: string;           // matches the FK column on the badges table
  label: string;
  labelFr: string;
  icon: React.ElementType;
  headerBg: string;
  accentText: string;
  accentBg: string;
  accessZones: string[];
  description: string;
  active: boolean;
}

// ─── Badge categories (one per participant table) ─────────────────────────────
const DEFAULT_TYPES: BadgeTypeConfig[] = [
  {
    key: "visiteurs_id",
    label: "VISITEUR",
    labelFr: "Visiteur",
    icon: Users,
    headerBg: "bg-sky-600",
    accentText: "text-sky-600",
    accentBg: "bg-sky-500/10",
    accessZones: ["Hall principal", "Conférences publiques", "Zone exposants"],
    description: "Accès standard aux zones publiques de l'événement.",
    active: true,
  },
  {
    key: "vip_id",
    label: "VIP",
    labelFr: "VIP",
    icon: Crown,
    headerBg: "bg-gradient-to-br from-purple-600 to-indigo-600",
    accentText: "text-purple-600",
    accentBg: "bg-purple-500/10",
    accessZones: ["Hall principal", "Conférences publiques", "Zone exposants", "Lounge VIP", "Dîner de gala"],
    description: "Accès prioritaire à toutes les zones dont le lounge VIP et les événements privés.",
    active: true,
  },
  {
    key: "exposants_id",
    label: "EXPOSANT",
    labelFr: "Exposant",
    icon: Building2,
    headerBg: "bg-emerald-600",
    accentText: "text-emerald-600",
    accentBg: "bg-emerald-500/10",
    accessZones: ["Hall principal", "Zone exposants", "Montage/démontage", "Réunions B2B"],
    description: "Accès exposant avec droits de montage, réunions B2B et zone d'exposition.",
    active: true,
  },
  {
    key: "sponsors_id",
    label: "SPONSOR",
    labelFr: "Sponsor",
    icon: Newspaper,
    headerBg: "bg-amber-500",
    accentText: "text-amber-600",
    accentBg: "bg-amber-500/10",
    accessZones: ["Hall principal", "Zone exposants", "Lounge VIP", "Espace sponsors"],
    description: "Accès sponsor avec visibilité renforcée et espaces partenaires.",
    active: true,
  },
  {
    key: "partenaires_id",
    label: "PARTENAIRE",
    labelFr: "Partenaire",
    icon: Building2,
    headerBg: "bg-indigo-600",
    accentText: "text-indigo-600",
    accentBg: "bg-indigo-500/10",
    accessZones: ["Hall principal", "Zone exposants", "Espace partenaires", "Réunions B2B"],
    description: "Accès partenaire officiel : grands espaces et privilèges dédiés.",
    active: true,
  },
  {
    key: "staff_id",
    label: "STAFF",
    labelFr: "Staff",
    icon: ShieldCheck,
    headerBg: "bg-red-600",
    accentText: "text-red-600",
    accentBg: "bg-red-500/10",
    accessZones: ["Accès total", "Backstage", "Salle de contrôle", "Tous les espaces"],
    description: "Accès complet à toutes les zones de l'événement.",
    active: true,
  },
];

// ─── Fetchers ─────────────────────────────────────────────────────────────────
async function fetchBadges(): Promise<Badge[]> {
  const raw = await apiRequest<Badge[] | { list: Badge[] }>("/api/v1/badges?limit=500");
  return Array.isArray(raw) ? raw : (raw.list ?? []);
}

// ─── Badge preview card ───────────────────────────────────────────────────────
function BadgePreview({ type, eventName }: { type: BadgeTypeConfig; eventName: string }) {
  return (
    <div className="rounded-xl overflow-hidden bg-white border border-border shadow-sm w-32 shrink-0">
      <div className={cn("px-2 py-2 text-center text-white", type.headerBg)}>
        <p className="text-[8px] font-bold tracking-widest uppercase opacity-80">AI EVENT OS</p>
        <p className="text-[9px] font-bold tracking-wider uppercase">{type.label}</p>
      </div>
      <div className="px-2 py-3 flex flex-col items-center gap-1.5">
        <div className={cn("h-8 w-8 rounded-full flex items-center justify-center", type.accentBg)}>
          <type.icon className={cn("h-4 w-4", type.accentText)} />
        </div>
        <div className="text-center">
          <p className="text-[9px] font-bold text-gray-800">Prénom Nom</p>
          <p className="text-[8px] text-gray-400">Société</p>
        </div>
        {/* Mock QR */}
        <div className={cn("p-1 rounded", type.accentBg)}>
          <svg width="28" height="28" viewBox="0 0 7 7" className={type.accentText}>
            {[[0,0],[0,1],[0,2],[1,0],[2,0],[2,1],[2,2],[0,4],[0,5],[0,6],[1,6],[2,4],[2,5],[2,6],
              [4,0],[4,1],[4,2],[5,0],[6,0],[6,1],[6,2],[4,4],[4,6],[5,5],[6,4],[6,5],[6,6],
              [3,3]].map(([r,c], i) => (
              <rect key={i} x={c} y={r} width="1" height="1" fill="currentColor" />
            ))}
          </svg>
        </div>
        <p className="font-mono text-[7px] text-gray-300 tracking-widest">0001</p>
        <div className="w-full bg-gray-50 rounded px-1 py-0.5 text-center">
          <p className="text-[7px] text-gray-500 truncate">{eventName}</p>
        </div>
      </div>
      <div className={cn("px-2 py-1 text-center", type.accentBg)}>
        <p className={cn("text-[7px] font-semibold uppercase tracking-wider", type.accentText)}>Accès autorisé</p>
      </div>
    </div>
  );
}

// ─── Edit Sheet ───────────────────────────────────────────────────────────────
function EditTypeSheet({ type, onClose }: { type: BadgeTypeConfig; onClose: () => void }) {
  const { activeEvent } = useEvent();
  const [zones, setZones] = useState(type.accessZones.join(", "));
  const [desc, setDesc] = useState(type.description);

  return (
    <Sheet open onOpenChange={onClose}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader className="mb-6">
          <SheetTitle>Configurer — {type.labelFr}</SheetTitle>
          <SheetDescription>Options du badge {type.labelFr.toLowerCase()}</SheetDescription>
        </SheetHeader>

        <div className="space-y-6">
          {/* Preview */}
          <div className="flex items-center justify-center">
            <BadgePreview type={type} eventName={activeEvent.shortName ?? activeEvent.name} />
          </div>

          {/* Config fields */}
          <div className="space-y-4">
            <div className="grid gap-1.5">
              <Label>Libellé du badge</Label>
              <Input defaultValue={type.labelFr} className="bg-muted/40" />
            </div>
            <div className="grid gap-1.5">
              <Label>Description</Label>
              <textarea value={desc} onChange={(e) => setDesc(e.target.value)}
                className="w-full rounded-md border border-input bg-muted/40 px-3 py-2 text-sm resize-none h-20 focus:outline-none focus:ring-1 focus:ring-ring" />
            </div>
            <div className="grid gap-1.5">
              <Label>Zones d'accès autorisées</Label>
              <Input value={zones} onChange={(e) => setZones(e.target.value)}
                placeholder="Hall principal, Lounge VIP, …" className="bg-muted/40" />
              <p className="text-xs text-muted-foreground">Séparées par des virgules</p>
            </div>
          </div>

          <div className="flex gap-2 pt-2 border-t border-border">
            <Button variant="outline" className="flex-1" onClick={onClose}>
              <X className="h-4 w-4" /> Annuler
            </Button>
            <Button className="flex-1 bg-gradient-primary text-primary-foreground" onClick={onClose}>
              <Save className="h-4 w-4" /> Enregistrer
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─── Type Card ────────────────────────────────────────────────────────────────
function TypeCard({ type, count, printed, onEdit }: {
  type: BadgeTypeConfig;
  count: number;
  printed: number;
  onEdit: () => void;
}) {
  const pct = count > 0 ? Math.round((printed / count) * 100) : 0;

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden hover:shadow-md transition-shadow">
      {/* Colored top stripe */}
      <div className={cn("h-1.5 w-full", type.headerBg)} />

      <div className="p-5 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center", type.accentBg)}>
              <type.icon className={cn("h-5 w-5", type.accentText)} />
            </div>
            <div>
              <p className="font-semibold text-foreground">{type.labelFr}</p>
              <p className="text-xs text-muted-foreground">{type.description.slice(0, 50)}…</p>
            </div>
          </div>
          <button onClick={onEdit}
            className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
            <Pencil className="h-4 w-4" />
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-muted/40 px-3 py-2">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Badges</p>
            <p className="text-xl font-bold text-foreground tabular-nums">{count}</p>
          </div>
          <div className="rounded-lg bg-muted/40 px-3 py-2">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Imprimés</p>
            <p className="text-xl font-bold text-foreground tabular-nums">{printed}</p>
          </div>
        </div>

        {/* Progress */}
        <div>
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
            <span>Progression</span>
            <span>{pct}%</span>
          </div>
          <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
            <div className={cn("h-full rounded-full transition-all duration-700", type.headerBg)}
              style={{ width: `${pct}%` }} />
          </div>
        </div>

        {/* Access zones */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Zones d'accès</p>
          <div className="flex flex-wrap gap-1">
            {type.accessZones.map((z) => (
              <span key={z} className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", type.accentBg, type.accentText)}>
                {z}
              </span>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <Button variant="outline" size="sm" className="flex-1 h-8 text-xs">
            <Printer className="h-3.5 w-3.5" /> Imprimer tout
          </Button>
          <Button variant="outline" size="sm" className="flex-1 h-8 text-xs">
            <Download className="h-3.5 w-3.5" /> Export PDF
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
function BadgesPage() {
  const [editType, setEditType] = useState<BadgeTypeConfig | null>(null);

  const { data: badges = [], isLoading } = useQuery({
    queryKey: ["badges"],
    queryFn: fetchBadges,
    staleTime: 60_000,
  });

  // Count badges per participant category (FK column set on the badge)
  const countByType = (key: string) =>
    badges.filter((b) => b[key] != null).length;

  const printedByType = (key: string) =>
    badges.filter((b) => b[key] != null && ["printed", "reprinted"].includes(b.print_status ?? "")).length;

  const totalBadges = badges.length;
  const totalPrinted = badges.filter((b) => ["printed", "reprinted"].includes(b.print_status ?? "")).length;
  const totalPickedUp = badges.filter((b) => b.pickup_status === "picked_up").length;

  return (
    <div className="p-6 md:p-8 space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Accréditation</p>
          <h1 className="font-display text-2xl font-semibold text-foreground mt-0.5">Gestion des types de badges</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Configurez les templates, accès et options d'impression par type de badge.
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Les badges individuels sont accessibles depuis le profil de chaque visiteur ou exposant.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-9">
            <Settings2 className="h-4 w-4" /> Paramètres globaux
          </Button>
          <Button size="sm" className="h-9 bg-gradient-primary text-primary-foreground shadow-glow-sm">
            <Printer className="h-4 w-4" /> Impression en lot
          </Button>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: "Types actifs", value: DEFAULT_TYPES.filter((t) => t.active).length, color: "bg-primary/10 text-primary" },
          { label: "Badges générés", value: isLoading ? "…" : totalBadges, color: "bg-sky-500/10 text-sky-600" },
          { label: "Imprimés", value: isLoading ? "…" : totalPrinted, color: "bg-emerald-500/10 text-emerald-600" },
          { label: "Retirés sur site", value: isLoading ? "…" : totalPickedUp, color: "bg-amber-500/10 text-amber-600" },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-border bg-card p-4">
            <div className={cn("inline-flex h-8 w-8 items-center justify-center rounded-lg mb-3 text-sm font-bold", s.color)}>
              {typeof s.value === "number" ? s.value : s.value}
            </div>
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <p className="text-2xl font-bold text-foreground tracking-tight mt-1">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Badge type cards */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Types de badges</h2>
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            <span className="text-xs text-muted-foreground">{DEFAULT_TYPES.length} types configurés</span>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {DEFAULT_TYPES.map((type) => (
            <TypeCard
              key={type.key}
              type={type}
              count={countByType(type.key)}
              printed={printedByType(type.key)}
              onEdit={() => setEditType(type)}
            />
          ))}
        </div>
      </div>

      {/* How to section */}
      <div className="rounded-xl border border-border bg-muted/30 p-5">
        <h3 className="font-semibold text-foreground mb-2">Comment accéder aux badges individuels ?</h3>
        <ul className="space-y-1.5 text-sm text-muted-foreground">
          <li className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
            <span><strong className="text-foreground">Visiteurs :</strong> allez dans Visiteurs → cliquez sur l'icône œil d'un visiteur → section "Badge d'accès"</span>
          </li>
          <li className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
            <span><strong className="text-foreground">Exposants :</strong> allez dans Exposants → cliquez sur l'icône œil d'un exposant → section "Badge d'accès"</span>
          </li>
          <li className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
            <span><strong className="text-foreground">Scanner :</strong> utilisez la page "Scanner QR" pour valider les badges à l'entrée</span>
          </li>
        </ul>
      </div>

      {editType && <EditTypeSheet type={editType} onClose={() => setEditType(null)} />}
    </div>
  );
}
