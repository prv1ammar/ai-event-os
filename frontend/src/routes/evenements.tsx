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
  slug?: string;
  description?: string;
  type?: string;
  start_date?: string;
  end_date?: string;
  country?: string;
  city?: string;
  venue_name?: string;
  status?: string;
  visibility?: string;
  expected_visitors?: number;
  expected_exhibitors?: number;
  budget?: string | number;
  language?: string;
  organization_id?: number;
  [key: string]: unknown;
}

interface NocoDBResponse {
  list: Event[];
  pageInfo?: { totalRows: number; page: number; pageSize: number; isFirstPage: boolean; isLastPage: boolean };
}

async function fetchEvents(): Promise<NocoDBResponse> {
  const raw = await apiRequest<Event[] | NocoDBResponse>(`/api/v1/events?limit=100`);
  if (Array.isArray(raw)) return { list: raw };
  return raw as NocoDBResponse;
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

async function createEvent(data: Partial<Event>): Promise<void> {
  await smartDbRequest("events", "POST", data as Record<string, unknown>);
}

async function updateEvent({ id, data }: { id: number; data: Partial<Event> }): Promise<void> {
  await smartDbRequest("events", "PATCH", { id, ...data });
}

async function deleteEvent(id: number): Promise<void> {
  await smartDbRequest("events", "DELETE", { id });
}

const STATUS_LABELS: Record<string, string> = {
  draft: "Brouillon", published: "Publié", live: "En cours", closed: "Clôturé",
};
const TYPE_LABELS: Record<string, string> = {
  conference: "Conférence", trade_fair: "Foire commerciale", summit: "Sommet",
  exhibition: "Exposition", forum: "Forum", workshop: "Atelier",
};

function formatDate(iso?: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}
function getEventDate(e: Event): string {
  if (!e.start_date) return "—";
  return `${formatDate(e.start_date)}${e.end_date ? ` — ${formatDate(e.end_date)}` : ""}`;
}
function getEventLocation(e: Event): string {
  return [e.venue_name, e.city, e.country].filter(Boolean).join(", ") || "—";
}
function getBudget(e: Event): string {
  if (!e.budget) return "—";
  const n = Number(e.budget);
  if (!isNaN(n) && n > 0) {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)} MDH`;
    if (n >= 1_000) return `${Math.round(n / 1_000)}K MAD`;
    return `${n} MAD`;
  }
  return String(e.budget);
}

const statusStyles: Record<string, string> = {
  live: "bg-emerald-500/10 text-emerald-600 ring-1 ring-inset ring-emerald-500/20",
  published: "bg-sky-500/10 text-sky-600 ring-1 ring-inset ring-sky-500/20",
  draft: "bg-amber-500/10 text-amber-600 ring-1 ring-inset ring-amber-500/20",
  closed: "bg-muted text-muted-foreground ring-1 ring-inset ring-border",
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
  onSubmit: (data: Partial<Event>) => void;
  onCancel: () => void;
  loading: boolean;
}

function slugify(name: string): string {
  return name.toLowerCase().trim()
    .replace(/[àâä]/g, "a").replace(/[éèêë]/g, "e").replace(/[îï]/g, "i")
    .replace(/[ôö]/g, "o").replace(/[ùûü]/g, "u").replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function EventForm({ initial = {}, onSubmit, onCancel, loading }: EventFormProps) {
  const { data: organizations = [] } = useQuery({
    queryKey: ["organizations"],
    queryFn: fetchOrganizations,
    staleTime: 5 * 60 * 1000,
  });

  const [form, setForm] = useState<Partial<Event>>({
    name: "", slug: "", type: "conference", status: "draft", language: "fr",
    visibility: "public",
    start_date: "", end_date: "", venue_name: "", city: "", country: "",
    expected_visitors: undefined, expected_exhibitors: undefined, budget: "",
    description: "",
    ...initial,
  });

  const [slugManual, setSlugManual] = useState(!!initial.slug);

  function set(key: keyof Event, value: unknown) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleNameChange(name: string) {
    set("name", name);
    if (!slugManual) set("slug", slugify(name));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = { ...form };
    if (!payload.start_date) delete payload.start_date;
    if (!payload.end_date) delete payload.end_date;
    if (!payload.slug) delete payload.slug;
    if (!payload.description) delete payload.description;
    onSubmit(payload);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 py-2">
      {/* Organization */}
      {organizations.length > 0 && (
        <div className="grid gap-1.5">
          <Label>Organisation</Label>
          <Select
            value={String(form.organization_id ?? "")}
            onValueChange={(v) => set("organization_id", Number(v))}
          >
            <SelectTrigger><SelectValue placeholder="Sélectionner une organisation" /></SelectTrigger>
            <SelectContent>
              {organizations.map((o) => (
                <SelectItem key={o.id} value={String(o.id)}>
                  {o.name ?? `Organisation #${o.id}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Name + slug */}
      <div className="grid gap-1.5">
        <Label htmlFor="name">Nom de l'événement *</Label>
        <Input id="name" value={form.name ?? ""} required placeholder="Ex: SIAM 2027"
          onChange={(e) => handleNameChange(e.target.value)} />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="slug">
          Slug
          <span className="ml-2 text-[10px] text-muted-foreground font-normal">(URL, généré automatiquement)</span>
        </Label>
        <Input id="slug" value={form.slug ?? ""} placeholder="ex: siam-2027"
          onChange={(e) => { setSlugManual(true); set("slug", e.target.value); }} />
      </div>

      {/* Type + Status */}
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label>Type</Label>
          <Select value={form.type ?? "conference"} onValueChange={(v) => set("type", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="conference">Conférence</SelectItem>
              <SelectItem value="trade_fair">Foire commerciale</SelectItem>
              <SelectItem value="summit">Sommet</SelectItem>
              <SelectItem value="exhibition">Exposition</SelectItem>
              <SelectItem value="forum">Forum</SelectItem>
              <SelectItem value="workshop">Atelier</SelectItem>
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
              <SelectItem value="live">En cours</SelectItem>
              <SelectItem value="closed">Clôturé</SelectItem>
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

      {/* Location */}
      <div className="grid gap-1.5">
        <Label htmlFor="venue_name">Lieu / Salle</Label>
        <Input id="venue_name" value={form.venue_name ?? ""} placeholder="Ex: Foire Internationale de Casablanca"
          onChange={(e) => set("venue_name", e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="city">Ville</Label>
          <Input id="city" value={form.city ?? ""} placeholder="Casablanca"
            onChange={(e) => set("city", e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="country">Pays</Label>
          <Input id="country" value={form.country ?? ""} placeholder="Morocco"
            onChange={(e) => set("country", e.target.value)} />
        </div>
      </div>

      {/* Visibility + Language */}
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label>Visibilité</Label>
          <Select value={form.visibility ?? "public"} onValueChange={(v) => set("visibility", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="public">Public</SelectItem>
              <SelectItem value="private">Privé</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label>Langue(s)</Label>
          <div className="flex gap-2">
            {[{ v: "fr", label: "FR" }, { v: "ar", label: "AR" }, { v: "en", label: "EN" }].map(({ v, label }) => {
              const langs = (form.language ?? "").split(",").filter(Boolean);
              const active = langs.includes(v);
              return (
                <button key={v} type="button"
                  onClick={() => {
                    const next = active ? langs.filter((l) => l !== v) : [...langs, v];
                    set("language", next.join(","));
                  }}
                  className={cn(
                    "flex-1 rounded-md border py-2 text-sm font-medium transition-colors",
                    active
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-card text-muted-foreground hover:border-primary/40",
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Numbers + Budget */}
      <div className="grid grid-cols-3 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="exp_vis">Visiteurs attendus</Label>
          <Input id="exp_vis" type="number" value={form.expected_visitors ?? ""}
            onChange={(e) => set("expected_visitors", e.target.value ? Number(e.target.value) : undefined)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="exp_exp">Exposants attendus</Label>
          <Input id="exp_exp" type="number" value={form.expected_exhibitors ?? ""}
            onChange={(e) => set("expected_exhibitors", e.target.value ? Number(e.target.value) : undefined)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="budget">Budget</Label>
          <Input id="budget" type="text" placeholder="ex: 250000 MAD" value={String(form.budget ?? "")}
            onChange={(e) => set("budget", e.target.value)} />
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
          <p className="text-xs text-muted-foreground capitalize">{TYPE_LABELS[event.type ?? ""] ?? event.type ?? "—"}</p>
        </div>
        <span className={cn("ml-auto inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium", statusStyles[status] ?? "bg-muted text-muted-foreground")}>
          {STATUS_LABELS[status] ?? status}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        {[
          { label: "Date début", value: formatDate(event.start_date) },
          { label: "Date fin", value: formatDate(event.end_date) },
          { label: "Lieu", value: event.venue_name ?? "—" },
          { label: "Ville", value: event.city ?? "—" },
          { label: "Pays", value: event.country ?? "—" },
          { label: "Langue(s)", value: event.language ? event.language.split(",").map(l => l.toUpperCase()).join(" · ") : "—" },
          { label: "Visibilité", value: event.visibility ?? "—" },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-lg bg-muted/40 px-3 py-2">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
            <p className="font-medium text-foreground mt-0.5 truncate">{value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-3 text-sm">
        {[
          { label: "Visiteurs attendus", value: event.expected_visitors?.toLocaleString("fr-FR") ?? "—" },
          { label: "Exposants attendus", value: event.expected_exhibitors?.toLocaleString("fr-FR") ?? "—" },
          { label: "Budget", value: getBudget(event) },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-lg bg-muted/40 px-3 py-2">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
            <p className="font-semibold text-foreground mt-0.5">{value}</p>
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
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["events"] }); setShowCreate(false); },
  });

  const updateMut = useMutation({
    mutationFn: updateEvent,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["events"] }); setEditEvent(null); },
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
    enCours: events.filter((e) => e.status === "live").length,
    aVenir: events.filter((e) => ["published", "draft"].includes(e.status ?? "")).length,
    termines: events.filter((e) => e.status === "closed").length,
  };

  const stats = [
    { label: "Total événements", value: isLoading ? "…" : String(totalRows), icon: Users, tone: "primary" },
    { label: "À venir", value: isLoading ? "…" : String(statusCounts.aVenir), icon: CalendarClock, tone: "blue" },
    { label: "En cours", value: isLoading ? "…" : String(statusCounts.enCours), icon: PlayCircle, tone: "green" },
    { label: "Terminés", value: isLoading ? "…" : String(statusCounts.termines), icon: CheckCircle2, tone: "gray" },
    { label: "CA total généré", value: "—", icon: TrendingUp, tone: "amber" },
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
            <SelectItem value="live">En cours</SelectItem>
            <SelectItem value="published">Publié</SelectItem>
            <SelectItem value="draft">Brouillon</SelectItem>
            <SelectItem value="closed">Clôturé</SelectItem>
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
                  {["Événement", "Date", "Lieu", "Statut", "Exposants", "Visiteurs", "CA généré", "Actions"].map((h) => (
                    <TableHead key={h} className={cn(
                      "text-xs font-semibold uppercase tracking-wider text-muted-foreground",
                      ["Exposants", "Visiteurs", "CA généré", "Actions"].includes(h) ? "text-right" : "",
                    )}>{h}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-12 text-muted-foreground text-sm">
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
                            <div>
                              <span className="text-sm font-medium text-foreground">{ev.name}</span>
                              {ev.type && (
                                <span className="block text-xs text-muted-foreground capitalize">
                                  {TYPE_LABELS[ev.type] ?? ev.type.replace("_", " ")}
                                </span>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{getEventDate(ev)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{getEventLocation(ev)}</TableCell>
                        <TableCell>
                          <span className={cn("inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium", statusClass)}>
                            {STATUS_LABELS[status] ?? status}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm font-medium text-foreground text-right tabular-nums">
                          {ev.expected_exhibitors?.toLocaleString() ?? "—"}
                        </TableCell>
                        <TableCell className="text-sm font-medium text-foreground text-right tabular-nums">
                          {ev.expected_visitors?.toLocaleString() ?? "—"}
                        </TableCell>
                        <TableCell className="text-sm font-semibold text-foreground text-right tabular-nums">
                          {getBudget(ev)}
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
              onSubmit={(data) => updateMut.mutate({ id: editEvent.id, data })}
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
