import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Plus, Search, Clock, MapPin, Users, Mic2, Filter, Loader2, AlertCircle } from "lucide-react";
import { PageShell, Surface } from "@/components/PageShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/api";
import { useEvent } from "@/lib/event-context";
import { useState } from "react";

export const Route = createFileRoute("/programme")({
  component: Programme,
  head: () => ({
    meta: [
      { title: "Programme — AI EVENT OS" },
      { name: "description", content: "Agenda, sessions et speakers de l'événement." },
    ],
  }),
});

interface Session {
  id: number;
  title?: string;
  description?: string;
  type?: string;
  session_type?: string;
  room?: string;
  location?: string;
  capacity?: number;
  start_time?: string;
  end_time?: string;
  status?: string;
  speaker?: string;
  speaker_name?: string;
  event_id?: number;
  [key: string]: unknown;
}

const typeStyles: Record<string, string> = {
  keynote: "bg-primary/10 text-primary ring-primary/20",
  panel: "bg-sky-500/10 text-sky-600 ring-sky-500/20",
  workshop: "bg-emerald-500/10 text-emerald-600 ring-emerald-500/20",
  roundtable: "bg-amber-500/10 text-amber-600 ring-amber-500/20",
  networking: "bg-purple-500/10 text-purple-600 ring-purple-500/20",
  demo: "bg-rose-500/10 text-rose-600 ring-rose-500/20",
  conference: "bg-primary/10 text-primary ring-primary/20",
};

const typeLabel: Record<string, string> = {
  keynote: "Keynote",
  panel: "Panel",
  workshop: "Workshop",
  roundtable: "Table ronde",
  networking: "Networking",
  demo: "Démo",
  conference: "Conférence",
};

const STATUS_STYLES: Record<string, string> = {
  scheduled: "bg-sky-500/10 text-sky-700 ring-sky-500/20",
  ongoing: "bg-emerald-500/10 text-emerald-700 ring-emerald-500/20",
  completed: "bg-muted text-muted-foreground ring-border",
  cancelled: "bg-red-500/10 text-red-700 ring-red-500/20",
};

const STATUS_LABELS: Record<string, string> = {
  scheduled: "Planifié",
  ongoing: "En cours",
  completed: "Terminé",
  cancelled: "Annulé",
};

function getSessionType(s: Session): string {
  return (s.type ?? s.session_type ?? "keynote").toLowerCase();
}

function getRoom(s: Session): string {
  return (s.room ?? s.location ?? "—") as string;
}

function getSpeaker(s: Session): string {
  return (s.speaker ?? s.speaker_name ?? "") as string;
}

function formatTime(iso?: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso.slice(11, 16) || "—";
  }
}

function formatDate(iso?: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
  } catch {
    return iso.slice(0, 10);
  }
}

function getDuration(start?: string, end?: string): string {
  if (!start || !end) return "";
  try {
    const mins = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000);
    if (mins < 60) return `${mins} min`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${h}h${m.toString().padStart(2, "0")}` : `${h}h`;
  } catch {
    return "";
  }
}

async function fetchSessions(eventId: string | null): Promise<Session[]> {
  const url = eventId
    ? `/api/v1/sessions?limit=100&event_id=${eventId}`
    : `/api/v1/sessions?limit=100`;
  const raw = await apiRequest<Session[] | { list: Session[] }>(url);
  return Array.isArray(raw) ? raw : (raw.list ?? []);
}

function groupByDate(sessions: Session[]): Map<string, Session[]> {
  const map = new Map<string, Session[]>();
  for (const s of sessions) {
    const dateKey = s.start_time ? s.start_time.slice(0, 10) : "unknown";
    const arr = map.get(dateKey) ?? [];
    arr.push(s);
    map.set(dateKey, arr);
  }
  return map;
}

function Programme() {
  const { activeEvent } = useEvent();
  const eventId = activeEvent.id !== "0" ? activeEvent.id : null;
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const { data: sessions = [], isLoading, isError, error } = useQuery({
    queryKey: ["sessions", eventId],
    queryFn: () => fetchSessions(eventId),
    enabled: true,
    staleTime: 60_000,
  });

  const sorted = [...sessions].sort((a, b) =>
    (a.start_time ?? "").localeCompare(b.start_time ?? ""),
  );

  const dateGroups = groupByDate(sorted);
  const dates = Array.from(dateGroups.keys()).sort();

  const activeDateKey = selectedDate ?? dates[0] ?? null;
  const daySessions = activeDateKey ? (dateGroups.get(activeDateKey) ?? []) : sorted;

  const filtered = daySessions.filter((s) => {
    if (typeFilter && getSessionType(s) !== typeFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (
        !(s.title ?? "").toLowerCase().includes(q) &&
        !getSpeaker(s).toLowerCase().includes(q) &&
        !getRoom(s).toLowerCase().includes(q)
      )
        return false;
    }
    return true;
  });

  const allTypes = Array.from(new Set(sessions.map(getSessionType)));

  return (
    <PageShell
      eyebrow="Programme"
      title="Agenda & sessions"
      description="Gérez le programme, les speakers et les inscriptions par session."
      actions={
        <>
          <Button variant="outline" size="sm" className="h-9">
            <Filter className="h-4 w-4" /> Filtres
          </Button>
          <Button size="sm" className="h-9 bg-gradient-primary text-primary-foreground shadow-glow-sm">
            <Plus className="h-4 w-4" /> Nouvelle session
          </Button>
        </>
      }
    >
      {isLoading ? (
        <div className="flex items-center justify-center py-20 gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Chargement du programme…</span>
        </div>
      ) : isError ? (
        <div className="flex items-center justify-center py-20 gap-2 text-destructive">
          <AlertCircle className="h-5 w-5" />
          <span className="text-sm">{error instanceof Error ? error.message : "Erreur de chargement"}</span>
        </div>
      ) : (
        <>
          {dates.length > 0 && (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {dates.slice(0, 4).map((d, i) => {
                const daySess = dateGroups.get(d) ?? [];
                return (
                  <Surface
                    key={d}
                    interactive
                    onClick={() => setSelectedDate(activeDateKey === d ? null : d)}
                    className={cn(
                      "p-4 cursor-pointer",
                      activeDateKey === d && "border-primary/40 ring-1 ring-primary/20 bg-gradient-subtle",
                      i === 0 && activeDateKey === null && "border-primary/40 ring-1 ring-primary/20 bg-gradient-subtle",
                    )}
                  >
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Jour {i + 1}</p>
                    <p className="font-display text-lg font-bold text-foreground mt-1">{formatDate(d + "T00:00:00")}</p>
                    <p className="text-xs text-muted-foreground mt-1">{daySess.length} session{daySess.length !== 1 ? "s" : ""}</p>
                  </Surface>
                );
              })}
            </div>
          )}

          <Surface className="p-4 flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Rechercher une session, un speaker, une salle…"
                className="pl-9 h-9 bg-muted/40 border-transparent"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {allTypes.map((t) => (
                <span
                  key={t}
                  onClick={() => setTypeFilter(typeFilter === t ? null : t)}
                  className={cn(
                    "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ring-inset cursor-pointer hover:opacity-80 transition-opacity",
                    typeFilter === t ? typeStyles[t] ?? typeStyles.keynote : "bg-muted text-muted-foreground ring-border",
                  )}
                >
                  {typeLabel[t] ?? t}
                </span>
              ))}
            </div>
          </Surface>

          <Surface className="p-0 overflow-hidden">
            <div className="border-b border-border/60 px-6 py-4 flex items-center justify-between">
              <div>
                <h2 className="font-display font-semibold text-foreground">
                  {activeDateKey ? formatDate(activeDateKey + "T00:00:00") : "Toutes les sessions"}
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {filtered.length} session{filtered.length !== 1 ? "s" : ""}
                  {typeFilter ? ` · filtre: ${typeLabel[typeFilter] ?? typeFilter}` : ""}
                </p>
              </div>
              <span className="text-xs text-muted-foreground">{sessions.length} total</span>
            </div>

            {filtered.length === 0 ? (
              <div className="py-16 text-center text-sm text-muted-foreground">
                Aucune session trouvée
              </div>
            ) : (
              <ul className="divide-y divide-border/60">
                {filtered.map((s) => {
                  const sessionType = getSessionType(s);
                  const status = (s.status ?? "scheduled").toLowerCase();
                  const duration = getDuration(s.start_time, s.end_time);
                  const speaker = getSpeaker(s);
                  return (
                    <li
                      key={s.id}
                      className="grid gap-3 px-6 py-4 transition-colors hover:bg-muted/30 md:grid-cols-[160px_1fr_auto] md:items-center"
                    >
                      <div className="flex items-center gap-2 text-sm">
                        <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="font-display font-semibold text-foreground tabular-nums">
                          {formatTime(s.start_time)}
                        </span>
                        {duration && <span className="text-xs text-muted-foreground">· {duration}</span>}
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium text-foreground">{s.title ?? `Session #${s.id}`}</p>
                          <span className={cn(
                            "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset",
                            typeStyles[sessionType] ?? typeStyles.keynote,
                          )}>
                            {typeLabel[sessionType] ?? sessionType}
                          </span>
                          {status !== "scheduled" && (
                            <span className={cn(
                              "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset",
                              STATUS_STYLES[status] ?? "bg-muted text-muted-foreground ring-border",
                            )}>
                              {STATUS_LABELS[status] ?? status}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                          {speaker && (
                            <span className="inline-flex items-center gap-1">
                              <Mic2 className="h-3 w-3" /> {speaker}
                            </span>
                          )}
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="h-3 w-3" /> {getRoom(s)}
                          </span>
                        </p>
                      </div>
                      {s.capacity != null && (
                        <div className="min-w-[140px]">
                          <div className="flex items-center justify-between text-[11px] mb-1">
                            <span className="inline-flex items-center gap-1 text-muted-foreground">
                              <Users className="h-3 w-3" /> {s.capacity} places
                            </span>
                          </div>
                          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                            <div className="h-full rounded-full bg-gradient-primary" style={{ width: "60%" }} />
                          </div>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Surface>
        </>
      )}
    </PageShell>
  );
}
