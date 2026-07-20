import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "./api";

export type EventStatus = "En cours" | "À venir" | "Terminé";

export type ActiveEvent = {
  id: string;
  name: string;
  shortName: string;
  dates: string;
  lieu: string;
  status: EventStatus;
};

interface RawEvent {
  id: number;
  name: string;
  start_date?: string;
  end_date?: string;
  status?: string;
  venue?: { id: number; name?: string } | null;
  [key: string]: unknown;
}

function mapStatus(s?: string): EventStatus {
  if (s === "ongoing") return "En cours";
  if (s === "closed" || s === "archived") return "Terminé";
  return "À venir";
}

function formatDates(start?: string, end?: string): string {
  if (!start) return "";
  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
  return end ? `${fmt(start)} – ${fmt(end)}` : fmt(start);
}

function toActiveEvent(e: RawEvent): ActiveEvent {
  return {
    id: String(e.id),
    name: e.name,
    shortName: e.name.length > 28 ? e.name.slice(0, 26) + "…" : e.name,
    dates: formatDates(e.start_date, e.end_date),
    lieu: e.venue?.name ?? "",
    status: mapStatus(e.status),
  };
}

async function fetchEvents(): Promise<ActiveEvent[]> {
  const raw = await apiRequest<RawEvent[] | { list: RawEvent[] }>("/api/v1/events");
  const list = Array.isArray(raw) ? raw : (raw.list ?? []);
  return list.map(toActiveEvent);
}

type EventContextType = {
  activeEvent: ActiveEvent;
  setActiveEvent: (e: ActiveEvent) => void;
  allEvents: ActiveEvent[];
  isLoading: boolean;
};

const FALLBACK: ActiveEvent = {
  id: "0",
  name: "Chargement…",
  shortName: "Chargement…",
  dates: "",
  lieu: "",
  status: "À venir",
};

const EventContext = createContext<EventContextType | null>(null);

export function EventProvider({ children }: { children: ReactNode }) {
  const { data: events = [], isLoading } = useQuery({
    queryKey: ["header-events"],
    queryFn: fetchEvents,
    staleTime: 5 * 60 * 1000,
    retry: false,
    throwOnError: false,
  });

  const defaultEvent =
    events.find((e) => e.status === "En cours") ?? events[0] ?? FALLBACK;

  const [activeEvent, setActiveEvent] = useState<ActiveEvent>(FALLBACK);

  useEffect(() => {
    if (events.length > 0) {
      setActiveEvent((prev) =>
        prev.id === "0" ? defaultEvent : prev,
      );
    }
  }, [events, defaultEvent]);

  return (
    <EventContext.Provider value={{ activeEvent, setActiveEvent, allEvents: events, isLoading }}>
      {children}
    </EventContext.Provider>
  );
}

export function useEvent() {
  const ctx = useContext(EventContext);
  if (!ctx) throw new Error("useEvent must be used within EventProvider");
  return ctx;
}
