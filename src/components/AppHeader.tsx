import { Bell, Search, Command, HelpCircle, ChevronDown, CheckCircle2, Circle, Loader2 } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Input } from "@/components/ui/input";
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

const statusConfig: Record<EventStatus, { className: string; dot: string }> = {
  "En cours": {
    className: "bg-success/10 text-success ring-1 ring-success/20",
    dot: "bg-success animate-pulse",
  },
  "À venir": {
    className: "bg-info/10 text-info ring-1 ring-info/20",
    dot: "bg-info",
  },
  Terminé: {
    className: "bg-muted text-muted-foreground ring-1 ring-border",
    dot: "bg-muted-foreground",
  },
};

export function AppHeader() {
  const { activeEvent, setActiveEvent, allEvents, isLoading } = useEvent();
  const cfg = statusConfig[activeEvent.status];

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border/60 bg-background/70 px-4 backdrop-blur-xl md:px-6">
      <SidebarTrigger className="md:hidden" />

      {/* Event switcher */}
      <div className="hidden md:block">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2.5 rounded-lg border border-border/60 bg-card px-3 py-1.5 text-left transition-colors hover:border-primary/40 hover:bg-card focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
              <div className="flex flex-col leading-tight">
                <span className="text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
                  Événement actif
                </span>
                <span className="text-xs font-semibold text-foreground max-w-[240px] truncate">
                  {activeEvent.name}
                </span>
              </div>
              <span className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium whitespace-nowrap",
                cfg.className,
              )}>
                <span className={cn("h-1.5 w-1.5 rounded-full", cfg.dot)} />
                {activeEvent.status}
              </span>
              {isLoading
                ? <Loader2 className="h-3.5 w-3.5 text-muted-foreground shrink-0 animate-spin" />
                : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              }
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-[340px]">
            <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
              Changer d'événement
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {isLoading ? (
              <div className="flex items-center justify-center gap-2 py-4 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Chargement des événements…
              </div>
            ) : allEvents.length === 0 ? (
              <div className="py-4 text-center text-xs text-muted-foreground">
                Aucun événement trouvé
              </div>
            ) : null}
            {allEvents.map((ev) => {
              const evCfg = statusConfig[ev.status];
              const isActive = ev.id === activeEvent.id;
              return (
                <DropdownMenuItem
                  key={ev.id}
                  onClick={() => setActiveEvent(ev)}
                  className={cn(
                    "flex items-start gap-3 py-2.5 cursor-pointer",
                    isActive && "bg-primary/5",
                  )}
                >
                  <div className="shrink-0 mt-0.5">
                    {isActive ? (
                      <CheckCircle2 className="h-4 w-4 text-primary" />
                    ) : (
                      <Circle className="h-4 w-4 text-muted-foreground/40" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={cn("text-sm font-medium truncate", isActive ? "text-primary" : "text-foreground")}>
                      {ev.name}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">{ev.dates} · {ev.lieu}</p>
                  </div>
                  <span className={cn(
                    "shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
                    evCfg.className,
                  )}>
                    <span className={cn("h-1.5 w-1.5 rounded-full", evCfg.dot)} />
                    {ev.status}
                  </span>
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <div className="relative hidden md:block">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Rechercher visiteurs, exposants, sessions…"
            className="h-9 w-72 pl-9 pr-12 bg-muted/40 border-transparent focus-visible:bg-card focus-visible:ring-1 text-sm"
          />
          <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 hidden h-5 select-none items-center gap-1 rounded border border-border bg-card px-1.5 font-mono text-[10px] font-medium text-muted-foreground lg:inline-flex">
            <Command className="h-3 w-3" />K
          </kbd>
        </div>

        <button
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
          aria-label="Aide"
        >
          <HelpCircle className="h-4 w-4" />
        </button>

        <button
          className="relative inline-flex h-8 w-8 items-center justify-center rounded-lg text-foreground transition-colors hover:bg-muted/60"
          aria-label="Notifications"
        >
          <Bell className="h-4 w-4" />
          <span className="absolute top-1 right-1 flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-destructive" />
          </span>
        </button>
      </div>
    </header>
  );
}
