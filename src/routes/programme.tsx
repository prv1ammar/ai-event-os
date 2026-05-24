import { createFileRoute } from "@tanstack/react-router";
import { Plus, Search, Clock, MapPin, Users, Mic2, Filter } from "lucide-react";
import { PageShell, Surface } from "@/components/PageShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/programme")({
  component: Programme,
  head: () => ({
    meta: [
      { title: "Programme — AI EVENT OS" },
      { name: "description", content: "Agenda, sessions et speakers de l'événement." },
    ],
  }),
});

type SessionType = "keynote" | "panel" | "workshop" | "roundtable";

const typeStyles: Record<SessionType, string> = {
  keynote: "bg-primary/10 text-primary ring-primary/20",
  panel: "bg-info/10 text-info ring-info/20",
  workshop: "bg-success/10 text-success ring-success/20",
  roundtable: "bg-warning/10 text-warning ring-warning/20",
};

const typeLabel: Record<SessionType, string> = {
  keynote: "Keynote",
  panel: "Panel",
  workshop: "Workshop",
  roundtable: "Table ronde",
};

const days = [
  { id: "j1", label: "Jour 1", date: "24 Mai", sessions: 12 },
  { id: "j2", label: "Jour 2", date: "25 Mai", sessions: 18 },
  { id: "j3", label: "Jour 3", date: "26 Mai", sessions: 16 },
  { id: "j4", label: "Jour 4", date: "27 Mai", sessions: 9 },
];

const sessions: Array<{
  time: string;
  duration: string;
  title: string;
  speaker: string;
  room: string;
  type: SessionType;
  seats: { taken: number; total: number };
}> = [
  { time: "09:00", duration: "60 min", title: "Cérémonie d'ouverture — Vision 2030", speaker: "M. Karim Alaoui", room: "Auditorium A", type: "keynote", seats: { taken: 850, total: 1000 } },
  { time: "10:30", duration: "45 min", title: "L'IA au service de l'agroalimentaire", speaker: "Dr. Salma El Idrissi", room: "Salle Atlas", type: "keynote", seats: { taken: 420, total: 500 } },
  { time: "11:30", duration: "60 min", title: "Panel : Export & marchés émergents", speaker: "5 intervenants", room: "Salle Sahara", type: "panel", seats: { taken: 180, total: 250 } },
  { time: "14:00", duration: "90 min", title: "Workshop : Certification BIO en 2025", speaker: "Mme. Fadwa Zahra", room: "Atelier B12", type: "workshop", seats: { taken: 38, total: 40 } },
  { time: "16:00", duration: "60 min", title: "Table ronde : Souveraineté alimentaire", speaker: "4 intervenants", room: "Salle Atlas", type: "roundtable", seats: { taken: 145, total: 200 } },
];

function Programme() {
  return (
    <PageShell
      eyebrow="Programme"
      title="Agenda & sessions"
      description="Gérez le programme des 4 journées, les speakers et les inscriptions par session."
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
      {/* Day selector */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {days.map((d, i) => (
          <Surface
            key={d.id}
            interactive
            className={cn(
              "p-4",
              i === 1 && "border-primary/40 ring-1 ring-primary/20 bg-gradient-subtle",
            )}
          >
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{d.label}</p>
            <p className="font-display text-xl font-bold text-foreground mt-1">{d.date}</p>
            <p className="text-xs text-muted-foreground mt-1">{d.sessions} sessions programmées</p>
          </Surface>
        ))}
      </div>

      {/* Search bar */}
      <Surface className="p-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Rechercher une session, un speaker, une salle…" className="pl-9 h-9 bg-muted/40 border-transparent" />
        </div>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(typeLabel) as SessionType[]).map((t) => (
            <span
              key={t}
              className={cn(
                "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ring-inset cursor-pointer hover:opacity-80",
                typeStyles[t],
              )}
            >
              {typeLabel[t]}
            </span>
          ))}
        </div>
      </Surface>

      {/* Timeline */}
      <Surface className="p-0 overflow-hidden">
        <div className="border-b border-border/60 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="font-display font-semibold text-foreground">Jour 2 — Dimanche 25 Mai</h2>
            <p className="text-xs text-muted-foreground mt-0.5">18 sessions · 6 salles · 24 speakers</p>
          </div>
          <span className="text-xs text-muted-foreground">Heure locale Casablanca</span>
        </div>
        <ul className="divide-y divide-border/60">
          {sessions.map((s, i) => {
            const pct = (s.seats.taken / s.seats.total) * 100;
            const almostFull = pct >= 90;
            return (
              <li
                key={i}
                className="grid gap-3 px-6 py-4 transition-colors hover:bg-muted/30 md:grid-cols-[140px_1fr_auto] md:items-center"
              >
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="font-display font-semibold text-foreground tabular-nums">{s.time}</span>
                  <span className="text-xs text-muted-foreground">· {s.duration}</span>
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-foreground">{s.title}</p>
                    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset", typeStyles[s.type])}>
                      {typeLabel[s.type]}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="inline-flex items-center gap-1"><Mic2 className="h-3 w-3" /> {s.speaker}</span>
                    <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> {s.room}</span>
                  </p>
                </div>
                <div className="min-w-[160px]">
                  <div className="flex items-center justify-between text-[11px] mb-1">
                    <span className="inline-flex items-center gap-1 text-muted-foreground">
                      <Users className="h-3 w-3" /> {s.seats.taken}/{s.seats.total}
                    </span>
                    {almostFull && (
                      <span className="text-warning font-medium">Bientôt complet</span>
                    )}
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all",
                        almostFull ? "bg-warning" : "bg-gradient-primary",
                      )}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </Surface>
    </PageShell>
  );
}
