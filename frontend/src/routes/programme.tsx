import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  Plus, Search, Clock, MapPin, Users, Mic2, Filter,
  Pencil, Trash2, Loader2, AlertCircle, X, Eye,
} from "lucide-react";
import { PageShell, Surface } from "@/components/PageShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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

export const Route = createFileRoute("/programme")({
  component: Programme,
  head: () => ({
    meta: [
      { title: "Programme — AI EVENT OS" },
      { name: "description", content: "Agenda, sessions et speakers de l'événement." },
    ],
  }),
});

// ── Types ─────────────────────────────────────────────────────────────────────

interface Session {
  id?: number;
  title: string;
  description?: string;
  type?: string;
  room?: string;
  capacity?: number;
  start_time?: string;
  end_time?: string;
  event_id?: number;
  status?: string;
  language?: string;
  [key: string]: unknown;
}

type SessionType = "keynote" | "panel" | "workshop" | "roundtable" | "networking" | "demo";

const TYPE_STYLES: Record<string, string> = {
  keynote:    "bg-primary/10 text-primary ring-primary/20",
  panel:      "bg-sky-500/10 text-sky-600 ring-sky-500/20",
  workshop:   "bg-emerald-500/10 text-emerald-600 ring-emerald-500/20",
  roundtable: "bg-amber-500/10 text-amber-600 ring-amber-500/20",
  networking: "bg-violet-500/10 text-violet-600 ring-violet-500/20",
  demo:       "bg-rose-500/10 text-rose-600 ring-rose-500/20",
};

const TYPE_LABELS: Record<string, string> = {
  keynote:    "Keynote",
  panel:      "Panel",
  workshop:   "Workshop",
  roundtable: "Table ronde",
  networking: "Networking",
  demo:       "Démo",
};

const ALL_TYPES = Object.keys(TYPE_LABELS) as SessionType[];

interface EventOption { id: number; name: string }

// ── API helpers ───────────────────────────────────────────────────────────────

async function fetchEvents(): Promise<EventOption[]> {
  const raw = await apiRequest<EventOption[] | { list: EventOption[] }>("/api/v1/events?limit=100");
  const list = Array.isArray(raw) ? raw : (raw.list ?? []);
  return list;
}

async function fetchSessions(): Promise<Session[]> {
  const raw = await apiRequest<Session[] | { list: Session[] }>("/api/v1/sessions?limit=100");
  return Array.isArray(raw) ? raw : (raw.list ?? []);
}

async function createSession(data: Partial<Session>): Promise<void> {
  await smartDbRequest("sessions", "POST", data as Record<string, unknown>);
}

async function updateSession({ id, data }: { id: number; data: Partial<Session> }): Promise<void> {
  await smartDbRequest("sessions", "PATCH", { id, ...data } as Record<string, unknown>);
}

async function deleteSession(id: number): Promise<void> {
  await smartDbRequest("sessions", "DELETE", { id });
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function fmtTime(iso?: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function fmtDate(iso?: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
}

function fmtDateKey(iso?: string): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

function fmtDuration(start?: string, end?: string): string {
  if (!start || !end) return "";
  const diff = new Date(end).getTime() - new Date(start).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
}

function toDatetimeLocal(iso?: string): string {
  if (!iso) return "";
  return iso.slice(0, 16);
}

interface DayTab { dateKey: string; label: string; dateLabel: string; count: number }

function buildDayTabs(sessions: Session[]): DayTab[] {
  const map = new Map<string, number>();
  for (const s of sessions) {
    if (!s.start_time) continue;
    const key = fmtDateKey(s.start_time);
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, count], i) => ({
      dateKey: key,
      label: `Jour ${i + 1}`,
      dateLabel: fmtDate(key),
      count,
    }));
}

// ── Session Form ──────────────────────────────────────────────────────────────

interface SessionFormProps {
  initial?: Partial<Session>;
  onSubmit: (data: Partial<Session>) => void;
  onCancel: () => void;
  loading: boolean;
  activeEventId?: number;
}

function SessionForm({ initial = {}, onSubmit, onCancel, loading, activeEventId }: SessionFormProps) {
  const { data: events = [], isLoading: eventsLoading } = useQuery({
    queryKey: ["events-options"],
    queryFn: fetchEvents,
    staleTime: 5 * 60 * 1000,
  });

  const [form, setForm] = useState<Partial<Session>>({
    title: "",
    type: "keynote",
    room: "",
    capacity: undefined,
    start_time: "",
    end_time: "",
    description: "",
    status: "scheduled",
    language: "FR",
    event_id: activeEventId,
    ...initial,
  });

  function set(key: keyof Session, value: unknown) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = { ...form };
    if (!payload.description) delete payload.description;
    if (!payload.room) delete payload.room;
    if (!payload.capacity) delete payload.capacity;
    onSubmit(payload);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 py-2">
      {/* Event assignment */}
      <div className="grid gap-1.5">
        <Label>Événement *</Label>
        <Select
          required
          value={form.event_id != null ? String(form.event_id) : ""}
          onValueChange={(v) => set("event_id", Number(v))}
        >
          <SelectTrigger>
            <SelectValue placeholder={eventsLoading ? "Chargement…" : "Sélectionner un événement"} />
          </SelectTrigger>
          <SelectContent>
            {events.map((ev) => (
              <SelectItem key={ev.id} value={String(ev.id)}>{ev.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="title">Titre *</Label>
        <Input id="title" required value={form.title ?? ""} placeholder="Ex: Keynote d'ouverture"
          onChange={(e) => set("title", e.target.value)} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label>Type</Label>
          <Select value={form.type ?? "keynote"} onValueChange={(v) => set("type", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {ALL_TYPES.map((t) => (
                <SelectItem key={t} value={t}>{TYPE_LABELS[t]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="room">Salle</Label>
          <Input id="room" value={form.room ?? ""} placeholder="Ex: Auditorium A"
            onChange={(e) => set("room", e.target.value)} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="start_time">Début *</Label>
          <Input id="start_time" type="datetime-local" required
            value={toDatetimeLocal(form.start_time as string)}
            onChange={(e) => set("start_time", e.target.value + ":00")} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="end_time">Fin *</Label>
          <Input id="end_time" type="datetime-local" required
            value={toDatetimeLocal(form.end_time as string)}
            onChange={(e) => set("end_time", e.target.value + ":00")} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="capacity">Capacité</Label>
          <Input id="capacity" type="number" min={1} value={form.capacity ?? ""}
            placeholder="Ex: 200"
            onChange={(e) => set("capacity", e.target.value ? Number(e.target.value) : undefined)} />
        </div>
        <div className="grid gap-1.5">
          <Label>Statut</Label>
          <Select value={form.status ?? "scheduled"} onValueChange={(v) => set("status", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="scheduled">Planifiée</SelectItem>
              <SelectItem value="confirmed">Confirmée</SelectItem>
              <SelectItem value="cancelled">Annulée</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label>Langue(s)</Label>
        <div className="flex gap-2">
          {[{ v: "FR", label: "FR" }, { v: "AR", label: "AR" }, { v: "EN", label: "EN" }].map(({ v, label }) => {
            const langs = (form.language ?? "").split("/").filter(Boolean);
            const active = langs.includes(v);
            return (
              <button key={v} type="button"
                onClick={() => {
                  const next = active ? langs.filter((l) => l !== v) : [...langs, v];
                  set("language", next.join("/"));
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

      <div className="grid gap-1.5">
        <Label htmlFor="description">Description</Label>
        <Textarea id="description" rows={3} placeholder="Décrivez la session…"
          value={form.description ?? ""}
          onChange={(e) => set("description", e.target.value)}
          className="resize-none" />
      </div>

      <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
        <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>Annuler</Button>
        <Button type="submit" disabled={loading} className="bg-gradient-primary text-primary-foreground shadow-glow-sm">
          {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {initial.id ? "Enregistrer" : "Créer la session"}
        </Button>
      </div>
    </form>
  );
}

// ── Session Detail ─────────────────────────────────────────────────────────────

function SessionDetail({ session, eventName }: { session: Session; eventName?: string }) {
  const typeKey = session.type ?? "";
  return (
    <div className="space-y-4 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn(
          "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset",
          TYPE_STYLES[typeKey] ?? "bg-muted text-muted-foreground ring-border",
        )}>
          {TYPE_LABELS[typeKey] ?? typeKey}
        </span>
        {session.status && (
          <span className="text-xs text-muted-foreground capitalize">{session.status}</span>
        )}
      </div>

      <p className="font-semibold text-foreground text-base leading-snug">{session.title}</p>

      <div className="grid grid-cols-2 gap-3 text-sm">
        {[
          { label: "Événement", value: eventName ?? "—" },
          { label: "Début", value: session.start_time ? `${fmtDate(session.start_time)} ${fmtTime(session.start_time)}` : "—" },
          { label: "Durée", value: fmtDuration(session.start_time, session.end_time) || "—" },
          { label: "Salle", value: session.room ?? "—" },
          { label: "Capacité", value: session.capacity ? session.capacity.toLocaleString("fr-FR") : "—" },
          { label: "Langue", value: session.language ?? "—" },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-lg bg-muted/40 px-3 py-2">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
            <p className="font-medium text-foreground mt-0.5">{value}</p>
          </div>
        ))}
      </div>

      {session.description && (
        <div className="rounded-lg bg-muted/40 px-3 py-2">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Description</p>
          <p className="text-sm text-foreground leading-relaxed">{session.description}</p>
        </div>
      )}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

function Programme() {
  const qc = useQueryClient();
  const { activeEvent } = useEvent();
  const eventId = activeEvent.id !== "0" ? Number(activeEvent.id) : undefined;

  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [activeTypes, setActiveTypes] = useState<string[]>([]);

  const [showCreate, setShowCreate] = useState(false);
  const [editSession, setEditSession] = useState<Session | null>(null);
  const [viewSession, setViewSession] = useState<Session | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Session | null>(null);

  const { data: allSessions = [], isLoading, isError, error } = useQuery({
    queryKey: ["sessions"],
    queryFn: fetchSessions,
  });

  const { data: eventOptions = [] } = useQuery({
    queryKey: ["events-options"],
    queryFn: fetchEvents,
    staleTime: 5 * 60 * 1000,
  });

  const eventMap = Object.fromEntries(eventOptions.map((e) => [e.id, e.name]));

  const sessions = eventId
    ? allSessions.filter((s) => Number(s.event_id) === eventId)
    : allSessions;

  const createMut = useMutation({
    mutationFn: createSession,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["sessions"] }); setShowCreate(false); },
  });

  const updateMut = useMutation({
    mutationFn: updateSession,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["sessions"] }); setEditSession(null); },
  });

  const deleteMut = useMutation({
    mutationFn: deleteSession,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["sessions"] }); setDeleteTarget(null); },
  });

  const days = buildDayTabs(sessions);

  // Auto-select first day when data loads
  const effectiveDay = selectedDay ?? (days[0]?.dateKey ?? null);

  const filtered = sessions.filter((s) => {
    if (effectiveDay && fmtDateKey(s.start_time) !== effectiveDay) return false;
    if (activeTypes.length > 0 && !activeTypes.includes(s.type ?? "")) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        s.title?.toLowerCase().includes(q) ||
        s.room?.toLowerCase().includes(q) ||
        s.description?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const sortedFiltered = [...filtered].sort((a, b) =>
    (a.start_time ?? "").localeCompare(b.start_time ?? "")
  );

  function toggleType(t: string) {
    setActiveTypes((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]
    );
  }

  const currentDayInfo = days.find((d) => d.dateKey === effectiveDay);

  return (
    <PageShell
      eyebrow="Programme"
      title="Agenda & sessions"
      description="Gérez le programme, les sessions et les speakers de l'événement."
      actions={
        <>
          <Button
            variant="outline"
            size="sm"
            className="h-9"
            onClick={() => { setSearch(""); setActiveTypes([]); setSelectedDay(null); }}
          >
            <Filter className="h-4 w-4" /> Réinitialiser filtres
          </Button>
          <Button
            size="sm"
            className="h-9 bg-gradient-primary text-primary-foreground shadow-glow-sm"
            onClick={() => setShowCreate(true)}
          >
            <Plus className="h-4 w-4" /> Nouvelle session
          </Button>
        </>
      }
    >
      {/* Day selector */}
      {isLoading ? (
        <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Chargement du programme…</span>
        </div>
      ) : isError ? (
        <Surface className="p-6 flex items-center gap-2 text-destructive">
          <AlertCircle className="h-5 w-5" />
          <span className="text-sm">{error instanceof Error ? error.message : "Erreur de chargement"}</span>
        </Surface>
      ) : days.length === 0 ? (
        <Surface className="p-10 flex flex-col items-center gap-3 text-center">
          <p className="text-muted-foreground text-sm">Aucune session planifiée pour cet événement.</p>
          <Button size="sm" onClick={() => setShowCreate(true)} className="bg-gradient-primary text-primary-foreground">
            <Plus className="h-4 w-4" /> Créer la première session
          </Button>
        </Surface>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {days.map((d) => (
              <button
                key={d.dateKey}
                type="button"
                onClick={() => setSelectedDay(d.dateKey)}
                className={cn(
                  "rounded-2xl border border-border/60 p-4 text-left transition-colors hover:border-primary/30 bg-card shadow-card",
                  effectiveDay === d.dateKey && "border-primary/40 ring-1 ring-primary/20 bg-gradient-subtle",
                )}
              >
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{d.label}</p>
                <p className="font-display text-lg font-bold text-foreground mt-1 capitalize">{d.dateLabel}</p>
                <p className="text-xs text-muted-foreground mt-1">{d.count} session{d.count !== 1 ? "s" : ""}</p>
              </button>
            ))}
          </div>

          {/* Search + type filters */}
          <Surface className="p-4 flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Rechercher une session, une salle…"
                className="pl-9 h-9 bg-muted/40 border-transparent"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {ALL_TYPES.map((t) => (
                <span
                  key={t}
                  onClick={() => toggleType(t)}
                  className={cn(
                    "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ring-inset cursor-pointer transition-opacity",
                    TYPE_STYLES[t],
                    activeTypes.length > 0 && !activeTypes.includes(t) && "opacity-40",
                  )}
                >
                  {TYPE_LABELS[t]}
                </span>
              ))}
            </div>
          </Surface>

          {/* Timeline */}
          <Surface className="p-0 overflow-hidden">
            <div className="border-b border-border/60 px-6 py-4 flex items-center justify-between">
              <div>
                <h2 className="font-display font-semibold text-foreground capitalize">
                  {currentDayInfo?.label} — {currentDayInfo?.dateLabel}
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {sortedFiltered.length} session{sortedFiltered.length !== 1 ? "s" : ""}
                  {activeTypes.length > 0 && ` · ${activeTypes.map((t) => TYPE_LABELS[t]).join(", ")}`}
                </p>
              </div>
              <span className="text-xs text-muted-foreground">Heure locale</span>
            </div>

            {sortedFiltered.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
                <p className="text-sm">Aucune session ne correspond aux filtres.</p>
                <button
                  className="text-xs text-primary underline-offset-2 hover:underline"
                  onClick={() => { setSearch(""); setActiveTypes([]); }}
                >
                  Réinitialiser
                </button>
              </div>
            ) : (
              <ul className="divide-y divide-border/60">
                {sortedFiltered.map((s, i) => {
                  const typeKey = s.type ?? "";
                  const pct = s.capacity ? Math.min(100, Math.round((0 / s.capacity) * 100)) : null;
                  return (
                    <li
                      key={s.id ?? i}
                      className="grid gap-3 px-6 py-4 transition-colors hover:bg-muted/30 md:grid-cols-[140px_1fr_auto] md:items-center"
                    >
                      {/* Time */}
                      <div className="flex items-center gap-2 text-sm">
                        <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="font-display font-semibold text-foreground tabular-nums">
                          {fmtTime(s.start_time)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          · {fmtDuration(s.start_time, s.end_time)}
                        </span>
                      </div>

                      {/* Info */}
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium text-foreground">{s.title}</p>
                          <span className={cn(
                            "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset",
                            TYPE_STYLES[typeKey] ?? "bg-muted text-muted-foreground ring-border",
                          )}>
                            {TYPE_LABELS[typeKey] ?? typeKey}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                          {s.event_id && eventMap[s.event_id] && (
                            <span className="font-medium text-primary/80">{eventMap[s.event_id]}</span>
                          )}
                          {s.room && (
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="h-3 w-3" /> {s.room}
                            </span>
                          )}
                          {s.language && (
                            <span className="inline-flex items-center gap-1">
                              <Mic2 className="h-3 w-3" /> {s.language}
                            </span>
                          )}
                        </p>
                      </div>

                      {/* Capacity + actions */}
                      <div className="flex items-center gap-3">
                        {s.capacity != null && (
                          <div className="min-w-[120px]">
                            <div className="flex items-center justify-between text-[11px] mb-1">
                              <span className="inline-flex items-center gap-1 text-muted-foreground">
                                <Users className="h-3 w-3" /> {s.capacity.toLocaleString("fr-FR")} places
                              </span>
                            </div>
                            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                              <div
                                className="h-full rounded-full bg-gradient-primary"
                                style={{ width: `${pct ?? 0}%` }}
                              />
                            </div>
                          </div>
                        )}
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                            onClick={() => setViewSession(s)}
                            title="Voir"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          <button
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                            onClick={() => setEditSession(s)}
                            title="Modifier"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => setDeleteTarget(s)}
                            title="Supprimer"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Surface>
        </>
      )}

      {/* View Sheet */}
      <Sheet open={!!viewSession} onOpenChange={(o) => !o && setViewSession(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader className="mb-4">
            <SheetTitle>Détails de la session</SheetTitle>
            <SheetDescription>Informations complètes sur cette session.</SheetDescription>
          </SheetHeader>
          {viewSession && (
            <>
              <SessionDetail session={viewSession} eventName={viewSession.event_id ? eventMap[viewSession.event_id] : undefined} />
              <div className="flex gap-2 mt-6 pt-4 border-t border-border">
                <Button variant="outline" className="flex-1" onClick={() => setViewSession(null)}>
                  <X className="h-4 w-4 mr-2" /> Fermer
                </Button>
                <Button
                  className="flex-1 bg-gradient-primary text-primary-foreground"
                  onClick={() => { setEditSession(viewSession); setViewSession(null); }}
                >
                  <Pencil className="h-4 w-4 mr-2" /> Modifier
                </Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Create Sheet */}
      <Sheet open={showCreate} onOpenChange={setShowCreate}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader className="mb-4">
            <SheetTitle>Nouvelle session</SheetTitle>
            <SheetDescription>Ajoutez une nouvelle session au programme.</SheetDescription>
          </SheetHeader>
          <SessionForm
            loading={createMut.isPending}
            activeEventId={eventId}
            onCancel={() => setShowCreate(false)}
            onSubmit={(data) => createMut.mutate(data)}
          />
          {createMut.isError && (
            <p className="text-xs text-destructive mt-2">{(createMut.error as Error).message}</p>
          )}
        </SheetContent>
      </Sheet>

      {/* Edit Sheet */}
      <Sheet open={!!editSession} onOpenChange={(o) => !o && setEditSession(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader className="mb-4">
            <SheetTitle>Modifier la session</SheetTitle>
            <SheetDescription>Mettez à jour les informations de cette session.</SheetDescription>
          </SheetHeader>
          {editSession && (
            <SessionForm
              initial={editSession}
              loading={updateMut.isPending}
              activeEventId={eventId}
              onCancel={() => setEditSession(null)}
              onSubmit={(data) => updateMut.mutate({ id: editSession.id!, data })}
            />
          )}
          {updateMut.isError && (
            <p className="text-xs text-destructive mt-2">{(updateMut.error as Error).message}</p>
          )}
        </SheetContent>
      </Sheet>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cette session ?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-semibold text-foreground">"{deleteTarget?.title}"</span> sera supprimée définitivement.
              Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget?.id != null && deleteMut.mutate(deleteTarget.id)}
            >
              {deleteMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  );
}
