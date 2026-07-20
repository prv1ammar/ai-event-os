import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  Plus, Search, Eye, Pencil, MoreHorizontal, MapPin, CheckCircle2, Clock3, XCircle,
  ChevronLeft, ChevronRight, Loader2, AlertCircle, Trash2, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { apiRequest, smartDbRequest } from "@/lib/api";

export const Route = createFileRoute("/lieux")({
  component: LieuxPage,
  head: () => ({
    meta: [
      { title: "Gestion des Lieux — AI EVENT" },
      { name: "description", content: "Gérez les lieux disponibles pour vos événements." },
    ],
  }),
});

// ─── Types ────────────────────────────────────────────────────────────────────
interface Venue {
  id: number;
  name: string;
  city?: string;
  address?: string;
  description?: string;
  total_capacity?: string | number;
  total_surface_sqm?: string | number;
  latitude?: string | number;
  longitude?: string | number;
  status?: string;
  events?: Array<{ id: number; name?: string }>;
  [key: string]: unknown;
}

const STATUS_LABELS: Record<string, string> = {
  "à_étudier": "À étudier", "sélectionné": "Sélectionné", "confirmé": "Confirmé", "écarté": "Écarté",
};
const statusStyles: Record<string, string> = {
  "à_étudier": "bg-amber-500/10 text-amber-600 ring-1 ring-inset ring-amber-500/20",
  "sélectionné": "bg-sky-500/10 text-sky-600 ring-1 ring-inset ring-sky-500/20",
  "confirmé": "bg-emerald-500/10 text-emerald-600 ring-1 ring-inset ring-emerald-500/20",
  "écarté": "bg-muted text-muted-foreground ring-1 ring-inset ring-border",
};
const toneStyles: Record<string, string> = {
  primary: "bg-primary/10 text-primary", green: "bg-emerald-500/10 text-emerald-600",
  amber: "bg-amber-500/10 text-amber-600", blue: "bg-sky-500/10 text-sky-600",
};

function num(v: string | number | undefined): number {
  const n = Number(v ?? 0);
  return isNaN(n) ? 0 : n;
}

// A venue can now host many events (events.venues_id → many-to-one), so the
// reverse side is always an array — even when there's only one linked event.
function eventNames(v: { events?: Array<{ name?: string }> }): string[] {
  return (v.events ?? []).map((e) => e.name).filter((n): n is string => !!n);
}

// ─── API ─────────────────────────────────────────────────────────────────────
async function fetchVenues(): Promise<Venue[]> {
  const raw = await apiRequest<Venue[] | { list: Venue[] }>("/api/v1/venues?limit=200");
  return Array.isArray(raw) ? raw : (raw.list ?? []);
}
async function createVenue(data: Partial<Venue>): Promise<void> {
  await smartDbRequest("venues", "POST", data as Record<string, unknown>);
}
async function updateVenue({ id, data }: { id: number; data: Partial<Venue> }): Promise<void> {
  await smartDbRequest("venues", "PATCH", { id, ...data });
}
async function deleteVenue(id: number): Promise<void> {
  await smartDbRequest("venues", "DELETE", { id });
}

// ─── Venue Form ───────────────────────────────────────────────────────────────
interface VenueFormProps {
  initial?: Partial<Venue>;
  onSubmit: (data: Partial<Venue>) => void;
  onCancel: () => void;
  loading: boolean;
}

function VenueForm({ initial = {}, onSubmit, onCancel, loading }: VenueFormProps) {
  const [form, setForm] = useState<Partial<Venue>>({
    name: "", city: "", address: "", description: "",
    total_capacity: "", total_surface_sqm: "", latitude: "", longitude: "", status: "à_étudier",
    ...initial,
  });

  function set(key: keyof Venue, value: unknown) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = { ...form };
    delete payload.events;
    delete payload["logistics zones"];
    delete payload["logistics zones - name"];
    if (!payload.city) delete payload.city;
    if (!payload.address) delete payload.address;
    if (!payload.description) delete payload.description;
    if (!payload.total_capacity) delete payload.total_capacity;
    if (!payload.total_surface_sqm) delete payload.total_surface_sqm;
    if (!payload.latitude) delete payload.latitude;
    if (!payload.longitude) delete payload.longitude;
    onSubmit(payload);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 py-2">
      <div className="grid gap-1.5">
        <Label htmlFor="v-name">Nom du lieu *</Label>
        <Input id="v-name" required value={form.name ?? ""} onChange={(e) => set("name", e.target.value)} placeholder="Ex: Palais des Congrès" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="v-city">Ville</Label>
          <Input id="v-city" value={form.city ?? ""} onChange={(e) => set("city", e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label>Statut</Label>
          <Select value={form.status ?? "à_étudier"} onValueChange={(v) => set("status", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(STATUS_LABELS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="v-address">Adresse</Label>
        <Input id="v-address" value={form.address ?? ""} onChange={(e) => set("address", e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="v-capacity">Capacité totale</Label>
          <Input id="v-capacity" type="number" min="0" value={form.total_capacity ?? ""} onChange={(e) => set("total_capacity", e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="v-surface">Surface totale (m²)</Label>
          <Input id="v-surface" type="number" min="0" step="0.01" value={form.total_surface_sqm ?? ""} onChange={(e) => set("total_surface_sqm", e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="v-lat">Latitude</Label>
          <Input id="v-lat" type="number" step="0.000001" value={form.latitude ?? ""} onChange={(e) => set("latitude", e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="v-lng">Longitude</Label>
          <Input id="v-lng" type="number" step="0.000001" value={form.longitude ?? ""} onChange={(e) => set("longitude", e.target.value)} />
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="v-description">Description</Label>
        <Textarea id="v-description" rows={3} className="resize-none"
          value={form.description ?? ""} onChange={(e) => set("description", e.target.value)} placeholder="Décrivez le lieu…" />
      </div>
      {initial.events && initial.events.length > 0 && (
        <p className="text-xs text-muted-foreground -mt-2">
          Lié à {initial.events.length > 1 ? "événements" : "l'événement"}{" "}
          <span className="font-medium text-foreground">{eventNames(initial).join(", ")}</span> — se gère depuis la fiche événement.
        </p>
      )}
      <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
        <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>Annuler</Button>
        <Button type="submit" disabled={loading} className="bg-gradient-primary text-primary-foreground shadow-glow-sm">
          {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {initial.id ? "Enregistrer" : "Créer le lieu"}
        </Button>
      </div>
    </form>
  );
}

// ─── Venue Detail ─────────────────────────────────────────────────────────────
function VenueDetail({ venue }: { venue: Venue }) {
  const status = venue.status ?? "";
  return (
    <div className="space-y-4 py-2">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-primary/20 to-primary-glow/20 text-primary">
          <MapPin className="h-5 w-5" />
        </div>
        <div>
          <p className="font-semibold text-foreground">{venue.name}</p>
          <p className="text-xs text-muted-foreground">{venue.city || "—"}</p>
        </div>
        {status && (
          <span className={cn("ml-auto inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium", statusStyles[status] ?? "bg-muted text-muted-foreground")}>
            {STATUS_LABELS[status] ?? status}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        {[
          { label: "Adresse", value: venue.address || "—" },
          { label: "Événement(s) lié(s)", value: eventNames(venue).join(", ") || "—" },
          { label: "Capacité", value: num(venue.total_capacity) > 0 ? `${num(venue.total_capacity)} pers.` : "—" },
          { label: "Surface", value: num(venue.total_surface_sqm) > 0 ? `${num(venue.total_surface_sqm)} m²` : "—" },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-lg bg-muted/40 px-3 py-2">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
            <p className="font-medium text-foreground mt-0.5 truncate">{value}</p>
          </div>
        ))}
      </div>

      {venue.description && (
        <div className="rounded-lg bg-muted/40 px-3 py-2">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Description</p>
          <p className="text-sm text-foreground leading-relaxed">{venue.description}</p>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
function LieuxPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const [viewVenue, setViewVenue] = useState<Venue | null>(null);
  const [editVenue, setEditVenue] = useState<Venue | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Venue | null>(null);

  const { data: venues = [], isLoading, isError, error } = useQuery({
    queryKey: ["venues-full"],
    queryFn: fetchVenues,
  });

  const createMut = useMutation({
    mutationFn: createVenue,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["venues-full"] });
      qc.invalidateQueries({ queryKey: ["venue-options"] });
      setShowCreate(false);
    },
  });
  const updateMut = useMutation({
    mutationFn: updateVenue,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["venues-full"] });
      qc.invalidateQueries({ queryKey: ["venue-options"] });
      setEditVenue(null);
    },
  });
  const deleteMut = useMutation({
    mutationFn: deleteVenue,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["venues-full"] });
      qc.invalidateQueries({ queryKey: ["venue-options"] });
      setDeleteTarget(null);
    },
  });

  const filtered = venues.filter((v) => {
    const q = search.toLowerCase();
    if (search && !`${v.name} ${v.city ?? ""}`.toLowerCase().includes(q)) return false;
    if (statusFilter !== "all" && v.status !== statusFilter) return false;
    return true;
  });

  const PAGE_SIZE = 20;
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const confirmedCount = venues.filter((v) => v.status === "confirmé").length;
  const selectedCount = venues.filter((v) => v.status === "sélectionné").length;
  const studyCount = venues.filter((v) => v.status === "à_étudier").length;

  const stats = [
    { label: "Total lieux", value: isLoading ? "…" : String(venues.length), icon: MapPin, tone: "primary" },
    { label: "Confirmés", value: isLoading ? "…" : String(confirmedCount), icon: CheckCircle2, tone: "green" },
    { label: "Sélectionnés", value: isLoading ? "…" : String(selectedCount), icon: Eye, tone: "blue" },
    { label: "À étudier", value: isLoading ? "…" : String(studyCount), icon: Clock3, tone: "amber" },
  ];

  return (
    <div className="p-6 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Gestion des Lieux</h1>
          <p className="text-sm text-muted-foreground mt-1">Lieux disponibles pour vos événements</p>
        </div>
        <Button
          className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-glow"
          onClick={() => setShowCreate(true)}
        >
          <Plus className="h-4 w-4" /> Ajouter un lieu
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border border-border bg-card p-4 hover:shadow-md transition-shadow">
            <div className={cn("flex h-9 w-9 items-center justify-center rounded-lg", toneStyles[s.tone])}>
              <s.icon className="h-4 w-4" />
            </div>
            <p className="mt-3 text-xs text-muted-foreground">{s.label}</p>
            <p className="mt-1 text-2xl font-bold text-foreground tracking-tight">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Rechercher un lieu..." className="h-10 pl-9 bg-card"
            value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="w-[160px] h-10 bg-card">
            <SelectValue placeholder="Tous les statuts" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les statuts</SelectItem>
            {Object.entries(STATUS_LABELS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-20 gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Chargement des lieux…</span>
          </div>
        ) : isError ? (
          <div className="flex items-center justify-center py-20 gap-2 text-destructive">
            <AlertCircle className="h-5 w-5" />
            <span className="text-sm">{error instanceof Error ? error.message : "Erreur de chargement"}</span>
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  {["Lieu", "Ville", "Capacité", "Surface", "Statut", "Événement lié", "Actions"].map((h) => (
                    <TableHead key={h} className={cn(
                      "text-xs font-semibold uppercase tracking-wider text-muted-foreground",
                      h === "Actions" ? "text-right" : "",
                    )}>{h}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginated.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12 text-muted-foreground text-sm">
                      Aucun lieu trouvé
                    </TableCell>
                  </TableRow>
                ) : (
                  paginated.map((v) => {
                    const status = v.status ?? "";
                    return (
                      <TableRow key={v.id} className="hover:bg-muted/30 cursor-pointer" onClick={() => setViewVenue(v)}>
                        <TableCell className="py-3">
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-primary/20 to-primary-glow/20 text-primary">
                              <MapPin className="h-4 w-4" />
                            </div>
                            <span className="text-sm font-medium text-foreground">{v.name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{v.city || "—"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{num(v.total_capacity) > 0 ? num(v.total_capacity) : "—"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{num(v.total_surface_sqm) > 0 ? `${num(v.total_surface_sqm)} m²` : "—"}</TableCell>
                        <TableCell>
                          {status ? (
                            <span className={cn("inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium",
                              statusStyles[status] ?? "bg-muted text-muted-foreground ring-1 ring-inset ring-border")}>
                              {STATUS_LABELS[status] ?? status}
                            </span>
                          ) : <span className="text-sm text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-[160px] truncate" title={eventNames(v).join(", ")}>
                          {(() => {
                            const names = eventNames(v);
                            if (names.length === 0) return <span className="text-muted-foreground/50">—</span>;
                            const extra = names.length - 1;
                            return (
                              <span className="text-primary/80 font-medium">
                                {names[0]}{extra > 0 && ` +${extra}`}
                              </span>
                            );
                          })()}
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                            <button
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                              onClick={() => setViewVenue(v)}
                              title="Voir"
                            >
                              <Eye className="h-4 w-4" />
                            </button>
                            <button
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                              onClick={() => setEditVenue(v)}
                              title="Modifier"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
                                  <MoreHorizontal className="h-4 w-4" />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-40">
                                <DropdownMenuItem onClick={() => setViewVenue(v)}>
                                  <Eye className="h-4 w-4 mr-2" /> Voir
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setEditVenue(v)}>
                                  <Pencil className="h-4 w-4 mr-2" /> Modifier
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onClick={() => setDeleteTarget(v)}
                                >
                                  <Trash2 className="h-4 w-4 mr-2" /> Supprimer
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>

            <div className="flex items-center justify-between border-t border-border px-4 py-3">
              <p className="text-xs text-muted-foreground">
                {filtered.length} lieu{filtered.length !== 1 ? "x" : ""} affiché{filtered.length !== 1 ? "s" : ""}
              </p>
              <div className="flex items-center gap-1">
                <button disabled={page === 1} onClick={() => setPage((p) => p - 1)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted disabled:opacity-50">
                  <ChevronLeft className="h-4 w-4" />
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                  <button key={p} onClick={() => setPage(p)}
                    className={cn("inline-flex h-8 w-8 items-center justify-center rounded-md text-sm font-medium",
                      p === page ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground hover:bg-muted")}>
                    {p}
                  </button>
                ))}
                <button disabled={page === totalPages} onClick={() => setPage((p) => p + 1)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted disabled:opacity-50">
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* View Sheet */}
      <Sheet open={!!viewVenue} onOpenChange={(o) => !o && setViewVenue(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader className="mb-4">
            <SheetTitle>Détails du lieu</SheetTitle>
            <SheetDescription>Informations complètes sur ce lieu.</SheetDescription>
          </SheetHeader>
          {viewVenue && (
            <>
              <VenueDetail venue={viewVenue} />
              <div className="flex gap-2 mt-6 pt-4 border-t border-border">
                <Button variant="outline" className="flex-1" onClick={() => setViewVenue(null)}>
                  <X className="h-4 w-4 mr-2" /> Fermer
                </Button>
                <Button className="flex-1 bg-gradient-primary text-primary-foreground" onClick={() => { setEditVenue(viewVenue); setViewVenue(null); }}>
                  <Pencil className="h-4 w-4 mr-2" /> Modifier
                </Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Edit Sheet */}
      <Sheet open={!!editVenue} onOpenChange={(o) => !o && setEditVenue(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader className="mb-4">
            <SheetTitle>Modifier le lieu</SheetTitle>
            <SheetDescription>Mettez à jour les informations de ce lieu.</SheetDescription>
          </SheetHeader>
          {editVenue && (
            <VenueForm
              initial={editVenue}
              loading={updateMut.isPending}
              onCancel={() => setEditVenue(null)}
              onSubmit={(data) => updateMut.mutate({ id: editVenue.id, data })}
            />
          )}
          {updateMut.isError && (
            <p className="text-xs text-destructive mt-2">{(updateMut.error as Error).message}</p>
          )}
        </SheetContent>
      </Sheet>

      {/* Create Sheet */}
      <Sheet open={showCreate} onOpenChange={setShowCreate}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader className="mb-4">
            <SheetTitle>Ajouter un lieu</SheetTitle>
            <SheetDescription>Remplissez les informations pour créer un nouveau lieu.</SheetDescription>
          </SheetHeader>
          <VenueForm
            loading={createMut.isPending}
            onCancel={() => setShowCreate(false)}
            onSubmit={(data) => createMut.mutate(data)}
          />
          {createMut.isError && (
            <p className="text-xs text-destructive mt-2">{(createMut.error as Error).message}</p>
          )}
        </SheetContent>
      </Sheet>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce lieu ?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-semibold text-foreground">"{deleteTarget?.name}"</span> sera supprimé définitivement.
              Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteMut.mutate(deleteTarget.id)}
            >
              {deleteMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
