import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  Plus, Search, SlidersHorizontal, Eye, Pencil, MoreHorizontal,
  Users, CalendarClock, PlayCircle, CheckCircle2, TrendingUp,
  ChevronLeft, ChevronRight, Loader2, AlertCircle, Trash2, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/evenements")({
  component: EvenementsPage,
  head: () => ({
    meta: [
      { title: "Gestion Événements — AI EVENT" },
      { name: "description", content: "Gérez tous vos événements professionnels." },
    ],
  }),
});

interface Event {
  id: number;
  name: string;
  description?: string;
  event_type?: string;
  start_date?: string;
  end_date?: string;
  languages?: string[];
  logo_url?: string;
  cover_image_url?: string;
  status?: string;
  is_free?: boolean;
  venues?: Array<{ id: number; name?: string }>;
  [key: string]: unknown;
}

interface EventsResponse {
  list: Event[];
  pageInfo?: { totalRows: number; page: number; pageSize: number; isFirstPage: boolean; isLastPage: boolean };
}

async function fetchEvents(): Promise<EventsResponse> {
  const raw = await apiRequest<Event[] | EventsResponse>(`/api/v1/events?limit=100`);
  if (Array.isArray(raw)) return { list: raw };
  return raw as EventsResponse;
}

interface Organization { id: number; name?: string; [key: string]: unknown }

async function fetchOrganizations(): Promise<Organization[]> {
  try {
    const raw = await apiRequest<Organization[] | { list: Organization[] }>("/api/v1/events?limit=100");
    return Array.isArray(raw) ? raw : ((raw as { list: Organization[] }).list ?? []);
  } catch {
    return [];
  }
}

interface VenueOption { id: number; name: string }

async function fetchVenues(): Promise<VenueOption[]> {
  const raw = await apiRequest<VenueOption[] | { list: VenueOption[] }>("/api/v1/venues?limit=100");
  const rows = Array.isArray(raw) ? raw : (raw.list ?? []);
  return rows.map((v) => ({ id: Number(v.id), name: String(v.name ?? `Lieu #${v.id}`) }));
}

async function linkVenue(venueId: number, eventId: number): Promise<void> {
  await smartDbRequest("venues", "PATCH", { id: venueId, events_id: eventId });
}
async function unlinkVenue(venueId: number): Promise<void> {
  await smartDbRequest("venues", "PATCH", { id: venueId, events_id: null });
}

async function createEvent({ data, venueId }: { data: Partial<Event>; venueId?: number | null }): Promise<void> {
  const created = await smartDbRequest("events", "POST", data as Record<string, unknown>) as { id: number };
  if (venueId) await linkVenue(venueId, created.id);
}

async function updateEvent({ id, data, venueId, prevVenueId }: {
  id: number; data: Partial<Event>; venueId?: number | null; prevVenueId?: number | null;
}): Promise<void> {
  await smartDbRequest("events", "PATCH", { id, ...data });
  if (prevVenueId && prevVenueId !== venueId) await unlinkVenue(prevVenueId);
  if (venueId) await linkVenue(venueId, id);
}

async function deleteEvent(id: number): Promise<void> {
  await smartDbRequest("events", "DELETE", { id });
}

const STATUS_LABELS: Record<string, string> = {
  draft: "Brouillon", published: "Publié", ongoing: "En cours", closed: "Clôturé", archived: "Archivé",
};
const TYPE_LABELS: Record<string, string> = {
  conference: "Conférence", salon: "Salon", forum: "Forum", hybrid: "Hybride",
};
const LANGUAGE_OPTIONS = ["fr", "en", "ar", "es", "de", "pt"];

function formatDate(iso?: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}
function getEventDate(e: Event): string {
  if (!e.start_date) return "—";
  return `${formatDate(e.start_date)}${e.end_date ? ` — ${formatDate(e.end_date)}` : ""}`;
}
function getEventLocation(e: Event): string {
  return e.venues?.[0]?.name || "—";
}

const statusStyles: Record<string, string> = {
  ongoing: "bg-emerald-500/10 text-emerald-600 ring-1 ring-inset ring-emerald-500/20",
  published: "bg-sky-500/10 text-sky-600 ring-1 ring-inset ring-sky-500/20",
  draft: "bg-amber-500/10 text-amber-600 ring-1 ring-inset ring-amber-500/20",
  closed: "bg-muted text-muted-foreground ring-1 ring-inset ring-border",
  archived: "bg-muted text-muted-foreground ring-1 ring-inset ring-border",
};
const toneStyles: Record<string, string> = {
  primary: "bg-primary/10 text-primary", blue: "bg-sky-500/10 text-sky-600",
  green: "bg-emerald-500/10 text-emerald-600", gray: "bg-muted text-muted-foreground",
  amber: "bg-amber-500/10 text-amber-600",
};

function Thumbnail({ name }: { name: string }) {
  const initials = name.split(" ").filter((w) => w.length > 0).slice(0, 2).map((w) => w[0].toUpperCase()).join("");
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-primary/20 to-primary-glow/20 text-xs font-semibold text-primary">
      {initials || "EV"}
    </div>
  );
}

// ─── Event Form (create + edit) ───────────────────────────────────────────────
interface EventFormProps {
  initial?: Partial<Event>;
  onSubmit: (data: Partial<Event>, venueId?: number | null) => void;
  onCancel: () => void;
  loading: boolean;
}

function EventForm({ initial = {}, onSubmit, onCancel, loading }: EventFormProps) {
  const qc = useQueryClient();
  const [form, setForm] = useState<Partial<Event>>({
    name: "", event_type: "conference", status: "draft", languages: ["fr"],
    start_date: "", end_date: "", is_free: false,
    description: "",
    ...initial,
  });
  const [venueId, setVenueId] = useState<number | undefined>(initial.venues?.[0]?.id);
  const [showNewVenue, setShowNewVenue] = useState(false);
  const [newVenue, setNewVenue] = useState({ name: "", city: "", address: "", total_capacity: "", total_surface_sqm: "" });

  const { data: venues = [], isLoading: venuesLoading } = useQuery({
    queryKey: ["venue-options"],
    queryFn: fetchVenues,
    staleTime: 5 * 60 * 1000,
  });

  const createVenueMut = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = { name: newVenue.name };
      if (newVenue.city) payload.city = newVenue.city;
      if (newVenue.address) payload.address = newVenue.address;
      if (newVenue.total_capacity) payload.total_capacity = newVenue.total_capacity;
      if (newVenue.total_surface_sqm) payload.total_surface_sqm = newVenue.total_surface_sqm;
      return smartDbRequest("venues", "POST", payload) as Promise<{ id: number; name: string }>;
    },
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ["venue-options"] });
      setVenueId(created.id);
      setShowNewVenue(false);
      setNewVenue({ name: "", city: "", address: "", total_capacity: "", total_surface_sqm: "" });
    },
  });

  function set(key: keyof Event, value: unknown) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = { ...form };
    delete payload.venues;
    if (!payload.start_date) delete payload.start_date;
    if (!payload.end_date) delete payload.end_date;
    if (!payload.description) delete payload.description;
    onSubmit(payload, venueId ?? null);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 py-2">
      {/* Name */}
      <div className="grid gap-1.5">
        <Label htmlFor="name">Nom de l'événement *</Label>
        <Input id="name" value={form.name ?? ""} required placeholder="Ex: SIAM 2027"
          onChange={(e) => set("name", e.target.value)} />
      </div>

      {/* Lieu */}
      <div className="grid gap-1.5">
        <div className="flex items-center justify-between">
          <Label>Lieu</Label>
          <button type="button" className="text-xs font-medium text-primary hover:underline"
            onClick={() => setShowNewVenue((v) => !v)}>
            {showNewVenue ? "Annuler" : "+ Nouveau lieu"}
          </button>
        </div>
        <Select
          value={venueId != null ? String(venueId) : "none"}
          onValueChange={(v) => setVenueId(v === "none" ? undefined : Number(v))}
        >
          <SelectTrigger><SelectValue placeholder={venuesLoading ? "Chargement…" : "Sélectionner un lieu"} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Aucun lieu</SelectItem>
            {venues.map((v) => (
              <SelectItem key={v.id} value={String(v.id)}>{v.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {showNewVenue && (
          <div className="grid gap-3 rounded-lg border border-border p-3 mt-1"
            onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }}>
            <div className="grid gap-1.5">
              <Label htmlFor="nv-name" className="text-xs">Nom du lieu *</Label>
              <Input id="nv-name" className="h-8 text-sm" placeholder="Ex: Palais des Congrès"
                value={newVenue.name} onChange={(e) => setNewVenue((v) => ({ ...v, name: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="nv-city" className="text-xs">Ville</Label>
                <Input id="nv-city" className="h-8 text-sm" value={newVenue.city}
                  onChange={(e) => setNewVenue((v) => ({ ...v, city: e.target.value }))} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="nv-address" className="text-xs">Adresse</Label>
                <Input id="nv-address" className="h-8 text-sm" value={newVenue.address}
                  onChange={(e) => setNewVenue((v) => ({ ...v, address: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="nv-capacity" className="text-xs">Capacité</Label>
                <Input id="nv-capacity" type="number" min="0" className="h-8 text-sm" value={newVenue.total_capacity}
                  onChange={(e) => setNewVenue((v) => ({ ...v, total_capacity: e.target.value }))} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="nv-surface" className="text-xs">Surface (m²)</Label>
                <Input id="nv-surface" type="number" min="0" step="0.01" className="h-8 text-sm" value={newVenue.total_surface_sqm}
                  onChange={(e) => setNewVenue((v) => ({ ...v, total_surface_sqm: e.target.value }))} />
              </div>
            </div>
            {createVenueMut.isError && (
              <p className="text-xs text-destructive">{(createVenueMut.error as Error).message}</p>
            )}
            <div className="flex justify-end">
              <Button type="button" size="sm" className="h-8 text-xs bg-gradient-primary text-primary-foreground"
                disabled={!newVenue.name || createVenueMut.isPending}
                onClick={() => createVenueMut.mutate()}>
                {createVenueMut.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
                Créer le lieu
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Type + Status */}
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label>Type</Label>
          <Select value={form.event_type ?? "conference"} onValueChange={(v) => set("event_type", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="conference">Conférence</SelectItem>
              <SelectItem value="salon">Salon</SelectItem>
              <SelectItem value="forum">Forum</SelectItem>
              <SelectItem value="hybrid">Hybride</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label>Statut</Label>
          <Select value={form.status ?? "draft"} onValueChange={(v) => set("status", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">Brouillon</SelectItem>
              <SelectItem value="published">Publié</SelectItem>
              <SelectItem value="ongoing">En cours</SelectItem>
              <SelectItem value="closed">Clôturé</SelectItem>
              <SelectItem value="archived">Archivé</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Dates */}
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="start_date">Date de début</Label>
          <Input id="start_date" type="date" value={(form.start_date ?? "").slice(0, 10)}
            onChange={(e) => set("start_date", e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="end_date">Date de fin</Label>
          <Input id="end_date" type="date" value={(form.end_date ?? "").slice(0, 10)}
            onChange={(e) => set("end_date", e.target.value)} />
        </div>
      </div>

      {/* Languages + Free */}
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label>Langue(s)</Label>
          <div className="flex flex-wrap gap-2">
            {LANGUAGE_OPTIONS.map((v) => {
              const langs = form.languages ?? [];
              const active = langs.includes(v);
              return (
                <button key={v} type="button"
                  onClick={() => {
                    const next = active ? langs.filter((l) => l !== v) : [...langs, v];
                    set("languages", next);
                  }}
                  className={cn(
                    "rounded-md border px-2.5 py-1.5 text-sm font-medium uppercase transition-colors",
                    active
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-card text-muted-foreground hover:border-primary/40",
                  )}
                >
                  {v}
                </button>
              );
            })}
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label>Accès</Label>
          <button type="button" onClick={() => set("is_free", !form.is_free)}
            className={cn(
              "rounded-md border py-2 text-sm font-medium transition-colors",
              form.is_free
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-card text-muted-foreground hover:border-primary/40",
            )}
          >
            {form.is_free ? "Gratuit" : "Payant"}
          </button>
        </div>
      </div>

      {/* Description */}
      <div className="grid gap-1.5">
        <Label htmlFor="description">Description</Label>
        <Textarea id="description" rows={3} placeholder="Décrivez l'événement…"
          value={form.description ?? ""}
          onChange={(e) => set("description", e.target.value)}
          className="resize-none" />
      </div>

      <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
        <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>Annuler</Button>
        <Button type="submit" disabled={loading} className="bg-gradient-primary text-primary-foreground shadow-glow-sm">
          {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {initial.id ? "Enregistrer" : "Créer l'événement"}
        </Button>
      </div>
    </form>
  );
}

// ─── Event Detail View ─────────────────────────────────────────────────────────
function EventDetail({ event }: { event: Event }) {
  const status = event.status ?? "draft";
  return (
    <div className="space-y-5 py-2">
      <div className="flex items-center gap-3">
        <Thumbnail name={event.name} />
        <div>
          <p className="font-semibold text-foreground">{event.name}</p>
          <p className="text-xs text-muted-foreground capitalize">{TYPE_LABELS[event.event_type ?? ""] ?? event.event_type ?? "—"}</p>
        </div>
        <span className={cn("ml-auto inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium", statusStyles[status] ?? "bg-muted text-muted-foreground")}>
          {STATUS_LABELS[status] ?? status}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        {[
          { label: "Date début", value: formatDate(event.start_date) },
          { label: "Date fin", value: formatDate(event.end_date) },
          { label: "Lieu", value: getEventLocation(event) },
          { label: "Accès", value: event.is_free ? "Gratuit" : "Payant" },
          { label: "Langue(s)", value: event.languages?.length ? event.languages.map(l => l.toUpperCase()).join(" · ") : "—" },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-lg bg-muted/40 px-3 py-2">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
            <p className="font-medium text-foreground mt-0.5 truncate">{value}</p>
          </div>
        ))}
      </div>

      {event.description && (
        <div className="rounded-lg bg-muted/40 px-3 py-2">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Description</p>
          <p className="text-sm text-foreground leading-relaxed">{event.description}</p>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
function EvenementsPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const [viewEvent, setViewEvent] = useState<Event | null>(null);
  const [editEvent, setEditEvent] = useState<Event | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Event | null>(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["events"],
    queryFn: fetchEvents,
  });

  const createMut = useMutation({
    mutationFn: createEvent,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["events"] });
      qc.invalidateQueries({ queryKey: ["venue-options"] });
      setShowCreate(false);
    },
  });

  const updateMut = useMutation({
    mutationFn: updateEvent,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["events"] });
      qc.invalidateQueries({ queryKey: ["venue-options"] });
      setEditEvent(null);
    },
  });

  const deleteMut = useMutation({
    mutationFn: deleteEvent,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["events"] }); setDeleteTarget(null); },
  });

  const events = data?.list ?? [];
  const totalRows = data?.pageInfo?.totalRows ?? events.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / 20));

  const filtered = events.filter((e) => {
    const matchesSearch = !search || e.name.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || e.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const statusCounts = {
    enCours: events.filter((e) => e.status === "ongoing").length,
    aVenir: events.filter((e) => ["published", "draft"].includes(e.status ?? "")).length,
    termines: events.filter((e) => ["closed", "archived"].includes(e.status ?? "")).length,
    gratuits: events.filter((e) => e.is_free).length,
  };

  const stats = [
    { label: "Total événements", value: isLoading ? "…" : String(totalRows), icon: Users, tone: "primary" },
    { label: "À venir", value: isLoading ? "…" : String(statusCounts.aVenir), icon: CalendarClock, tone: "blue" },
    { label: "En cours", value: isLoading ? "…" : String(statusCounts.enCours), icon: PlayCircle, tone: "green" },
    { label: "Terminés", value: isLoading ? "…" : String(statusCounts.termines), icon: CheckCircle2, tone: "gray" },
    { label: "Gratuits", value: isLoading ? "…" : String(statusCounts.gratuits), icon: TrendingUp, tone: "amber" },
  ];

  return (
    <div className="p-6 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Gestion Événements</h1>
          <p className="text-sm text-muted-foreground mt-1">Liste des événements</p>
        </div>
        <Button
          className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-glow"
          onClick={() => setShowCreate(true)}
        >
          <Plus className="h-4 w-4" /> Créer un événement
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border border-border bg-card p-4 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between">
              <div className={cn("flex h-9 w-9 items-center justify-center rounded-lg", toneStyles[s.tone])}>
                <s.icon className="h-4 w-4" />
              </div>
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
          <Input placeholder="Rechercher un événement..." className="h-10 pl-9 bg-card"
            value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="w-[160px] h-10 bg-card">
            <SelectValue placeholder="Tous les statuts" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les statuts</SelectItem>
            <SelectItem value="ongoing">En cours</SelectItem>
            <SelectItem value="published">Publié</SelectItem>
            <SelectItem value="draft">Brouillon</SelectItem>
            <SelectItem value="closed">Clôturé</SelectItem>
            <SelectItem value="archived">Archivé</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" className="h-10 bg-card" onClick={() => { setSearch(""); setStatusFilter("all"); setPage(1); }}>
          <SlidersHorizontal className="h-4 w-4" /> Réinitialiser
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-20 gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Chargement des événements…</span>
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
                  {["Événement", "Date", "Lieu", "Type", "Statut", "Actions"].map((h) => (
                    <TableHead key={h} className={cn(
                      "text-xs font-semibold uppercase tracking-wider text-muted-foreground",
                      h === "Actions" ? "text-right" : "",
                    )}>{h}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12 text-muted-foreground text-sm">
                      Aucun événement trouvé
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((ev) => {
                    const status = ev.status ?? "draft";
                    const statusClass = statusStyles[status] ?? "bg-muted text-muted-foreground ring-1 ring-inset ring-border";
                    return (
                      <TableRow key={ev.id} className="hover:bg-muted/30 cursor-pointer" onClick={() => setViewEvent(ev)}>
                        <TableCell className="py-3">
                          <div className="flex items-center gap-3">
                            <Thumbnail name={ev.name} />
                            <span className="text-sm font-medium text-foreground">{ev.name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{getEventDate(ev)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{getEventLocation(ev)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground capitalize">
                          {TYPE_LABELS[ev.event_type ?? ""] ?? ev.event_type ?? "—"}
                        </TableCell>
                        <TableCell>
                          <span className={cn("inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium", statusClass)}>
                            {STATUS_LABELS[status] ?? status}
                          </span>
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                            <button
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                              onClick={() => setViewEvent(ev)}
                              title="Voir"
                            >
                              <Eye className="h-4 w-4" />
                            </button>
                            <button
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                              onClick={() => setEditEvent(ev)}
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
                                <DropdownMenuItem onClick={() => setViewEvent(ev)}>
                                  <Eye className="h-4 w-4 mr-2" /> Voir
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setEditEvent(ev)}>
                                  <Pencil className="h-4 w-4 mr-2" /> Modifier
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onClick={() => setDeleteTarget(ev)}
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
                {filtered.length} événement{filtered.length !== 1 ? "s" : ""} affiché{filtered.length !== 1 ? "s" : ""}
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
      <Sheet open={!!viewEvent} onOpenChange={(o) => !o && setViewEvent(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader className="mb-4">
            <SheetTitle>Détails de l'événement</SheetTitle>
            <SheetDescription>Informations complètes sur cet événement.</SheetDescription>
          </SheetHeader>
          {viewEvent && (
            <>
              <EventDetail event={viewEvent} />
              <div className="flex gap-2 mt-6 pt-4 border-t border-border">
                <Button variant="outline" className="flex-1" onClick={() => setViewEvent(null)}>
                  <X className="h-4 w-4 mr-2" /> Fermer
                </Button>
                <Button className="flex-1 bg-gradient-primary text-primary-foreground" onClick={() => { setEditEvent(viewEvent); setViewEvent(null); }}>
                  <Pencil className="h-4 w-4 mr-2" /> Modifier
                </Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Edit Sheet */}
      <Sheet open={!!editEvent} onOpenChange={(o) => !o && setEditEvent(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader className="mb-4">
            <SheetTitle>Modifier l'événement</SheetTitle>
            <SheetDescription>Mettez à jour les informations de cet événement.</SheetDescription>
          </SheetHeader>
          {editEvent && (
            <EventForm
              initial={editEvent}
              loading={updateMut.isPending}
              onCancel={() => setEditEvent(null)}
              onSubmit={(data, venueId) => updateMut.mutate({ id: editEvent.id, data, venueId, prevVenueId: editEvent.venues?.[0]?.id })}
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
            <SheetTitle>Créer un événement</SheetTitle>
            <SheetDescription>Remplissez les informations pour créer un nouvel événement.</SheetDescription>
          </SheetHeader>
          <EventForm
            loading={createMut.isPending}
            onCancel={() => setShowCreate(false)}
            onSubmit={(data, venueId) => createMut.mutate({ data, venueId })}
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
            <AlertDialogTitle>Supprimer cet événement ?</AlertDialogTitle>
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
