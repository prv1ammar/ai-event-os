import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import {
  LayoutDashboard,
  CalendarDays,
  Building2,
  Users,
  Target,
  ListChecks,
  Megaphone,
  Wallet,
  FileBarChart,
  Settings,
  ChevronDown,
  Sparkles,
  QrCode,
  Map,
  Globe,
  Zap,
  LogOut,
} from "lucide-react";
import { clearToken, getUser } from "@/lib/auth";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  SidebarHeader,
} from "@/components/ui/sidebar";

const groups = [
  {
    label: "VUE D'ENSEMBLE",
    items: [{ title: "Tableau de bord", url: "/", icon: LayoutDashboard }],
  },
  {
    label: "ÉVÉNEMENTIEL",
    items: [
      { title: "Événements", url: "/evenements", icon: CalendarDays },
      { title: "Programme", url: "/programme", icon: ListChecks },
      { title: "Exposants", url: "/exposants", icon: Building2 },
      { title: "Visiteurs", url: "/visiteurs", icon: Users },
      { title: "Leads", url: "/leads", icon: Target },
      { title: "Badges & QR", url: "/badges", icon: QrCode },
      { title: "Plan du Salon", url: "/floor-plan", icon: Map },
    ],
  },
  {
    label: "CROISSANCE",
    items: [
      { title: "Marketing & Com", url: "/marketing", icon: Megaphone },
      { title: "Landing Pages", url: "/landing-page", icon: Globe },
      { title: "Relances & Auto", url: "/automatisation", icon: Zap },
      { title: "Finance", url: "/finance", icon: Wallet },
      { title: "Rapports", url: "/rapports", icon: FileBarChart },
    ],
  },
  {
    label: "SYSTÈME",
    items: [{ title: "Paramètres", url: "/parametres", icon: Settings }],
  },
];

export function AppSidebar() {
  const currentPath = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const user = getUser();
  const initials = user
    ? user.full_name.split(" ").map((n) => n[0] ?? "").join("").slice(0, 2).toUpperCase()
    : "?";
  const fullName = user?.full_name ?? "Utilisateur";

  function handleLogout() {
    clearToken();
    navigate({ to: "/login" });
  }

  return (
    <Sidebar className="border-r-0 bg-gradient-sidebar">
      <SidebarHeader className="border-b border-sidebar-border/40 px-4 py-4">
        <div className="flex items-center gap-2.5">
          <div className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-primary text-primary-foreground shadow-glow-sm">
            <Sparkles className="h-4 w-4" />
            <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-success ring-2 ring-sidebar animate-pulse-glow" />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-xs font-bold tracking-wider text-sidebar-foreground font-display">
              AI EVENT OS
            </span>
            <span className="text-[9px] uppercase tracking-[0.18em] text-sidebar-foreground/40">
              Powered by Tybot
            </span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2 py-3">
        {groups.map((group) => (
          <SidebarGroup key={group.label} className="mb-0.5">
            <SidebarGroupLabel className="px-2 py-1 text-[9px] font-bold uppercase tracking-[0.18em] text-sidebar-foreground/35">
              {group.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-0">
                {group.items.map((item) => {
                  const active = currentPath === item.url;
                  return (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton
                        asChild
                        isActive={active}
                        className="group relative h-8 rounded-md text-sidebar-foreground/65 transition-all hover:bg-sidebar-accent hover:text-sidebar-foreground data-[active=true]:bg-gradient-primary data-[active=true]:text-primary-foreground data-[active=true]:shadow-glow-sm data-[active=true]:font-medium"
                      >
                        <Link to={item.url} className="flex items-center gap-2.5">
                          {active && (
                            <span className="absolute -left-2 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-primary-glow shadow-glow-sm" />
                          )}
                          <item.icon className="h-3.5 w-3.5 shrink-0" />
                          <span className="text-xs">{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border/40 p-2.5 space-y-1">
        <div className="flex w-full items-center gap-2.5 rounded-md p-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-primary text-primary-foreground text-xs font-semibold shadow-glow-sm">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-sidebar-foreground truncate">{fullName}</p>
            <span className="inline-flex items-center rounded-sm bg-primary/20 px-1 py-px text-[9px] font-medium text-primary-glow">
              {user?.role ?? "Admin"}
            </span>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
        >
          <LogOut className="h-3.5 w-3.5" />
          Se déconnecter
        </button>
      </SidebarFooter>
    </Sidebar>
  );
}
