import { Bell, Search, ChevronDown, CheckCircle2, Circle, Loader2 } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useEvent } from "@/lib/event-context";
import { cn } from "@/lib/utils";
import type { EventStatus } from "@/lib/event-context";

const statusDot: Record<EventStatus, { bg: string; dot: string; label: string }> = {
  "En cours": { bg: "rgba(34,197,94,0.10)", dot: "#3fb950", label: "#22c55e" },
  "À venir":  { bg: "rgba(88,166,255,0.10)", dot: "#58a6ff", label: "#58a6ff" },
  Terminé:    { bg: "rgba(125,133,144,0.12)", dot: "#7d8590", label: "#7d8590" },
};

export function AppHeader() {
  const { activeEvent, setActiveEvent, allEvents, isLoading } = useEvent();
  const cfg = statusDot[activeEvent.status];

  return (
    <header
      className="sticky top-0 z-30 flex h-11 shrink-0 items-center gap-2 border-b border-border px-3.5"
      style={{ background: "var(--color-card)" }}
    >
      <SidebarTrigger className="md:hidden" />

      {/* Event switcher */}
      <div className="hidden md:block">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="flex items-center gap-[6px] rounded-md border border-border px-[9px] py-1 text-left transition-colors hover:border-primary/40 focus:outline-none"
              style={{ background: "var(--color-secondary)" }}
            >
              <div className="flex flex-col leading-none">
                <span className="text-[8.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Événement actif
                </span>
                <span className="mt-[2px] text-[11.5px] font-semibold text-foreground max-w-[200px] truncate">
                  {activeEvent.name}
                </span>
              </div>
              <span
                className="inline-flex shrink-0 items-center gap-[3px] rounded-full px-[6px] py-[1.5px] text-[9.5px] font-semibold"
                style={{ background: cfg.bg, color: cfg.label }}
              >
                <span
                  className="h-[5px] w-[5px] rounded-full animate-pulse-dot"
                  style={{ background: cfg.dot, animationPlayState: activeEvent.status === "En cours" ? "running" : "paused" }}
                />
                {activeEvent.status}
              </span>
              {isLoading
                ? <Loader2 className="h-3 w-3 shrink-0 text-muted-foreground animate-spin" />
                : <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
              }
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-[340px] bg-card border-border">
            <DropdownMenuLabel className="text-[10px] text-muted-foreground font-normal">
              Changer d'événement
            </DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-border" />
            {isLoading ? (
              <div className="flex items-center justify-center gap-2 py-4 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Chargement…
              </div>
            ) : allEvents.length === 0 ? (
              <div className="py-4 text-center text-xs text-muted-foreground">
                Aucun événement
              </div>
            ) : null}
            {allEvents.map((ev) => {
              const evCfg = statusDot[ev.status];
              const isActive = ev.id === activeEvent.id;
              return (
                <DropdownMenuItem
                  key={ev.id}
                  onClick={() => setActiveEvent(ev)}
                  className={cn(
                    "flex items-start gap-2.5 py-2 cursor-pointer text-foreground",
                    isActive && "bg-primary/[0.06]",
                  )}
                >
                  <div className="shrink-0 mt-0.5">
                    {isActive
                      ? <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                      : <Circle className="h-3.5 w-3.5 text-muted-foreground/30" />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={cn("text-[12px] font-medium truncate", isActive ? "text-primary" : "text-foreground")}>
                      {ev.name}
                    </p>
                    <p className="text-[10.5px] text-muted-foreground mt-0.5">{ev.dates} · {ev.lieu}</p>
                  </div>
                  <span
                    className="shrink-0 inline-flex items-center gap-1 rounded-full px-[6px] py-[1.5px] text-[9px] font-semibold"
                    style={{ background: evCfg.bg, color: evCfg.label }}
                  >
                    <span className="h-[4px] w-[4px] rounded-full" style={{ background: evCfg.dot }} />
                    {ev.status}
                  </span>
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="ml-auto flex items-center gap-1.5">
        {/* Search */}
        <div
          className="hidden md:flex items-center gap-[6px] rounded-md border border-border px-[9px] py-1 w-[200px]"
          style={{ background: "var(--color-secondary)" }}
        >
          <Search className="h-3 w-3 shrink-0 text-muted-foreground" />
          <span className="text-[11.5px] text-muted-foreground flex-1 select-none">Rechercher…</span>
          <kbd
            className="hidden lg:inline-flex items-center rounded-[3px] border border-border px-1 text-[8.5px] font-medium text-muted-foreground"
            style={{ background: "var(--color-background)", fontFamily: "var(--font-mono)" }}
          >
            ⌘K
          </kbd>
        </div>

        {/* Notifications */}
        <button
          className="relative flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          aria-label="Notifications"
        >
          <Bell className="h-3.5 w-3.5" />
          <span
            className="absolute top-[5px] right-[5px] h-[6px] w-[6px] rounded-full border-[1.5px]"
            style={{ background: "#ef4444", borderColor: "var(--color-card)" }}
          />
        </button>
      </div>
    </header>
  );
}
