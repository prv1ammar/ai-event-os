import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus, Pencil, Trash2, ArrowLeft, Loader2, AlertCircle, Map, Layers, ChevronRight, DoorOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { apiRequest, smartDbRequest } from "@/lib/api";

export const Route = createFileRoute("/floor-plan")({
  component: FloorPlanPage,
  head: () => ({
    meta: [{ title: "Plan du Salon — AI EVENT OS" }],
  }),
});

// ─── Types ────────────────────────────────────────────────────────────────────
interface Venue { id: number; name: string; city?: string; events_id?: number; [key: string]: unknown }

interface Zone {
  id: number;
  name: string;
  zone_type?: string;
  capacity?: string | number;
  surface_sqm?: string | number;
  floor_level?: string;
  venues_id?: number;
  logistics_zones_id?: number | null;
  pos_x?: string | number | null;
  pos_y?: string | number | null;
  sub_zones?: Array<{ id: number; name?: string }>;
  "commercial spaces"?: Array<{ id: number; name?: string }>;
  [key: string]: unknown;
}

interface Stand {
  id: number;
  name: string;
  code?: string;
  space_type?: string;
  surface_sqm?: string | number;
  price?: string | number;
  status?: string;
  logistics_zones_id?: number;
  pos_x?: string | number | null;
  pos_y?: string | number | null;
  [key: string]: unknown;
}

type CanvasItem = { kind: "zone"; data: Zone } | { kind: "stand"; data: Stand };

// ─── Labels ───────────────────────────────────────────────────────────────────
const ZONE_TYPE_LABELS: Record<string, string> = {
  hall: "Hall", bloc: "Bloc", salle_conference: "Salle de conférence",
  restaurant: "Restaurant", zone_exterieure: "Zone extérieure",
  espace_accueil: "Espace accueil", autre: "Autre",
};
const SPACE_TYPE_LABELS: Record<string, string> = {
  stand: "Stand", espace_sponsoring: "Espace sponsoring", kiosque: "Kiosque",
  espace_networking: "Espace networking", autre: "Autre",
};
const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; border: string }> = {
  disponible: { label: "Disponible", bg: "bg-emerald-500/15", text: "text-emerald-700", border: "border-emerald-400/40" },
  "réservé":  { label: "Réservé",    bg: "bg-amber-400/15",   text: "text-amber-700",   border: "border-amber-400/40" },
  "occupé":   { label: "Occupé",     bg: "bg-red-500/20",     text: "text-red-700",     border: "border-red-400/50" },
  "bloqué":   { label: "Bloqué",     bg: "bg-muted",           text: "text-muted-foreground", border: "border-border" },
};
const ZONE_STYLE = { bg: "bg-indigo-500/10", text: "text-indigo-700", border: "border-indigo-400/50" };
function statusConf(s?: string) {
  return STATUS_CONFIG[s ?? ""] ?? STATUS_CONFIG.disponible;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function num(v: string | number | null | undefined): number {
  const n = Number(v ?? 0);
  return isNaN(n) ? 0 : n;
}
function fmtMAD(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M MAD`;
  if (v >= 1_000) return `${Math.round(v / 1_000)}K MAD`;
  return `${v} MAD`;
}
function boxSideM(surfaceSqm: string | number | null | undefined): number {
  return Math.sqrt(Math.max(1, num(surfaceSqm)));
}

// ─── API ─────────────────────────────────────────────────────────────────────
async function fetchVenues(): Promise<Venue[]> {
  const raw = await apiRequest<Venue[] | { list: Venue[] }>("/api/v1/venues?limit=100");
  return Array.isArray(raw) ? raw : (raw.list ?? []);
}
async function fetchRootZones(venueId: number): Promise<Zone[]> {
  const raw = await apiRequest<Zone[] | { list: Zone[] }>(`/api/v1/logistics-zones?venue_id=${venueId}&limit=200`);
  const list = Array.isArray(raw) ? raw : (raw.list ?? []);
  return list.filter((z) => z.logistics_zones_id == null);
}
async function fetchSubZones(parentId: number): Promise<Zone[]> {
  const raw = await apiRequest<Zone[] | { list: Zone[] }>(`/api/v1/logistics-zones?parent_id=${parentId}&limit=200`);
  return Array.isArray(raw) ? raw : (raw.list ?? []);
}
async function fetchStands(zoneId: number): Promise<Stand[]> {
  const raw = await apiRequest<Stand[] | { list: Stand[] }>(`/api/v1/booths?logistics_zones_id=${zoneId}&limit=200`);
  return Array.isArray(raw) ? raw : (raw.list ?? []);
}

async function createZone(data: Partial<Zone>): Promise<Zone> {
  return smartDbRequest("logistics-zones", "POST", data as Record<string, unknown>) as Promise<Zone>;
}
async function updateZone({ id, data }: { id: number; data: Partial<Zone> }): Promise<void> {
  await smartDbRequest("logistics-zones", "PATCH", { id, ...data });
}
async function deleteZone(id: number): Promise<void> {
  await smartDbRequest("logistics-zones", "DELETE", { id });
}
async function createStand(data: Partial<Stand>): Promise<Stand> {
  return smartDbRequest("booths", "POST", data as Record<string, unknown>) as Promise<Stand>;
}
async function updateStand({ id, data }: { id: number; data: Partial<Stand> }): Promise<void> {
  await smartDbRequest("booths", "PATCH", { id, ...data });
}
async function deleteStand(id: number): Promise<void> {
  await smartDbRequest("booths", "DELETE", { id });
}

// ─── Draggable plan item ──────────────────────────────────────────────────────
function PlanItemBox({
  x, y, size, label, sublabel, bgClass, borderClass, textClass, icon, selected, onSelect, onDragEnd, onOpen,
}: {
  x: number; y: number; size: number; label: string; sublabel?: string;
  bgClass: string; borderClass: string; textClass: string; icon?: React.ReactNode; selected: boolean;
  onSelect: () => void;
  onDragEnd: (dxPx: number, dyPx: number) => void;
  onOpen?: () => void;
}) {
  const [drag, setDrag] = useState<{ dx: number; dy: number } | null>(null);
  const startRef = useRef<{ x: number; y: number; moved: boolean } | null>(null);

  function handleMouseDown(e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    startRef.current = { x: e.clientX, y: e.clientY, moved: false };

    function handleMouseMove(ev: MouseEvent) {
      const s = startRef.current;
      if (!s) return;
      const dx = ev.clientX - s.x;
      const dy = ev.clientY - s.y;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) s.moved = true;
      setDrag({ dx, dy });
    }
    function handleMouseUp(ev: MouseEvent) {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      const s = startRef.current;
      startRef.current = null;
      setDrag(null);
      if (!s) return;
      if (s.moved) {
        onDragEnd(ev.clientX - s.x, ev.clientY - s.y);
      } else {
        onSelect();
      }
    }
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  }

  return (
    <div
      onMouseDown={handleMouseDown}
      onDoubleClick={onOpen ? (e) => { e.stopPropagation(); onOpen(); } : undefined}
      title={onOpen ? "Glisser pour déplacer · double-clic pour ouvrir" : "Glisser pour déplacer"}
      className={cn(
        "absolute flex flex-col items-center justify-center rounded-md border-2 p-1 text-center select-none cursor-grab active:cursor-grabbing shadow-sm transition-shadow",
        bgClass, borderClass,
        selected && "ring-2 ring-primary ring-offset-1 z-20 shadow-glow-sm",
        drag && "z-30 shadow-lg",
      )}
      style={{
        left: x + (drag?.dx ?? 0),
        top: y + (drag?.dy ?? 0),
        width: size,
        height: size,
      }}
    >
      {icon && (
        <div
          className={cn("absolute -top-2 -right-2 rounded-full bg-card border p-0.5", borderClass, onOpen && "cursor-pointer hover:scale-110 transition-transform")}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={onOpen ? (e) => { e.stopPropagation(); onOpen(); } : undefined}
        >
          {icon}
        </div>
      )}
      <span className={cn("text-[10px] font-bold leading-tight truncate max-w-full px-0.5", textClass)}>{label}</span>
      {sublabel && size > 36 && (
        <span className={cn("text-[9px] opacity-75 truncate max-w-full px-0.5 leading-tight", textClass)}>{sublabel}</span>
      )}
    </div>
  );
}

// ─── Scale ruler ──────────────────────────────────────────────────────────────
function ScaleRuler({ ppm }: { ppm: number }) {
  const meters = ppm > 12 ? 5 : ppm > 4 ? 10 : 20;
  return (
    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
      <div className="relative h-2" style={{ width: meters * ppm }}>
        <div className="absolute inset-x-0 top-1/2 h-px bg-muted-foreground/60" />
        <div className="absolute left-0 top-0 h-2 w-px bg-muted-foreground/60" />
        <div className="absolute right-0 top-0 h-2 w-px bg-muted-foreground/60" />
      </div>
      <span>{meters} m</span>
    </div>
  );
}

// ─── Auto layout for items with no saved position ────────────────────────────
// Items with a saved pos_x/pos_y keep it as-is. Items without one are flowed
// into a grid that starts *below* every already-positioned item, so a fresh
// (never-dragged) item never lands on top of one the user has already placed.
function autoLayout<T extends { pos_x?: string | number | null; pos_y?: string | number | null; surface_sqm?: string | number }>(
  items: T[],
  maxRowM: number,
  gapM: number,
): Array<{ item: T; xM: number; yM: number }> {
  const positioned = items.filter((i) => i.pos_x != null && i.pos_y != null);
  const unpositioned = items.filter((i) => i.pos_x == null || i.pos_y == null);

  const out: Array<{ item: T; xM: number; yM: number }> = positioned.map((item) => ({
    item, xM: num(item.pos_x), yM: num(item.pos_y),
  }));

  let cursorX = 0;
  let cursorY = positioned.length > 0
    ? Math.max(...positioned.map((i) => num(i.pos_y) + boxSideM(i.surface_sqm))) + gapM
    : 0;
  let rowHeight = 0;
  for (const item of unpositioned) {
    const side = boxSideM(item.surface_sqm);
    if (cursorX > 0 && cursorX + side > maxRowM) {
      cursorX = 0;
      cursorY += rowHeight + gapM;
      rowHeight = 0;
    }
    out.push({ item, xM: cursorX, yM: cursorY });
    cursorX += side + gapM;
    rowHeight = Math.max(rowHeight, side);
  }
  return out;
}

function useCanvas(items: CanvasItem[], gapM: number, targetMaxPx: number) {
  const normalized = useMemo(
    () => items.map((ci) => ({ ci, surface_sqm: ci.data.surface_sqm, pos_x: ci.data.pos_x, pos_y: ci.data.pos_y })),
    [items],
  );
  const layout = useMemo(() => autoLayout(normalized, 60, gapM), [normalized, gapM]);
  const ppm = useMemo(() => {
    const maxSide = Math.max(1, ...normalized.map((n) => boxSideM(n.surface_sqm)));
    return Math.max(2, Math.min(targetMaxPx / maxSide, 60));
  }, [normalized, targetMaxPx]);
  const canvasW = Math.max(700, ...layout.map((l) => (l.xM + boxSideM(l.item.surface_sqm)) * ppm + 40));
  const canvasH = Math.max(400, ...layout.map((l) => (l.yM + boxSideM(l.item.surface_sqm)) * ppm + 40));
  return { layout, ppm, canvasW, canvasH };
}

// ─── Zone form ────────────────────────────────────────────────────────────────
function ZoneForm({ initial = {}, onSubmit, onCancel, loading }: {
  initial?: Partial<Zone>; onSubmit: (data: Partial<Zone>) => void; onCancel: () => void; loading: boolean;
}) {
  const [form, setForm] = useState<Partial<Zone>>({
    name: "", zone_type: "hall", capacity: "", surface_sqm: "", floor_level: "", ...initial,
  });
  function set(key: keyof Zone, value: unknown) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = { ...form };
    delete payload.venues; delete payload.logistics_zones; delete payload.sub_zones;
    delete payload["commercial spaces"]; delete payload.sessions; delete payload.scans;
    delete payload["b2b meetings"]; delete payload.staff;
    if (!payload.capacity) delete payload.capacity;
    if (!payload.floor_level) delete payload.floor_level;
    onSubmit(payload);
  }
  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 py-2">
      <div className="grid gap-1.5">
        <Label htmlFor="zname">Nom de la zone *</Label>
        <Input id="zname" required value={form.name ?? ""} onChange={(e) => set("name", e.target.value)} placeholder="Hall Principal A" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label>Type de zone</Label>
          <Select value={form.zone_type ?? "hall"} onValueChange={(v) => set("zone_type", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(ZONE_TYPE_LABELS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="zfloor">Étage / niveau</Label>
          <Input id="zfloor" value={form.floor_level ?? ""} onChange={(e) => set("floor_level", e.target.value)} placeholder="RDC" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="zsurface">Surface (m²) *</Label>
          <Input id="zsurface" type="number" min="0" step="0.01" required
            value={form.surface_sqm ?? ""} onChange={(e) => set("surface_sqm", e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="zcapacity">Capacité (personnes)</Label>
          <Input id="zcapacity" type="number" min="0" value={form.capacity ?? ""} onChange={(e) => set("capacity", e.target.value)} />
        </div>
      </div>
      <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
        <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>Annuler</Button>
        <Button type="submit" disabled={loading} className="bg-gradient-primary text-primary-foreground shadow-glow-sm">
          {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {initial.id ? "Enregistrer" : "Créer la zone"}
        </Button>
      </div>
    </form>
  );
}

// ─── Stand form ───────────────────────────────────────────────────────────────
function StandForm({ initial = {}, onSubmit, onCancel, loading }: {
  initial?: Partial<Stand>; onSubmit: (data: Partial<Stand>) => void; onCancel: () => void; loading: boolean;
}) {
  const [form, setForm] = useState<Partial<Stand>>({
    name: "", code: "", space_type: "stand", surface_sqm: "", price: "", status: "disponible", ...initial,
  });
  function set(key: keyof Stand, value: unknown) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = { ...form };
    delete payload.logistics_zones; delete payload.staff; delete payload["org stands"];
    delete payload["org stands - stand_label"]; delete payload["org stands stand_label"];
    if (!payload.code) delete payload.code;
    if (!payload.price) delete payload.price;
    onSubmit(payload);
  }
  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 py-2">
      <div className="grid gap-1.5">
        <Label htmlFor="sname">Nom *</Label>
        <Input id="sname" required value={form.name ?? ""} onChange={(e) => set("name", e.target.value)} placeholder="Stand Atlas Cloud" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="scode">Code</Label>
          <Input id="scode" value={form.code ?? ""} onChange={(e) => set("code", e.target.value)} placeholder="STD-A01" />
        </div>
        <div className="grid gap-1.5">
          <Label>Type</Label>
          <Select value={form.space_type ?? "stand"} onValueChange={(v) => set("space_type", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(SPACE_TYPE_LABELS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="ssurface">Surface (m²) *</Label>
          <Input id="ssurface" type="number" min="0" step="0.01" required
            value={form.surface_sqm ?? ""} onChange={(e) => set("surface_sqm", e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="sprice">Prix (MAD)</Label>
          <Input id="sprice" type="number" min="0" step="0.01" value={form.price ?? ""} onChange={(e) => set("price", e.target.value)} />
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label>Statut</Label>
        <Select value={form.status ?? "disponible"} onValueChange={(v) => set("status", v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.entries(STATUS_CONFIG).map(([k, cfg]) => <SelectItem key={k} value={k}>{cfg.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
        <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>Annuler</Button>
        <Button type="submit" disabled={loading} className="bg-gradient-primary text-primary-foreground shadow-glow-sm">
          {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {initial.id ? "Enregistrer" : "Créer le stand"}
        </Button>
      </div>
    </form>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
function FloorPlanPage() {
  const qc = useQueryClient();
  const [venueId, setVenueId] = useState<number | null>(null);
  const [zonePath, setZonePath] = useState<Zone[]>([]);
  const currentZone = zonePath[zonePath.length - 1] ?? null;
  const [selected, setSelected] = useState<{ kind: "zone" | "stand"; id: number } | null>(null);
  const [zoneSheet, setZoneSheet] = useState<"create" | Zone | null>(null);
  const [standSheet, setStandSheet] = useState<"create" | Stand | null>(null);
  const [deleteZoneTarget, setDeleteZoneTarget] = useState<Zone | null>(null);
  const [deleteStandTarget, setDeleteStandTarget] = useState<Stand | null>(null);

  const { data: venues = [], isLoading: venuesLoading } = useQuery({
    queryKey: ["venue-options-plan"],
    queryFn: fetchVenues,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (venueId == null && venues.length > 0) setVenueId(venues[0].id);
  }, [venues, venueId]);

  const { data: rootZones = [], isLoading: rootLoading, isError: rootError } = useQuery({
    queryKey: ["logistics-zones-root", venueId],
    queryFn: () => fetchRootZones(venueId!),
    enabled: venueId != null && currentZone == null,
    staleTime: 30_000,
  });

  const { data: subZones = [], isLoading: subLoading } = useQuery({
    queryKey: ["logistics-zones-children", currentZone?.id],
    queryFn: () => fetchSubZones(currentZone!.id),
    enabled: currentZone != null,
    staleTime: 30_000,
  });

  const { data: stands = [], isLoading: standsLoading } = useQuery({
    queryKey: ["booths-by-zone", currentZone?.id],
    queryFn: () => fetchStands(currentZone!.id),
    enabled: currentZone != null,
    staleTime: 30_000,
  });

  const activeVenue = venues.find((v) => v.id === venueId) ?? null;

  // ── Zone mutations ──────────────────────────────────────────────────────────
  const zoneListKey = currentZone ? ["logistics-zones-children", currentZone.id] : ["logistics-zones-root", venueId];
  const createZoneMut = useMutation({
    mutationFn: createZone,
    onSuccess: () => { qc.invalidateQueries({ queryKey: zoneListKey }); setZoneSheet(null); },
  });
  const updateZoneMut = useMutation({
    mutationFn: updateZone,
    onSuccess: () => { qc.invalidateQueries({ queryKey: zoneListKey }); setZoneSheet(null); },
  });
  const deleteZoneMut = useMutation({
    mutationFn: deleteZone,
    onSuccess: () => { qc.invalidateQueries({ queryKey: zoneListKey }); setDeleteZoneTarget(null); setSelected(null); },
  });
  const moveZoneMut = useMutation({
    mutationFn: updateZone,
    onSuccess: () => qc.invalidateQueries({ queryKey: zoneListKey }),
  });

  // ── Stand mutations ─────────────────────────────────────────────────────────
  const createStandMut = useMutation({
    mutationFn: (data: Partial<Stand>) => createStand({ ...data, logistics_zones_id: currentZone!.id }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["booths-by-zone", currentZone?.id] }); setStandSheet(null); },
  });
  const updateStandMut = useMutation({
    mutationFn: updateStand,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["booths-by-zone", currentZone?.id] }); setStandSheet(null); },
  });
  const deleteStandMut = useMutation({
    mutationFn: deleteStand,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["booths-by-zone", currentZone?.id] }); setDeleteStandTarget(null); setSelected(null); },
  });
  const moveStandMut = useMutation({
    mutationFn: updateStand,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["booths-by-zone", currentZone?.id] }),
  });

  // ── Canvas items for the current level ──────────────────────────────────────
  const canvasItems: CanvasItem[] = useMemo(() => {
    if (currentZone == null) return rootZones.map((z): CanvasItem => ({ kind: "zone", data: z }));
    return [
      ...subZones.map((z): CanvasItem => ({ kind: "zone", data: z })),
      ...stands.map((s): CanvasItem => ({ kind: "stand", data: s })),
    ];
  }, [currentZone, rootZones, subZones, stands]);

  const { layout, ppm, canvasW, canvasH } = useCanvas(canvasItems, currentZone ? 2 : 3, currentZone ? 180 : 220);

  const isLoading = currentZone ? (subLoading || standsLoading) : rootLoading;
  const selectedZone = selected?.kind === "zone" ? [...rootZones, ...subZones].find((z) => z.id === selected.id) ?? null : null;
  const selectedStand = selected?.kind === "stand" ? stands.find((s) => s.id === selected.id) ?? null : null;

  function openZone(zone: Zone) {
    setZonePath((p) => [...p, zone]);
    setSelected(null);
  }
  function goUp() {
    setZonePath((p) => p.slice(0, -1));
    setSelected(null);
  }
  function goToLevel(index: number) {
    setZonePath((p) => p.slice(0, index + 1));
    setSelected(null);
  }
  function goToRoot() {
    setZonePath([]);
    setSelected(null);
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Gestion du lieu</p>
          <h1 className="font-display text-xl font-semibold text-foreground mt-0.5">Plan du Salon</h1>
          {/* Breadcrumb */}
          <div className="flex items-center flex-wrap gap-1 text-sm mt-1">
            <button onClick={goToRoot} className={cn("hover:text-primary", currentZone ? "text-muted-foreground" : "font-semibold text-foreground")}>
              {activeVenue?.name ?? "Lieu"}
            </button>
            {zonePath.map((z, i) => (
              <span key={z.id} className="flex items-center gap-1">
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                <button onClick={() => goToLevel(i)} className={cn("hover:text-primary", i === zonePath.length - 1 ? "font-semibold text-foreground" : "text-muted-foreground")}>
                  {z.name}
                </button>
              </span>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!currentZone && (
            <Select value={venueId != null ? String(venueId) : ""} onValueChange={(v) => { setVenueId(Number(v)); setZonePath([]); setSelected(null); }}>
              <SelectTrigger className="h-9 w-[240px] text-sm"><SelectValue placeholder="Choisir un lieu" /></SelectTrigger>
              <SelectContent>
                {venues.map((v) => <SelectItem key={v.id} value={String(v.id)}>{v.name}{v.city ? ` — ${v.city}` : ""}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          {currentZone && (
            <Button variant="outline" size="sm" className="h-9 text-xs" onClick={goUp}>
              <ArrowLeft className="h-3.5 w-3.5" /> Retour
            </Button>
          )}
          <Button size="sm" className="h-9 text-xs bg-gradient-primary text-primary-foreground shadow-glow-sm"
            onClick={() => setZoneSheet("create")}
            disabled={!venueId}>
            <Plus className="h-3.5 w-3.5" /> {currentZone ? "Sous-zone" : "Zone"}
          </Button>
          {currentZone && (
            <Button size="sm" variant="outline" className="h-9 text-xs" onClick={() => setStandSheet("create")}>
              <Plus className="h-3.5 w-3.5" /> Stand
            </Button>
          )}
        </div>
      </div>

      {/* Canvas */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-foreground uppercase tracking-wider">
            {currentZone
              ? <>Contenu de {currentZone.name} <span className="text-muted-foreground font-normal normal-case">({subZones.length} sous-zone{subZones.length !== 1 ? "s" : ""} · {stands.length} stand{stands.length !== 1 ? "s" : ""})</span></>
              : <>Zones de {activeVenue?.name ?? "…"} <span className="text-muted-foreground font-normal normal-case">({rootZones.length})</span></>}
          </p>
          <ScaleRuler ppm={ppm} />
        </div>
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" /> Chargement…
          </div>
        ) : rootError && !currentZone ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" /> Erreur de chargement des zones.
          </div>
        ) : canvasItems.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-sm text-muted-foreground text-center px-4">
            {currentZone
              ? "Aucune sous-zone ni stand ici. Ajoutez-en avec les boutons ci-dessus."
              : "Aucune zone logistique pour ce lieu. Cliquez sur « Zone » pour commencer."}
          </div>
        ) : (
          <div className="relative overflow-auto rounded-lg bg-muted/20 border border-dashed border-border"
            style={{ height: 460 }}
            onClick={() => setSelected(null)}>
            <div className="relative" style={{ width: canvasW, height: canvasH }}>
              {layout.map(({ item, xM, yM }) => {
                const ci = item.ci;
                const side = boxSideM(ci.data.surface_sqm) * ppm;
                if (ci.kind === "zone") {
                  const subCount = ci.data.sub_zones?.length ?? 0;
                  const standCount = ci.data["commercial spaces"]?.length ?? 0;
                  const countsLabel = (subCount > 0 || standCount > 0)
                    ? [subCount > 0 ? `${subCount} sous-zone${subCount !== 1 ? "s" : ""}` : null, standCount > 0 ? `${standCount} stand${standCount !== 1 ? "s" : ""}` : null].filter(Boolean).join(" · ")
                    : `${num(ci.data.surface_sqm)} m²`;
                  return (
                    <PlanItemBox
                      key={`zone-${ci.data.id}`}
                      x={xM * ppm} y={yM * ppm} size={side}
                      label={ci.data.name} sublabel={countsLabel}
                      bgClass={ZONE_STYLE.bg} borderClass={ZONE_STYLE.border} textClass={ZONE_STYLE.text}
                      icon={<Layers className="h-2.5 w-2.5 text-indigo-500" />}
                      selected={selected?.kind === "zone" && selected.id === ci.data.id}
                      onSelect={() => setSelected({ kind: "zone", id: ci.data.id })}
                      onOpen={() => openZone(ci.data)}
                      onDragEnd={(dxPx, dyPx) => {
                        const newX = Math.max(0, xM + dxPx / ppm);
                        const newY = Math.max(0, yM + dyPx / ppm);
                        moveZoneMut.mutate({ id: ci.data.id, data: { pos_x: newX.toFixed(2), pos_y: newY.toFixed(2) } });
                      }}
                    />
                  );
                }
                const cfg = statusConf(ci.data.status);
                return (
                  <PlanItemBox
                    key={`stand-${ci.data.id}`}
                    x={xM * ppm} y={yM * ppm} size={side}
                    label={ci.data.code ?? ci.data.name} sublabel={`${num(ci.data.surface_sqm)} m²`}
                    bgClass={cfg.bg} borderClass={cfg.border} textClass={cfg.text}
                    selected={selected?.kind === "stand" && selected.id === ci.data.id}
                    onSelect={() => setSelected({ kind: "stand", id: ci.data.id })}
                    onDragEnd={(dxPx, dyPx) => {
                      const newX = Math.max(0, xM + dxPx / ppm);
                      const newY = Math.max(0, yM + dyPx / ppm);
                      moveStandMut.mutate({ id: ci.data.id, data: { pos_x: newX.toFixed(2), pos_y: newY.toFixed(2) } });
                    }}
                  />
                );
              })}
            </div>
          </div>
        )}
        {currentZone && (
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <span className="text-xs font-semibold text-muted-foreground mr-1">Légende :</span>
            <div className="flex items-center gap-1.5">
              <span className={cn("h-3.5 w-3.5 rounded-sm border", ZONE_STYLE.bg, ZONE_STYLE.border)} />
              <span className="text-xs text-muted-foreground">Sous-zone</span>
            </div>
            {Object.entries(STATUS_CONFIG).map(([k, cfg]) => (
              <div key={k} className="flex items-center gap-1.5">
                <span className={cn("h-3.5 w-3.5 rounded-sm border", cfg.bg, cfg.border)} />
                <span className="text-xs text-muted-foreground">{cfg.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Selected item detail */}
      {selectedZone && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 flex items-center gap-4">
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-foreground">{selectedZone.name}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {ZONE_TYPE_LABELS[selectedZone.zone_type ?? ""] ?? selectedZone.zone_type}
              {selectedZone.floor_level && <> · {selectedZone.floor_level}</>}
              {num(selectedZone.surface_sqm) > 0 && <> · {num(selectedZone.surface_sqm)} m²</>}
              {num(selectedZone.capacity) > 0 && <> · {num(selectedZone.capacity)} pers.</>}
              {" · "}{selectedZone.sub_zones?.length ?? 0} sous-zone(s) · {selectedZone["commercial spaces"]?.length ?? 0} stand(s)
            </p>
          </div>
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => openZone(selectedZone)}>
            <DoorOpen className="h-3.5 w-3.5" /> Ouvrir
          </Button>
          <button className="text-muted-foreground hover:text-foreground" onClick={() => setZoneSheet(selectedZone)} title="Modifier">
            <Pencil className="h-4 w-4" />
          </button>
          <button className="text-muted-foreground hover:text-destructive" onClick={() => setDeleteZoneTarget(selectedZone)} title="Supprimer">
            <Trash2 className="h-4 w-4" />
          </button>
          <button onClick={() => setSelected(null)} className="text-xs text-muted-foreground hover:text-foreground">✕</button>
        </div>
      )}
      {selectedStand && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 flex items-center gap-4">
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-foreground">{selectedStand.name}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {SPACE_TYPE_LABELS[selectedStand.space_type ?? ""] ?? selectedStand.space_type}
              {selectedStand.code && <> · {selectedStand.code}</>}
              {num(selectedStand.surface_sqm) > 0 && <> · {num(selectedStand.surface_sqm)} m²</>}
              {num(selectedStand.price) > 0 && <> · {fmtMAD(num(selectedStand.price))}</>}
            </p>
          </div>
          <span className={cn("inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold border",
            statusConf(selectedStand.status).bg, statusConf(selectedStand.status).text, statusConf(selectedStand.status).border)}>
            {statusConf(selectedStand.status).label}
          </span>
          <button className="text-muted-foreground hover:text-foreground" onClick={() => setStandSheet(selectedStand)} title="Modifier">
            <Pencil className="h-4 w-4" />
          </button>
          <button className="text-muted-foreground hover:text-destructive" onClick={() => setDeleteStandTarget(selectedStand)} title="Supprimer">
            <Trash2 className="h-4 w-4" />
          </button>
          <button onClick={() => setSelected(null)} className="text-xs text-muted-foreground hover:text-foreground">✕</button>
        </div>
      )}

      {!venueId && !venuesLoading && (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-border py-16 text-sm text-muted-foreground">
          <Map className="h-4 w-4" /> Aucun lieu disponible — créez d'abord un lieu depuis la fiche événement.
        </div>
      )}

      {/* Zone create/edit sheet */}
      <Sheet open={zoneSheet !== null} onOpenChange={(open) => !open && setZoneSheet(null)}>
        <SheetContent side="right" className="w-full sm:w-[420px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{zoneSheet === "create" ? (currentZone ? "Nouvelle sous-zone" : "Nouvelle zone logistique") : "Modifier la zone"}</SheetTitle>
            <SheetDescription>
              {zoneSheet === "create"
                ? `Ajouter une zone dans ${currentZone?.name ?? activeVenue?.name ?? "ce lieu"}.`
                : "Mettre à jour les informations de la zone."}
            </SheetDescription>
          </SheetHeader>
          {zoneSheet !== null && (
            <ZoneForm
              initial={zoneSheet === "create" ? {} : zoneSheet}
              loading={createZoneMut.isPending || updateZoneMut.isPending}
              onCancel={() => setZoneSheet(null)}
              onSubmit={(data) => zoneSheet === "create"
                ? createZoneMut.mutate({ ...data, venues_id: venueId!, logistics_zones_id: currentZone?.id ?? undefined })
                : updateZoneMut.mutate({ id: (zoneSheet as Zone).id, data })}
            />
          )}
          {(createZoneMut.isError || updateZoneMut.isError) && (
            <p className="text-xs text-destructive mt-2">{((createZoneMut.error ?? updateZoneMut.error) as Error).message}</p>
          )}
        </SheetContent>
      </Sheet>

      {/* Stand create/edit sheet */}
      <Sheet open={standSheet !== null} onOpenChange={(open) => !open && setStandSheet(null)}>
        <SheetContent side="right" className="w-full sm:w-[420px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{standSheet === "create" ? "Nouveau stand" : "Modifier le stand"}</SheetTitle>
            <SheetDescription>
              {standSheet === "create" ? `Ajouter un stand dans ${currentZone?.name ?? "cette zone"}.` : "Mettre à jour les informations du stand."}
            </SheetDescription>
          </SheetHeader>
          {standSheet !== null && (
            <StandForm
              initial={standSheet === "create" ? {} : standSheet}
              loading={createStandMut.isPending || updateStandMut.isPending}
              onCancel={() => setStandSheet(null)}
              onSubmit={(data) => standSheet === "create"
                ? createStandMut.mutate(data)
                : updateStandMut.mutate({ id: (standSheet as Stand).id, data })}
            />
          )}
          {(createStandMut.isError || updateStandMut.isError) && (
            <p className="text-xs text-destructive mt-2">{((createStandMut.error ?? updateStandMut.error) as Error).message}</p>
          )}
        </SheetContent>
      </Sheet>

      {/* Delete zone confirm */}
      <AlertDialog open={deleteZoneTarget !== null} onOpenChange={(open) => !open && setDeleteZoneTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer « {deleteZoneTarget?.name} » ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible. Les sous-zones et stands de cette zone ne seront pas supprimés mais perdront leur zone parente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteZoneTarget && deleteZoneMut.mutate(deleteZoneTarget.id)} className="bg-destructive text-destructive-foreground">
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete stand confirm */}
      <AlertDialog open={deleteStandTarget !== null} onOpenChange={(open) => !open && setDeleteStandTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer « {deleteStandTarget?.name} » ?</AlertDialogTitle>
            <AlertDialogDescription>Cette action est irréversible.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteStandTarget && deleteStandMut.mutate(deleteStandTarget.id)} className="bg-destructive text-destructive-foreground">
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
