import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus, Pencil, Trash2, ArrowLeft, Loader2, AlertCircle, Map, Layers, ChevronRight, DoorOpen,
  ZoomIn, ZoomOut, Maximize2, RotateCw,
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
import { useEvent } from "@/lib/event-context";

export const Route = createFileRoute("/floor-plan")({
  component: FloorPlanPage,
  head: () => ({
    meta: [{ title: "Plan du Salon — AI EVENT OS" }],
  }),
});

// ─── Types ────────────────────────────────────────────────────────────────────
interface Venue { id: number; name: string; city?: string; events_id?: number; total_surface_sqm?: string | number; [key: string]: unknown }

interface Zone {
  id: number;
  name: string;
  zone_type?: string;
  capacity?: string | number;
  surface_sqm?: string | number;
  floor_level?: string;
  venues_id?: number;
  logistics_zones_id?: number | null;
  events_id?: number | null;
  pos_x?: string | number | null;
  pos_y?: string | number | null;
  width_m?: string | number | null;
  height_m?: string | number | null;
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
  width_m?: string | number | null;
  height_m?: string | number | null;
  [key: string]: unknown;
}

type CanvasItem = { kind: "zone"; data: Zone } | { kind: "stand"; data: Stand };
interface Rect { x: number; y: number; w: number; h: number; }
interface LayoutEntry { ci: CanvasItem; xM: number; yM: number; wM: number; hM: number; }
interface DragPreview { id: number; kind: "zone" | "stand"; xM: number; yM: number; wM: number; hM: number; valid: boolean; }

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
const INVALID_STYLE = { bg: "bg-red-500/20", text: "text-red-700", border: "border-red-500" };
function statusConf(s?: string) {
  return STATUS_CONFIG[s ?? ""] ?? STATUS_CONFIG.disponible;
}

// ─── Geometry helpers ─────────────────────────────────────────────────────────
const GRID_M = 0.5;
const EPS = 0.01;

function num(v: string | number | null | undefined): number {
  const n = Number(v ?? 0);
  return isNaN(n) ? 0 : n;
}
function fmtMAD(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M MAD`;
  if (v >= 1_000) return `${Math.round(v / 1_000)}K MAD`;
  return `${v} MAD`;
}
function snap(v: number, grid = GRID_M): number {
  return Math.round(v / grid) * grid;
}
// Real width/height when set on the record; otherwise fall back to a square
// derived from surface_sqm, so existing rows (no dims yet) keep working.
function dimsOf(item: { width_m?: string | number | null; height_m?: string | number | null; surface_sqm?: string | number }): { w: number; h: number } {
  const w = num(item.width_m);
  const h = num(item.height_m);
  if (w > 0 && h > 0) return { w, h };
  const side = Math.sqrt(Math.max(1, num(item.surface_sqm)));
  return { w: side, h: side };
}
function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w - EPS && a.x + a.w > b.x + EPS &&
         a.y < b.y + b.h - EPS && a.y + a.h > b.y + EPS;
}
function rectContains(outer: Rect, inner: Rect): boolean {
  return inner.x >= outer.x - EPS && inner.y >= outer.y - EPS &&
         inner.x + inner.w <= outer.x + outer.w + EPS &&
         inner.y + inner.h <= outer.y + outer.h + EPS;
}
function isValidPlacement(rect: Rect, selfId: number, selfKind: "zone" | "stand", allLayout: LayoutEntry[], boundary: Rect | null): boolean {
  if (boundary && !rectContains(boundary, rect)) return false;
  for (const other of allLayout) {
    if (other.ci.data.id === selfId && other.ci.kind === selfKind) continue;
    if (rectsOverlap(rect, { x: other.xM, y: other.yM, w: other.wM, h: other.hM })) return false;
  }
  return true;
}

// ─── API ─────────────────────────────────────────────────────────────────────
async function fetchVenues(): Promise<Venue[]> {
  const raw = await apiRequest<Venue[] | { list: Venue[] }>("/api/v1/venues?limit=100");
  return Array.isArray(raw) ? raw : (raw.list ?? []);
}
async function fetchRootZones(venueId: number, eventId: number | null): Promise<Zone[]> {
  const eventParam = eventId != null ? `&event_id=${eventId}` : "";
  const raw = await apiRequest<Zone[] | { list: Zone[] }>(`/api/v1/logistics-zones?venue_id=${venueId}${eventParam}&limit=200`);
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

// ─── Auto layout for items with no saved position ────────────────────────────
// Positioned items keep their saved spot. Unpositioned ones flow into a grid
// that starts *below* every already-positioned item's bounding box, so a
// never-dragged item can never land on top of one the user already placed.
function autoLayout(items: CanvasItem[], maxRowM: number, gapM: number): LayoutEntry[] {
  const positioned = items.filter((ci) => ci.data.pos_x != null && ci.data.pos_y != null);
  const unpositioned = items.filter((ci) => ci.data.pos_x == null || ci.data.pos_y == null);

  const out: LayoutEntry[] = positioned.map((ci) => {
    const { w, h } = dimsOf(ci.data);
    return { ci, xM: num(ci.data.pos_x), yM: num(ci.data.pos_y), wM: w, hM: h };
  });

  let cursorX = 0;
  let cursorY = out.length > 0 ? Math.max(...out.map((o) => o.yM + o.hM)) + gapM : 0;
  let rowHeight = 0;
  for (const ci of unpositioned) {
    const { w, h } = dimsOf(ci.data);
    if (cursorX > 0 && cursorX + w > maxRowM) {
      cursorX = 0;
      cursorY += rowHeight + gapM;
      rowHeight = 0;
    }
    out.push({ ci, xM: cursorX, yM: cursorY, wM: w, hM: h });
    cursorX += w + gapM;
    rowHeight = Math.max(rowHeight, h);
  }
  return out;
}

function boundaryFor(currentZone: Zone | null, venue: Venue | null): Rect | null {
  if (currentZone) {
    const { w, h } = dimsOf(currentZone);
    return { x: 0, y: 0, w, h };
  }
  if (venue && num(venue.total_surface_sqm) > 0) {
    const side = Math.sqrt(num(venue.total_surface_sqm));
    return { x: 0, y: 0, w: side, h: side };
  }
  return null;
}

// ─── Draggable / resizable plan item ─────────────────────────────────────────
function PlanItemBox({
  x, y, w, h, label, sublabel, bgClass, borderClass, textClass, icon, selected, invalid,
  onMouseDownMove, onOpen, onResizeStart,
}: {
  x: number; y: number; w: number; h: number; label: string; sublabel?: string;
  bgClass: string; borderClass: string; textClass: string; icon?: React.ReactNode;
  selected: boolean; invalid?: boolean;
  onMouseDownMove: (e: React.MouseEvent) => void;
  onOpen?: () => void;
  onResizeStart?: (e: React.MouseEvent) => void;
}) {
  const style = invalid ? INVALID_STYLE : { bg: bgClass, text: textClass, border: borderClass };
  return (
    <div
      onMouseDown={onMouseDownMove}
      onDoubleClick={onOpen ? (e) => { e.stopPropagation(); onOpen(); } : undefined}
      title={onOpen ? "Glisser pour déplacer · double-clic pour ouvrir" : "Glisser pour déplacer"}
      className={cn(
        "absolute flex flex-col items-center justify-center rounded-md border-2 p-1 text-center select-none cursor-grab active:cursor-grabbing shadow-sm transition-shadow",
        style.bg, style.border,
        selected && !invalid && "ring-2 ring-primary ring-offset-1 z-20 shadow-glow-sm",
        invalid && "z-30 shadow-lg",
      )}
      style={{ left: x, top: y, width: Math.max(4, w), height: Math.max(4, h) }}
    >
      {icon && (
        <div
          className={cn("absolute -top-2 -right-2 rounded-full bg-card border p-0.5", style.border, onOpen && "cursor-pointer hover:scale-110 transition-transform")}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={onOpen ? (e) => { e.stopPropagation(); onOpen(); } : undefined}
        >
          {icon}
        </div>
      )}
      <span className={cn("text-[10px] font-bold leading-tight truncate max-w-full px-0.5", style.text)}>{label}</span>
      {sublabel && h > 30 && w > 40 && (
        <span className={cn("text-[9px] opacity-75 truncate max-w-full px-0.5 leading-tight", style.text)}>{sublabel}</span>
      )}
      {selected && onResizeStart && (
        <div
          onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); onResizeStart(e); }}
          title="Redimensionner"
          className="absolute -bottom-1.5 -right-1.5 h-3 w-3 rounded-sm border-2 border-primary bg-card cursor-nwse-resize z-30"
        />
      )}
    </div>
  );
}

// ─── Scale ruler ──────────────────────────────────────────────────────────────
function ScaleRuler({ ppm }: { ppm: number }) {
  const meters = ppm > 20 ? 2 : ppm > 8 ? 5 : ppm > 3 ? 10 : ppm > 1 ? 20 : 50;
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

// ─── Minimap ──────────────────────────────────────────────────────────────────
function Minimap({ world, layout, viewport, onNavigate }: {
  world: Rect; layout: LayoutEntry[]; viewport: Rect;
  onNavigate: (xM: number, yM: number) => void;
}) {
  const MMW = 140, MMH = 100;
  const scale = Math.min(MMW / Math.max(1, world.w), MMH / Math.max(1, world.h));
  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    e.stopPropagation();
    const r = e.currentTarget.getBoundingClientRect();
    const xM = (e.clientX - r.left) / scale + world.x;
    const yM = (e.clientY - r.top) / scale + world.y;
    onNavigate(xM, yM);
  }
  return (
    <div
      onMouseDown={(e) => e.stopPropagation()}
      onClick={handleClick}
      className="absolute bottom-3 right-3 rounded-md border border-border bg-card/95 shadow-md p-1 cursor-crosshair z-40"
      style={{ width: MMW, height: MMH }}
    >
      <div className="relative w-full h-full overflow-hidden rounded-sm bg-muted/40">
        {layout.map((l) => (
          <div key={`${l.ci.kind}-${l.ci.data.id}`}
            className={cn("absolute rounded-[1px]", l.ci.kind === "zone" ? "bg-indigo-400" : "bg-primary/60")}
            style={{
              left: (l.xM - world.x) * scale, top: (l.yM - world.y) * scale,
              width: Math.max(1, l.wM * scale), height: Math.max(1, l.hM * scale),
            }} />
        ))}
        <div className="absolute border border-primary pointer-events-none" style={{
          left: (viewport.x - world.x) * scale, top: (viewport.y - world.y) * scale,
          width: Math.max(2, viewport.w * scale), height: Math.max(2, viewport.h * scale),
        }} />
      </div>
    </div>
  );
}

// ─── Zone form ────────────────────────────────────────────────────────────────
function ZoneForm({ initial = {}, onSubmit, onCancel, loading }: {
  initial?: Partial<Zone>; onSubmit: (data: Partial<Zone>) => void; onCancel: () => void; loading: boolean;
}) {
  const [form, setForm] = useState<Partial<Zone>>({
    name: "", zone_type: "hall", capacity: "", surface_sqm: "", floor_level: "", width_m: "", height_m: "", ...initial,
  });
  function set(key: keyof Zone, value: unknown) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }
  const w = Number(form.width_m), h = Number(form.height_m);
  const dimsProvided = w > 0 && h > 0;
  const computedSurface = dimsProvided ? (w * h).toFixed(2) : null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = { ...form };
    delete payload.venues; delete payload.logistics_zones; delete payload.sub_zones;
    delete payload["commercial spaces"]; delete payload.sessions; delete payload.scans;
    delete payload["b2b meetings"]; delete payload.staff;
    if (!payload.capacity) delete payload.capacity;
    if (!payload.floor_level) delete payload.floor_level;
    if (dimsProvided) {
      payload.width_m = String(w);
      payload.height_m = String(h);
      payload.surface_sqm = computedSurface!;
    } else {
      delete payload.width_m; delete payload.height_m;
    }
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
          <Label htmlFor="zwidth">Largeur (m)</Label>
          <Input id="zwidth" type="number" min="0" step="0.1" value={form.width_m ?? ""} onChange={(e) => set("width_m", e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="zheight">Longueur (m)</Label>
          <Input id="zheight" type="number" min="0" step="0.1" value={form.height_m ?? ""} onChange={(e) => set("height_m", e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="zsurface">Surface (m²) {dimsProvided && <span className="text-muted-foreground font-normal">— calculée</span>}{!dimsProvided && " *"}</Label>
          <Input id="zsurface" type="number" min="0" step="0.01" required={!dimsProvided} disabled={dimsProvided}
            value={dimsProvided ? computedSurface! : (form.surface_sqm ?? "")}
            onChange={(e) => set("surface_sqm", e.target.value)} />
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
    name: "", code: "", space_type: "stand", surface_sqm: "", price: "", status: "disponible", width_m: "", height_m: "", ...initial,
  });
  function set(key: keyof Stand, value: unknown) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }
  const w = Number(form.width_m), h = Number(form.height_m);
  const dimsProvided = w > 0 && h > 0;
  const computedSurface = dimsProvided ? (w * h).toFixed(2) : null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = { ...form };
    delete payload.logistics_zones; delete payload.staff; delete payload["org stands"];
    delete payload["org stands - stand_label"]; delete payload["org stands stand_label"];
    if (!payload.code) delete payload.code;
    if (!payload.price) delete payload.price;
    if (dimsProvided) {
      payload.width_m = String(w);
      payload.height_m = String(h);
      payload.surface_sqm = computedSurface!;
    } else {
      delete payload.width_m; delete payload.height_m;
    }
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
          <Label htmlFor="swidth">Largeur (m)</Label>
          <Input id="swidth" type="number" min="0" step="0.1" value={form.width_m ?? ""} onChange={(e) => set("width_m", e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="sheight">Longueur (m)</Label>
          <Input id="sheight" type="number" min="0" step="0.1" value={form.height_m ?? ""} onChange={(e) => set("height_m", e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="ssurface">Surface (m²) {dimsProvided && <span className="text-muted-foreground font-normal">— calculée</span>}{!dimsProvided && " *"}</Label>
          <Input id="ssurface" type="number" min="0" step="0.01" required={!dimsProvided} disabled={dimsProvided}
            value={dimsProvided ? computedSurface! : (form.surface_sqm ?? "")}
            onChange={(e) => set("surface_sqm", e.target.value)} />
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
  const { activeEvent } = useEvent();
  const activeEventId = Number(activeEvent.id) || null;
  const [venueId, setVenueId] = useState<number | null>(null);
  const [zonePath, setZonePath] = useState<Zone[]>([]);
  const currentZone = zonePath[zonePath.length - 1] ?? null;
  const [selected, setSelected] = useState<{ kind: "zone" | "stand"; id: number } | null>(null);
  const [zoneSheet, setZoneSheet] = useState<"create" | Zone | null>(null);
  const [standSheet, setStandSheet] = useState<"create" | Stand | null>(null);
  const [deleteZoneTarget, setDeleteZoneTarget] = useState<Zone | null>(null);
  const [deleteStandTarget, setDeleteStandTarget] = useState<Stand | null>(null);
  const [dragPreview, setDragPreview] = useState<DragPreview | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ w: 900, h: 520 });
  const [zoomFactor, setZoomFactor] = useState(1);
  const [pan, setPan] = useState({ x: 24, y: 24 });

  const { data: venues = [], isLoading: venuesLoading } = useQuery({
    queryKey: ["venue-options-plan"],
    queryFn: fetchVenues,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (venueId == null && venues.length > 0) setVenueId(venues[0].id);
  }, [venues, venueId]);

  const { data: rootZones = [], isLoading: rootLoading, isError: rootError } = useQuery({
    queryKey: ["logistics-zones-root", venueId, activeEventId],
    queryFn: () => fetchRootZones(venueId!, activeEventId),
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

  // ── Canvas items + layout for the current level ─────────────────────────────
  const canvasItems: CanvasItem[] = useMemo(() => {
    if (currentZone == null) return rootZones.map((z): CanvasItem => ({ kind: "zone", data: z }));
    return [
      ...subZones.map((z): CanvasItem => ({ kind: "zone", data: z })),
      ...stands.map((s): CanvasItem => ({ kind: "stand", data: s })),
    ];
  }, [currentZone, rootZones, subZones, stands]);

  const boundary = useMemo(() => boundaryFor(currentZone, activeVenue), [currentZone, activeVenue]);
  const layout = useMemo(() => autoLayout(canvasItems, boundary?.w ?? 60, currentZone ? 1 : 2), [canvasItems, boundary, currentZone]);

  const contentBBox = useMemo(() => {
    if (layout.length === 0) return { w: 10, h: 10 };
    return {
      w: Math.max(...layout.map((l) => l.xM + l.wM)),
      h: Math.max(...layout.map((l) => l.yM + l.hM)),
    };
  }, [layout]);
  const fitTarget = boundary ?? contentBBox;

  // ── Measure the canvas container so "fit" always matches the real viewport ──
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0].contentRect;
      setContainerSize({ w: cr.width, h: cr.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const basePpm = useMemo(() => {
    const pad = 0.88;
    const ppmW = (containerSize.w * pad) / Math.max(1, fitTarget.w);
    const ppmH = (containerSize.h * pad) / Math.max(1, fitTarget.h);
    return Math.max(1, Math.min(ppmW, ppmH, 80));
  }, [containerSize, fitTarget]);

  function resetView() {
    setZoomFactor(1);
    setPan({ x: 24, y: 24 });
  }
  useEffect(() => {
    resetView();
    setSelected(null);
  }, [venueId, currentZone?.id]);

  const ppm = basePpm * zoomFactor;

  const isLoading = currentZone ? (subLoading || standsLoading) : rootLoading;
  const selectedZone = selected?.kind === "zone" ? [...rootZones, ...subZones].find((z) => z.id === selected.id) ?? null : null;
  const selectedStand = selected?.kind === "stand" ? stands.find((s) => s.id === selected.id) ?? null : null;
  const selectedEntry = selected ? layout.find((l) => l.ci.data.id === selected.id && l.ci.kind === selected.kind) ?? null : null;

  function openZone(zone: Zone) {
    setZonePath((p) => [...p, zone]);
  }
  function goUp() {
    setZonePath((p) => p.slice(0, -1));
  }
  function goToLevel(index: number) {
    setZonePath((p) => p.slice(0, index + 1));
  }
  function goToRoot() {
    setZonePath([]);
  }

  // ── Move drag: live collision/containment preview, commit on drop ──────────
  function startMove(entry: LayoutEntry, e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    const startClientX = e.clientX, startClientY = e.clientY;
    const { xM: origX, yM: origY, wM, hM } = entry;
    const id = entry.ci.data.id;
    const kind = entry.ci.kind;
    let moved = false;

    function onMove(ev: MouseEvent) {
      const dx = ev.clientX - startClientX, dy = ev.clientY - startClientY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) moved = true;
      if (!moved) return;
      const newX = Math.max(0, snap(origX + dx / ppm));
      const newY = Math.max(0, snap(origY + dy / ppm));
      const valid = isValidPlacement({ x: newX, y: newY, w: wM, h: hM }, id, kind, layout, boundary);
      setDragPreview({ id, kind, xM: newX, yM: newY, wM, hM, valid });
    }
    function onUp() {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      if (!moved) {
        setSelected({ kind, id });
        return;
      }
      setDragPreview((dp) => {
        if (dp && dp.valid) {
          const data = { pos_x: dp.xM.toFixed(2), pos_y: dp.yM.toFixed(2) };
          if (kind === "zone") moveZoneMut.mutate({ id, data });
          else moveStandMut.mutate({ id, data });
          setSelected({ kind, id });
        }
        return null;
      });
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  // ── Resize drag: bottom-right handle, same validation rules ─────────────────
  function startResize(entry: LayoutEntry, e: React.MouseEvent) {
    const startClientX = e.clientX, startClientY = e.clientY;
    const { xM, yM, wM: origW, hM: origH } = entry;
    const id = entry.ci.data.id;
    const kind = entry.ci.kind;

    function onMove(ev: MouseEvent) {
      const dw = (ev.clientX - startClientX) / ppm;
      const dh = (ev.clientY - startClientY) / ppm;
      const newW = Math.max(1, snap(origW + dw));
      const newH = Math.max(1, snap(origH + dh));
      const valid = isValidPlacement({ x: xM, y: yM, w: newW, h: newH }, id, kind, layout, boundary);
      setDragPreview({ id, kind, xM, yM, wM: newW, hM: newH, valid });
    }
    function onUp() {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      setDragPreview((dp) => {
        if (dp && dp.valid) {
          const surface = (dp.wM * dp.hM).toFixed(2);
          const data = { width_m: dp.wM.toFixed(2), height_m: dp.hM.toFixed(2), surface_sqm: surface };
          if (kind === "zone") moveZoneMut.mutate({ id, data });
          else moveStandMut.mutate({ id, data });
        }
        return null;
      });
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  function rotateSelected() {
    if (!selected || !selectedEntry) return;
    const newW = selectedEntry.hM, newH = selectedEntry.wM;
    const valid = isValidPlacement({ x: selectedEntry.xM, y: selectedEntry.yM, w: newW, h: newH }, selected.id, selected.kind, layout, boundary);
    if (!valid) {
      setActionError("Rotation impossible : chevauchement ou hors limites.");
      setTimeout(() => setActionError(null), 2500);
      return;
    }
    const data = { width_m: newW.toFixed(2), height_m: newH.toFixed(2), surface_sqm: (newW * newH).toFixed(2) };
    if (selected.kind === "zone") moveZoneMut.mutate({ id: selected.id, data });
    else moveStandMut.mutate({ id: selected.id, data });
  }

  // ── Pan: drag empty canvas background ───────────────────────────────────────
  function handleBackgroundMouseDown(e: React.MouseEvent) {
    const startX = e.clientX, startY = e.clientY;
    const startPan = pan;
    let moved = false;
    function onMove(ev: MouseEvent) {
      const dx = ev.clientX - startX, dy = ev.clientY - startY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) moved = true;
      if (moved) setPan({ x: startPan.x + dx, y: startPan.y + dy });
    }
    function onUp() {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      if (!moved) setSelected(null);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  // ── Zoom: native non-passive wheel listener, zoom centered on the cursor ───
  const ppmRef = useRef(ppm); useEffect(() => { ppmRef.current = ppm; }, [ppm]);
  const panRef = useRef(pan); useEffect(() => { panRef.current = pan; }, [pan]);
  const zoomRef = useRef(zoomFactor); useEffect(() => { zoomRef.current = zoomFactor; }, [zoomFactor]);
  const baseppmRef = useRef(basePpm); useEffect(() => { baseppmRef.current = basePpm; }, [basePpm]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    function handleWheel(e: WheelEvent) {
      e.preventDefault();
      const rect = el!.getBoundingClientRect();
      const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
      const curPan = panRef.current, curPpm = ppmRef.current;
      const worldX = (cx - curPan.x) / curPpm, worldY = (cy - curPan.y) / curPpm;
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      const newZoom = Math.max(0.2, Math.min(6, zoomRef.current * factor));
      const newPpm = baseppmRef.current * newZoom;
      setZoomFactor(newZoom);
      setPan({ x: cx - worldX * newPpm, y: cy - worldY * newPpm });
    }
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, []);

  function zoomBy(factor: number) {
    setZoomFactor((z) => Math.max(0.2, Math.min(6, z * factor)));
  }

  const viewport: Rect = { x: -pan.x / ppm, y: -pan.y / ppm, w: containerSize.w / ppm, h: containerSize.h / ppm };
  const minimapWorld: Rect = boundary ?? { x: 0, y: 0, w: contentBBox.w, h: contentBBox.h };
  const occupancyPct = boundary
    ? Math.round((layout.reduce((a, l) => a + l.wM * l.hM, 0) / Math.max(EPS, boundary.w * boundary.h)) * 100)
    : null;

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
            <Select value={venueId != null ? String(venueId) : ""} onValueChange={(v) => { setVenueId(Number(v)); setZonePath([]); }}>
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
              ? <>Contenu de {currentZone.name} <span className="text-muted-foreground font-normal normal-case">({subZones.length} sous-zone{subZones.length !== 1 ? "s" : ""} · {stands.length} stand{stands.length !== 1 ? "s" : ""}{occupancyPct != null && ` · ${occupancyPct}% occupé`})</span></>
              : <>Zones de {activeVenue?.name ?? "…"} <span className="text-muted-foreground font-normal normal-case">({rootZones.length}{occupancyPct != null && ` · ${occupancyPct}% occupé`})</span></>}
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
        ) : (
          <div
            ref={containerRef}
            onMouseDown={handleBackgroundMouseDown}
            className="relative overflow-hidden rounded-lg bg-muted/20 border border-dashed border-border select-none cursor-grab active:cursor-grabbing"
            style={{ height: 520 }}
          >
            {canvasItems.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground text-center px-8 pointer-events-none">
                {currentZone
                  ? "Aucune sous-zone ni stand ici. Ajoutez-en avec les boutons ci-dessus."
                  : "Aucune zone logistique pour ce lieu. Cliquez sur « Zone » pour commencer."}
              </div>
            )}

            {boundary && (
              <div className="absolute border-2 border-dashed border-foreground/25 rounded-sm pointer-events-none"
                style={{ left: pan.x, top: pan.y, width: boundary.w * ppm, height: boundary.h * ppm }} />
            )}

            {layout.map((entry) => {
              const isDragging = dragPreview?.id === entry.ci.data.id && dragPreview.kind === entry.ci.kind;
              const xM = isDragging ? dragPreview!.xM : entry.xM;
              const yM = isDragging ? dragPreview!.yM : entry.yM;
              const wM = isDragging ? dragPreview!.wM : entry.wM;
              const hM = isDragging ? dragPreview!.hM : entry.hM;
              const px = pan.x + xM * ppm, py = pan.y + yM * ppm, pw = wM * ppm, ph = hM * ppm;
              const isSelected = selected?.kind === entry.ci.kind && selected.id === entry.ci.data.id;

              if (entry.ci.kind === "zone") {
                const z = entry.ci.data;
                const subCount = z.sub_zones?.length ?? 0;
                const standCount = z["commercial spaces"]?.length ?? 0;
                const countsLabel = (subCount > 0 || standCount > 0)
                  ? [subCount > 0 ? `${subCount} sous-zone${subCount !== 1 ? "s" : ""}` : null, standCount > 0 ? `${standCount} stand${standCount !== 1 ? "s" : ""}` : null].filter(Boolean).join(" · ")
                  : `${num(z.surface_sqm)} m²`;
                return (
                  <PlanItemBox
                    key={`zone-${z.id}`}
                    x={px} y={py} w={pw} h={ph}
                    label={z.name} sublabel={countsLabel}
                    bgClass={ZONE_STYLE.bg} borderClass={ZONE_STYLE.border} textClass={ZONE_STYLE.text}
                    icon={<Layers className="h-2.5 w-2.5 text-indigo-500" />}
                    selected={isSelected} invalid={isDragging && !dragPreview!.valid}
                    onMouseDownMove={(e) => startMove(entry, e)}
                    onOpen={() => openZone(z)}
                    onResizeStart={isSelected ? (e) => startResize(entry, e) : undefined}
                  />
                );
              }
              const s = entry.ci.data;
              const cfg = statusConf(s.status);
              return (
                <PlanItemBox
                  key={`stand-${s.id}`}
                  x={px} y={py} w={pw} h={ph}
                  label={s.code ?? s.name} sublabel={`${num(s.surface_sqm)} m²`}
                  bgClass={cfg.bg} borderClass={cfg.border} textClass={cfg.text}
                  selected={isSelected} invalid={isDragging && !dragPreview!.valid}
                  onMouseDownMove={(e) => startMove(entry, e)}
                  onResizeStart={isSelected ? (e) => startResize(entry, e) : undefined}
                />
              );
            })}

            {/* Zoom controls */}
            <div className="absolute top-2 right-2 flex flex-col gap-1 z-40" onMouseDown={(e) => e.stopPropagation()}>
              <button onClick={() => zoomBy(1.25)} title="Zoomer" className="h-7 w-7 rounded-md border border-border bg-card/95 shadow-sm flex items-center justify-center hover:bg-muted">
                <ZoomIn className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => zoomBy(1 / 1.25)} title="Dézoomer" className="h-7 w-7 rounded-md border border-border bg-card/95 shadow-sm flex items-center justify-center hover:bg-muted">
                <ZoomOut className="h-3.5 w-3.5" />
              </button>
              <button onClick={resetView} title="Ajuster à l'écran" className="h-7 w-7 rounded-md border border-border bg-card/95 shadow-sm flex items-center justify-center hover:bg-muted">
                <Maximize2 className="h-3.5 w-3.5" />
              </button>
            </div>

            {(layout.length > 0 || boundary) && (
              <Minimap world={minimapWorld} layout={layout} viewport={viewport}
                onNavigate={(xM, yM) => setPan({ x: containerSize.w / 2 - xM * ppm, y: containerSize.h / 2 - yM * ppm })} />
            )}
          </div>
        )}

        {actionError && <p className="text-xs text-destructive">{actionError}</p>}

        {currentZone && (
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <span className="text-xs font-semibold text-muted-foreground mr-1">Légende :</span>
            <div className="flex items-center gap-1.5">
              <span className={cn("h-3.5 w-3.5 rounded-sm border", ZONE_STYLE.bg, ZONE_STYLE.border)} />
              <span className="text-xs text-muted-foreground">Sous-zone</span>
            </div>
            {Object.entries(STATUS_CONFIG).map(([k, cfg]) => {
              const count = stands.filter((s) => (s.status ?? "disponible") === k).length;
              return (
                <div key={k} className="flex items-center gap-1.5">
                  <span className={cn("h-3.5 w-3.5 rounded-sm border", cfg.bg, cfg.border)} />
                  <span className="text-xs text-muted-foreground">{cfg.label} ({count})</span>
                </div>
              );
            })}
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
              {num(selectedZone.width_m) > 0 && num(selectedZone.height_m) > 0
                ? <> · {num(selectedZone.width_m)}m × {num(selectedZone.height_m)}m</>
                : num(selectedZone.surface_sqm) > 0 && <> · {num(selectedZone.surface_sqm)} m²</>}
              {num(selectedZone.capacity) > 0 && <> · {num(selectedZone.capacity)} pers.</>}
              {" · "}{selectedZone.sub_zones?.length ?? 0} sous-zone(s) · {selectedZone["commercial spaces"]?.length ?? 0} stand(s)
            </p>
          </div>
          <button className="text-muted-foreground hover:text-foreground" onClick={rotateSelected} title="Rotation 90°">
            <RotateCw className="h-4 w-4" />
          </button>
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
              {num(selectedStand.width_m) > 0 && num(selectedStand.height_m) > 0
                ? <> · {num(selectedStand.width_m)}m × {num(selectedStand.height_m)}m</>
                : num(selectedStand.surface_sqm) > 0 && <> · {num(selectedStand.surface_sqm)} m²</>}
              {num(selectedStand.price) > 0 && <> · {fmtMAD(num(selectedStand.price))}</>}
            </p>
          </div>
          <span className={cn("inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold border",
            statusConf(selectedStand.status).bg, statusConf(selectedStand.status).text, statusConf(selectedStand.status).border)}>
            {statusConf(selectedStand.status).label}
          </span>
          <button className="text-muted-foreground hover:text-foreground" onClick={rotateSelected} title="Rotation 90°">
            <RotateCw className="h-4 w-4" />
          </button>
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
                ? createZoneMut.mutate({ ...data, venues_id: venueId!, logistics_zones_id: currentZone?.id ?? undefined, events_id: activeEventId ?? undefined })
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
