import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ShieldCheck, Crown, Building2, Users, User, Handshake,
  Newspaper, Star, Search, Plus, Trash2, Pencil, Check,
  X, Lock, Unlock, RefreshCw, Save, UserCog, MapPin,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useEvent } from "@/lib/event-context";
import { apiRequest } from "@/lib/api";

export const Route = createFileRoute("/access-management")({
  component: AccessManagementPage,
  head: () => ({ meta: [{ title: "Gestion des Accès — AI EVENT OS" }] }),
});

// ─── Types ───────────────────────────────────────────────────────────────────
interface Visitor {
  id: number;
  firstname?: string;
  first_name?: string;
  lastname?: string;
  last_name?: string;
  email?: string;
  visitor_type?: string;
  event_id?: number | null;
  phone?: string;
  company?: string;
  [key: string]: unknown;
}

interface Zone {
  id: string;
  name: string;
  description: string;
  color: string;
}

type AccessMatrix = Record<string, Record<string, boolean>>;

// ─── Roles ───────────────────────────────────────────────────────────────────
const ROLE_DEFS = [
  { key: "admin",     label: "Administrateur", Icon: ShieldCheck, color: "red"     },
  { key: "president", label: "Président",      Icon: Crown,       color: "amber"   },
  { key: "exhibitor", label: "Exposant",       Icon: Building2,   color: "violet"  },
  { key: "staff",     label: "Personnel",      Icon: UserCog,     color: "sky"     },
  { key: "standard",  label: "Visiteur",       Icon: User,        color: "emerald" },
  { key: "partner",   label: "Partenaire",     Icon: Handshake,   color: "orange"  },
  { key: "vip",       label: "VIP",            Icon: Star,        color: "purple"  },
  { key: "press",     label: "Presse",         Icon: Newspaper,   color: "slate"   },
];

const COLOR_MAP: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  red:     { bg: "bg-red-500/10",     text: "text-red-600",     border: "border-red-500/30",     dot: "bg-red-500"     },
  amber:   { bg: "bg-amber-500/10",   text: "text-amber-600",   border: "border-amber-500/30",   dot: "bg-amber-500"   },
  violet:  { bg: "bg-violet-500/10",  text: "text-violet-600",  border: "border-violet-500/30",  dot: "bg-violet-500"  },
  sky:     { bg: "bg-sky-500/10",     text: "text-sky-600",     border: "border-sky-500/30",     dot: "bg-sky-500"     },
  emerald: { bg: "bg-emerald-500/10", text: "text-emerald-600", border: "border-emerald-500/30", dot: "bg-emerald-500" },
  orange:  { bg: "bg-orange-500/10",  text: "text-orange-600",  border: "border-orange-500/30",  dot: "bg-orange-500"  },
  purple:  { bg: "bg-purple-500/10",  text: "text-purple-600",  border: "border-purple-500/30",  dot: "bg-purple-500"  },
  slate:   { bg: "bg-slate-500/10",   text: "text-slate-600",   border: "border-slate-500/30",   dot: "bg-slate-500"   },
};

function getColor(color: string) {
  return COLOR_MAP[color] ?? COLOR_MAP.slate;
}

function getRoleDef(key: string) {
  return ROLE_DEFS.find((r) => r.key === key) ?? { key, label: key, Icon: User, color: "slate" };
}

function visitorName(v: Visitor): string {
  const fn = (v.firstname ?? v.first_name ?? "").trim();
  const ln = (v.lastname ?? v.last_name ?? "").trim();
  const full = [fn, ln].filter(Boolean).join(" ");
  return full || `Visiteur #${v.id}`;
}

function visitorInitials(v: Visitor): string {
  const fn = (v.firstname ?? v.first_name ?? "").trim();
  const ln = (v.lastname ?? v.last_name ?? "").trim();
  const a = fn[0] ?? "";
  const b = ln[0] ?? "";
  return (a + b).toUpperCase() || "#";
}

// ─── Zone defaults ───────────────────────────────────────────────────────────
const DEFAULT_ZONES: Zone[] = [
  { id: "hall",       name: "Hall Principal",       description: "Zone d'accueil et exposition",  color: "#7c3aed" },
  { id: "vip",        name: "Lounge VIP",           description: "Espace réservé aux invités VIP", color: "#f59e0b" },
  { id: "expo",       name: "Zone Exposants",       description: "Stands et espaces exposants",    color: "#10b981" },
  { id: "conf",       name: "Salle Conférences",    description: "Conférences et ateliers",        color: "#0ea5e9" },
  { id: "press",      name: "Espace Presse",        description: "Accréditation et médias",        color: "#64748b" },
  { id: "backstage",  name: "Backstage",            description: "Zone réservée au personnel",     color: "#ef4444" },
  { id: "partner",    name: "Espace Partenaires",   description: "Espace dédié aux partenaires",   color: "#f97316" },
];

const DEFAULT_MATRIX: AccessMatrix = {
  hall:      { admin: true,  president: true,  exhibitor: true,  staff: true,  standard: true,  partner: true,  vip: true,  press: true  },
  vip:       { admin: true,  president: true,  exhibitor: false, staff: true,  standard: false, partner: false, vip: true,  press: false },
  expo:      { admin: true,  president: true,  exhibitor: true,  staff: true,  standard: false, partner: true,  vip: true,  press: true  },
  conf:      { admin: true,  president: true,  exhibitor: true,  staff: true,  standard: true,  partner: true,  vip: true,  press: true  },
  press:     { admin: true,  president: false, exhibitor: false, staff: true,  standard: false, partner: false, vip: false, press: true  },
  backstage: { admin: true,  president: true,  exhibitor: false, staff: true,  standard: false, partner: false, vip: false, press: false },
  partner:   { admin: true,  president: true,  exhibitor: false, staff: true,  standard: false, partner: true,  vip: true,  press: false },
};

const LS_ZONES  = "ai_event_zones_v2";
const LS_MATRIX = "ai_event_matrix_v2";

function readZones(): Zone[] {
  try {
    const s = localStorage.getItem(LS_ZONES);
    if (!s) return DEFAULT_ZONES;
    const parsed = JSON.parse(s);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_ZONES;
  } catch {
    return DEFAULT_ZONES;
  }
}

function readMatrix(): AccessMatrix {
  try {
    const s = localStorage.getItem(LS_MATRIX);
    if (!s) return DEFAULT_MATRIX;
    const parsed = JSON.parse(s);
    return parsed && typeof parsed === "object" ? parsed : DEFAULT_MATRIX;
  } catch {
    return DEFAULT_MATRIX;
  }
}

// ─── Small badge chip ────────────────────────────────────────────────────────
function RoleBadge({ roleKey }: { roleKey: string }) {
  const r = getRoleDef(roleKey);
  const c = getColor(r.color);
  const { Icon } = r;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", c.bg, c.text)}>
      <Icon className="h-3 w-3 shrink-0" />
      {r.label}
    </span>
  );
}

// ─── Tab 1: Roles & Users ───────────────────────────────────────────────────
function RolesTab({ visitors, loading, onRefresh }: {
  visitors: Visitor[];
  loading: boolean;
  onRefresh: () => void;
}) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [editId, setEditId] = useState<number | null>(null);
  const [editRole, setEditRole] = useState("");

  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    visitors.forEach((v) => {
      const k = v.visitor_type || "standard";
      m[k] = (m[k] ?? 0) + 1;
    });
    return m;
  }, [visitors]);

  const filtered = useMemo(() => {
    return visitors.filter((v) => {
      if (roleFilter !== "all" && (v.visitor_type ?? "standard") !== roleFilter) return false;
      if (!search) return true;
      const name = visitorName(v).toLowerCase();
      const email = (v.email ?? "").toLowerCase();
      const company = (v.company ?? "").toLowerCase();
      const q = search.toLowerCase();
      return name.includes(q) || email.includes(q) || company.includes(q);
    });
  }, [visitors, roleFilter, search]);

  const patchMutation = useMutation({
    mutationFn: (vars: { id: number; visitor_type: string }) =>
      apiRequest(`/api/v1/visitors/${vars.id}`, {
        method: "PATCH",
        body: JSON.stringify({ visitor_type: vars.visitor_type }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["access-visitors"] });
      setEditId(null);
    },
  });

  function startEdit(v: Visitor) {
    setEditId(v.id);
    setEditRole(v.visitor_type ?? "standard");
  }

  function confirmEdit(v: Visitor) {
    if (editRole !== (v.visitor_type ?? "standard")) {
      patchMutation.mutate({ id: v.id, visitor_type: editRole });
    } else {
      setEditId(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Role filter cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        {ROLE_DEFS.map((role) => {
          const count = counts[role.key] ?? 0;
          const c = getColor(role.color);
          const active = roleFilter === role.key;
          const { Icon } = role;
          return (
            <button
              key={role.key}
              onClick={() => setRoleFilter(active ? "all" : role.key)}
              className={cn(
                "relative rounded-xl border p-3 text-left transition-all",
                active ? cn("shadow-sm", c.border, c.bg) : "border-border hover:bg-muted/40"
              )}
            >
              <div className={cn("rounded-lg p-1.5 mb-2 w-fit", active ? cn(c.bg, c.text) : "bg-muted text-muted-foreground")}>
                <Icon className="h-3.5 w-3.5" />
              </div>
              <p className={cn("text-xs font-semibold leading-tight", active ? c.text : "text-foreground")}>{role.label}</p>
              <p className="text-lg font-bold text-foreground">{count}</p>
              {active && <div className={cn("absolute bottom-0 left-3 right-3 h-0.5 rounded-full", c.dot)} />}
            </button>
          );
        })}
      </div>

      {/* Search bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher par nom, email, entreprise…"
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{filtered.length} résultat{filtered.length !== 1 ? "s" : ""}</span>
          {roleFilter !== "all" && (
            <button onClick={() => setRoleFilter("all")} className="text-xs text-primary underline">Tout</button>
          )}
          <button onClick={onRefresh} className="rounded-lg border px-3 py-2 text-xs text-muted-foreground hover:text-foreground">
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <h3 className="text-sm font-semibold">Utilisateurs &amp; Rôles</h3>
          <span className="text-xs text-muted-foreground">{visitors.length} utilisateurs</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Utilisateur</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Entreprise</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Rôle actuel</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Nouveau rôle</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                    <RefreshCw className="h-4 w-4 animate-spin inline mr-2" />Chargement…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                    {visitors.length === 0 ? "Aucun utilisateur enregistré" : "Aucun résultat"}
                  </td>
                </tr>
              ) : (
                filtered.map((v) => {
                  const isEditing = editId === v.id;
                  const name = visitorName(v);
                  const initials = visitorInitials(v);
                  const role = v.visitor_type ?? "standard";
                  return (
                    <tr key={v.id} className={cn("hover:bg-muted/30 transition-colors", isEditing && "bg-primary/5")}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="h-7 w-7 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white text-[10px] font-bold shrink-0">
                            {initials}
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium truncate">{name}</p>
                            <p className="text-muted-foreground truncate">{v.email ?? "—"}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{v.company ?? "—"}</td>
                      <td className="px-4 py-3"><RoleBadge roleKey={role} /></td>
                      <td className="px-4 py-3">
                        {isEditing ? (
                          <select
                            value={editRole}
                            onChange={(e) => setEditRole(e.target.value)}
                            autoFocus
                            className="rounded-md border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                          >
                            {ROLE_DEFS.map((r) => (
                              <option key={r.key} value={r.key}>{r.label}</option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {isEditing ? (
                          <div className="flex gap-1">
                            <button
                              onClick={() => confirmEdit(v)}
                              disabled={patchMutation.isPending}
                              className="rounded-md p-1.5 bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 disabled:opacity-50"
                            >
                              {patchMutation.isPending ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                            </button>
                            <button onClick={() => setEditId(null)} className="rounded-md p-1.5 bg-red-500/10 text-red-500 hover:bg-red-500/20">
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ) : (
                          <button onClick={() => startEdit(v)} className="rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Tab 2: Zones & Permissions ──────────────────────────────────────────────
function ZonesTab() {
  const [zones, setZones] = useState<Zone[]>(() => readZones());
  const [matrix, setMatrix] = useState<AccessMatrix>(() => readMatrix());
  const [addingZone, setAddingZone] = useState(false);
  const [newZone, setNewZone] = useState({ name: "", description: "", color: "#7c3aed" });
  const [selectedZone, setSelectedZone] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(LS_ZONES, JSON.stringify(zones));
      localStorage.setItem(LS_MATRIX, JSON.stringify(matrix));
    } catch (_) { /* ignore storage errors */ }
  }, [zones, matrix]);

  function toggle(zoneId: string, roleKey: string) {
    setMatrix((prev) => ({
      ...prev,
      [zoneId]: { ...(prev[zoneId] ?? {}), [roleKey]: !(prev[zoneId]?.[roleKey] ?? false) },
    }));
    setSaved(false);
  }

  function addZone() {
    const n = newZone.name.trim();
    if (!n) return;
    const id = n.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || `zone_${Date.now()}`;
    setZones((prev) => [...prev, { id, name: n, description: newZone.description.trim(), color: newZone.color }]);
    setMatrix((prev) => ({ ...prev, [id]: Object.fromEntries(ROLE_DEFS.map((r) => [r.key, false])) }));
    setNewZone({ name: "", description: "", color: "#7c3aed" });
    setAddingZone(false);
  }

  function deleteZone(id: string) {
    setZones((prev) => prev.filter((z) => z.id !== id));
    setMatrix((prev) => { const m = { ...prev }; delete m[id]; return m; });
    if (selectedZone === id) setSelectedZone(null);
  }

  function save() {
    try {
      localStorage.setItem(LS_ZONES, JSON.stringify(zones));
      localStorage.setItem(LS_MATRIX, JSON.stringify(matrix));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (_) { /* ignore */ }
  }

  const activeZone = selectedZone ? zones.find((z) => z.id === selectedZone) ?? null : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Zones &amp; Permissions d'Accès</h3>
          <p className="text-xs text-muted-foreground">Configurez l'accès par zone et par rôle</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setZones(DEFAULT_ZONES); setMatrix(DEFAULT_MATRIX); setSelectedZone(null); }} className="rounded-lg border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground">
            Réinitialiser
          </button>
          <button
            onClick={save}
            className={cn("flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium",
              saved ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20" : "bg-primary text-primary-foreground hover:bg-primary/90"
            )}
          >
            {saved ? <Check className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
            {saved ? "Sauvegardé" : "Sauvegarder"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Zone list */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Zones ({zones.length})</span>
            <button onClick={() => setAddingZone(true)} className="flex items-center gap-1 text-xs text-primary hover:underline">
              <Plus className="h-3 w-3" /> Ajouter
            </button>
          </div>

          {addingZone && (
            <div className="rounded-xl border bg-card p-3 space-y-2">
              <input
                autoFocus
                placeholder="Nom de la zone"
                value={newZone.name}
                onChange={(e) => setNewZone((z) => ({ ...z, name: e.target.value }))}
                onKeyDown={(e) => e.key === "Enter" && addZone()}
                className="w-full rounded-md border bg-background px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <input
                placeholder="Description (optionnelle)"
                value={newZone.description}
                onChange={(e) => setNewZone((z) => ({ ...z, description: e.target.value }))}
                className="w-full rounded-md border bg-background px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <div className="flex items-center gap-2">
                <label className="text-[10px] text-muted-foreground">Couleur</label>
                <input type="color" value={newZone.color} onChange={(e) => setNewZone((z) => ({ ...z, color: e.target.value }))} className="h-6 w-10 rounded cursor-pointer border-0" />
              </div>
              <div className="flex gap-2">
                <button onClick={addZone} className="flex-1 rounded-md bg-primary text-primary-foreground text-xs py-1.5 font-medium">Ajouter</button>
                <button onClick={() => setAddingZone(false)} className="rounded-md border text-xs px-3 py-1.5 text-muted-foreground">Annuler</button>
              </div>
            </div>
          )}

          {zones.map((zone) => {
            const allowed = Object.values(matrix[zone.id] ?? {}).filter(Boolean).length;
            const isSelected = selectedZone === zone.id;
            return (
              <button
                key={zone.id}
                onClick={() => setSelectedZone(isSelected ? null : zone.id)}
                className={cn("w-full text-left rounded-xl border p-3 transition-all group", isSelected ? "border-primary/30 bg-primary/5 shadow-sm" : "hover:bg-muted/40")}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: zone.color }} />
                    <span className="text-xs font-semibold truncate">{zone.name}</span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-[10px] text-muted-foreground">{allowed}/{ROLE_DEFS.length}</span>
                    <button onClick={(e) => { e.stopPropagation(); deleteZone(zone.id); }} className="opacity-0 group-hover:opacity-100 rounded p-0.5 text-muted-foreground hover:text-red-500">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
                {zone.description && <p className="text-[10px] text-muted-foreground mt-1 truncate">{zone.description}</p>}
                <div className="mt-2 flex gap-0.5">
                  {ROLE_DEFS.map((r) => (
                    <span key={r.key} className={cn("h-1.5 w-3 rounded-full", (matrix[zone.id]?.[r.key]) ? "opacity-100" : "opacity-15")} style={{ background: zone.color }} />
                  ))}
                </div>
              </button>
            );
          })}
        </div>

        {/* Permission detail / matrix */}
        <div className="lg:col-span-2 space-y-4">
          {activeZone ? (
            <div className="rounded-xl border bg-card overflow-hidden">
              <div className="px-5 py-4 border-b flex items-center gap-3">
                <span className="h-3 w-3 rounded-full" style={{ background: activeZone.color }} />
                <div>
                  <h3 className="text-sm font-semibold">{activeZone.name}</h3>
                  {activeZone.description && <p className="text-xs text-muted-foreground">{activeZone.description}</p>}
                </div>
              </div>
              <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
                {ROLE_DEFS.map((role) => {
                  const allowed = matrix[activeZone.id]?.[role.key] ?? false;
                  const c = getColor(role.color);
                  const { Icon } = role;
                  return (
                    <button
                      key={role.key}
                      onClick={() => toggle(activeZone.id, role.key)}
                      className={cn("flex items-center justify-between rounded-xl border p-3.5 text-left transition-all", allowed ? cn(c.border, c.bg) : "border-border hover:bg-muted/40 opacity-60")}
                    >
                      <div className="flex items-center gap-2.5">
                        <div className={cn("rounded-lg p-2", allowed ? cn(c.bg, c.text) : "bg-muted text-muted-foreground")}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <span className="text-xs font-semibold">{role.label}</span>
                      </div>
                      <div className={cn("rounded-full p-1", allowed ? "bg-emerald-500 text-white" : "bg-muted text-muted-foreground")}>
                        {allowed ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="rounded-xl border bg-card overflow-hidden">
              <div className="px-5 py-3 border-b">
                <h3 className="text-sm font-semibold">Matrice des Permissions</h3>
                <p className="text-[10px] text-muted-foreground">Cliquez sur une cellule pour changer l'accès · Sélectionnez une zone pour le détail</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground min-w-[150px]">Zone</th>
                      {ROLE_DEFS.map((r) => {
                        const { Icon } = r;
                        return (
                          <th key={r.key} className="px-2 py-2.5 text-center font-medium text-muted-foreground min-w-[64px]">
                            <div className="flex flex-col items-center gap-0.5">
                              <Icon className="h-3.5 w-3.5" />
                              <span className="text-[9px]">{r.label}</span>
                            </div>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {zones.map((zone) => (
                      <tr key={zone.id} className="hover:bg-muted/20">
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full" style={{ background: zone.color }} />
                            <button onClick={() => setSelectedZone(zone.id)} className="font-medium hover:text-primary text-left">{zone.name}</button>
                          </div>
                        </td>
                        {ROLE_DEFS.map((role) => {
                          const allowed = matrix[zone.id]?.[role.key] ?? false;
                          return (
                            <td key={role.key} className="px-2 py-2.5 text-center">
                              <button
                                onClick={() => toggle(zone.id, role.key)}
                                className={cn("mx-auto flex items-center justify-center rounded-full h-6 w-6 transition-all",
                                  allowed ? "bg-emerald-500 text-white hover:bg-emerald-600" : "bg-muted text-muted-foreground hover:bg-red-500/10 hover:text-red-500"
                                )}
                              >
                                {allowed ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="px-5 py-3 border-t bg-muted/10 flex items-center gap-4 text-[10px] text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <span className="h-4 w-4 rounded-full bg-emerald-500 flex items-center justify-center"><Check className="h-2.5 w-2.5 text-white" /></span>
                  Autorisé
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="h-4 w-4 rounded-full bg-muted flex items-center justify-center"><X className="h-2.5 w-2.5 text-muted-foreground" /></span>
                  Refusé
                </div>
                <span className="ml-auto">Sauvegardé localement</span>
              </div>
            </div>
          )}

          {/* Role summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {ROLE_DEFS.slice(0, 4).map((role) => {
              const accessCount = zones.filter((z) => matrix[z.id]?.[role.key]).length;
              const c = getColor(role.color);
              const { Icon } = role;
              return (
                <div key={role.key} className={cn("rounded-xl border p-3", c.bg, c.border)}>
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className={cn("h-3.5 w-3.5", c.text)} />
                    <span className={cn("text-[10px] font-semibold", c.text)}>{role.label}</span>
                  </div>
                  <p className="text-xl font-bold text-foreground">{accessCount}</p>
                  <p className="text-[10px] text-muted-foreground">zone{accessCount !== 1 ? "s" : ""} autorisée{accessCount !== 1 ? "s" : ""}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────
function AccessManagementPage() {
  const { activeEvent } = useEvent();
  const eventId = activeEvent?.id && activeEvent.id !== "0" ? Number(activeEvent.id) || null : null;
  const [tab, setTab] = useState<"roles" | "zones">("roles");

  const visitorsUrl = `/api/v1/visitors?limit=500${eventId ? `&event_id=${eventId}` : ""}`;

  const { data: rawData, isLoading, refetch } = useQuery({
    queryKey: ["access-visitors", eventId],
    queryFn: () => apiRequest<unknown>(visitorsUrl),
    staleTime: 60_000,
    retry: false,
    throwOnError: false,
  });

  const visitors = useMemo<Visitor[]>(() => {
    if (!rawData) return [];
    const arr = Array.isArray(rawData) ? rawData : [];
    return arr.filter((item): item is Visitor => item != null && typeof item === "object");
  }, [rawData]);

  const roleCount = useMemo(() => new Set(visitors.map((v) => v.visitor_type ?? "standard")).size, [visitors]);

  const eventName = activeEvent?.name ?? "—";

  return (
    <div className="flex flex-col gap-6 p-6 max-w-7xl mx-auto w-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground">Gestion des Accès</h1>
          <p className="text-xs text-muted-foreground mt-0.5">{eventName} · Rôles, permissions et zones</p>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5">
            <Users className="h-3.5 w-3.5" />
            <span><b className="text-foreground">{visitors.length}</b> utilisateurs</span>
          </div>
          <div className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5">
            <ShieldCheck className="h-3.5 w-3.5" />
            <span><b className="text-foreground">{roleCount}</b> rôles</span>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 rounded-xl bg-muted/50 p-1 w-fit border">
        {([
          { key: "roles" as const, label: "Rôles & Utilisateurs", Icon: Users,  count: visitors.length },
          { key: "zones" as const, label: "Zones & Permissions",  Icon: MapPin, count: null },
        ] as const).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-medium transition-all",
              tab === t.key ? "bg-background text-foreground shadow-sm border" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <t.Icon className="h-3.5 w-3.5" />
            {t.label}
            {t.count !== null && (
              <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                tab === t.key ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
              )}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "roles" && <RolesTab visitors={visitors} loading={isLoading} onRefresh={refetch} />}
      {tab === "zones" && <ZonesTab />}
    </div>
  );
}
