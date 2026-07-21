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
  QrCode,
  ScanLine,
  Map,
  MapPin,
  Globe,
  Zap,
  LogOut,
  GitMerge,
  ShieldCheck,
} from "lucide-react";
import { clearToken, getUser } from "@/lib/auth";
import { canAccess, getRoleDefinition } from "@/lib/permissions";

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
    ],
  },
  {
    label: "LOGISTIQUE",
    items: [
      { title: "Badges & QR", url: "/badges", icon: QrCode },
      { title: "Scanner QR", url: "/scanner", icon: ScanLine },
      { title: "Trafic & Accès", url: "/traffic", icon: GitMerge },
      { title: "Plan du Salon", url: "/floor-plan", icon: Map },
      { title: "Lieux", url: "/lieux", icon: MapPin },
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
    items: [
      { title: "Gestion des Accès", url: "/access-management", icon: ShieldCheck },
      { title: "Paramètres", url: "/parametres", icon: Settings },
    ],
  },
];

function GridLogo() {
  return (
    <svg width="24" height="24" viewBox="0 0 32 32" fill="none">
      <rect x="2" y="2" width="8" height="8" rx="2" fill="rgba(255,255,255,0.15)" />
      <rect x="12" y="2" width="8" height="8" rx="2" fill="#58a6ff" />
      <rect x="22" y="2" width="8" height="8" rx="2" fill="rgba(255,255,255,0.12)" />
      <rect x="2" y="12" width="8" height="8" rx="2" fill="#58a6ff" opacity="0.55" />
      <rect x="12" y="12" width="8" height="8" rx="2" fill="#bc8cff" opacity="0.85" />
      <rect x="22" y="12" width="8" height="8" rx="2" fill="rgba(255,255,255,0.12)" />
      <rect x="2" y="22" width="8" height="8" rx="2" fill="rgba(255,255,255,0.08)" />
      <rect x="12" y="22" width="8" height="8" rx="2" fill="rgba(255,255,255,0.08)" />
      <rect x="22" y="22" width="8" height="8" rx="2" fill="#58a6ff" opacity="0.4" />
    </svg>
  );
}

export function AppSidebar() {
  const currentPath = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const user = getUser();
  const userRole = user?.role;
  const roleDef = getRoleDefinition(userRole);

  const initials = user
    ? `${user.first_name?.[0] ?? ""}${user.last_name?.[0] ?? ""}`.toUpperCase() || "?"
    : "?";
  const fullName = user ? `${user.first_name} ${user.last_name}` : "Utilisateur";

  const visibleGroups = groups
    .map((g) => ({
      ...g,
      items: g.items.filter((item) => canAccess(userRole, item.url)),
    }))
    .filter((g) => g.items.length > 0);

  function handleLogout() {
    clearToken();
    navigate({ to: "/login" });
  }

  return (
    <Sidebar className="border-r border-sidebar-border bg-sidebar">
      {/* Logo */}
      <SidebarHeader className="border-b border-sidebar-border px-3.5 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center">
            <GridLogo />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-[10.5px] font-bold tracking-[0.04em] text-sidebar-foreground">
              AI EVENT OS
            </span>
            <span className="text-[8px] uppercase tracking-[0.14em] text-sidebar-foreground/40">
              Powered by Tybot
            </span>
          </div>
        </div>
      </SidebarHeader>

      {/* Nav */}
      <SidebarContent className="px-1.5 py-1.5">
        {visibleGroups.map((group) => (
          <SidebarGroup key={group.label} className="mb-0.5 px-0">
            <SidebarGroupLabel className="px-2 py-[7px] text-[8.5px] font-bold uppercase tracking-[0.16em] text-sidebar-foreground/40">
              {group.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-px">
                {group.items.map((item) => {
                  const active = currentPath === item.url;
                  return (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton
                        asChild
                        isActive={active}
                        className="group h-7 rounded-md px-2 text-[11.5px] text-sidebar-foreground/55 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground"
                      >
                        <Link to={item.url} className="flex items-center gap-[7px]">
                          <item.icon className="h-[13px] w-[13px] shrink-0 text-sidebar-foreground/35 group-data-[active=true]:text-sidebar-accent-foreground" />
                          <span>{item.title}</span>
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

      {/* Footer */}
      <SidebarFooter className="border-t border-sidebar-border p-2.5 space-y-0.5">
        <div className="flex w-full items-center gap-2 rounded-md px-2 py-1.5">
          <div
            className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white"
            style={{ background: "linear-gradient(140deg, #58a6ff, #bc8cff)" }}
          >
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-medium text-sidebar-foreground truncate">{fullName}</p>
            <span
              className="inline-flex items-center rounded-[3px] px-[5px] py-px text-[8px] font-semibold"
              style={{ background: "rgba(88,166,255,0.12)", color: "#58a6ff" }}
            >
              {roleDef.label}
            </span>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[11.5px] text-sidebar-foreground/40 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground/80"
        >
          <LogOut className="h-3.5 w-3.5" />
          Se déconnecter
        </button>
      </SidebarFooter>
    </Sidebar>
  );
}
