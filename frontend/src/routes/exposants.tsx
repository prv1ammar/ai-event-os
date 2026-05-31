import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  Plus, Search, Eye, Pencil, MoreHorizontal, Users, Globe,
  Download, ChevronLeft, ChevronRight, Loader2, AlertCircle, TrendingUp, Trash2, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
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
import { useEvent } from "@/lib/event-context";

export const Route = createFileRoute("/exposants")({
  component: ExposantsPage,
  head: () => ({
    meta: [
      { title: "Exposants — AI EVENT" },
      { name: "description", content: "Gérez vos exposants." },
    ],
  }),
});

interface Exhibitor {
  id: number;
  company_name?: string;
  sector?: string;
  website?: string;
  country?: string;
  city?: string;
  email?: string;
  phone?: string;
  description?: string;
  company_size?: string;
  employee_count?: number;
  annual_revenue?: number;
  export_experience?: string;
  event_id?: number;
  leads_id?: number | null;
  [key: string]: unknown;
}

interface EventOption { id: number; name: string }

// ─── API ─────────────────────────────────────────────────────────────────────
async function fetchExhibitors(eventId: string | null): Promise<Exhibitor[]> {
  const url = eventId
    ? `/api/v1/exhibitors?limit=100&event_id=${eventId}`
    : `/api/v1/exhibitors?limit=100`;
  const raw = await apiRequest<Exhibitor[] | { list: Exhibitor[] }>(url);
  return Array.isArray(raw) ? raw : (raw.list ?? []);
}

async function createExhibitor(data: Partial<Exhibitor>): Promise<void> {
  await smartDbRequest("exhibitors", "POST", data as Record<string, unknown>);
}

async function updateExhibitor({ id, data }: { id: number; data: Partial<Exhibitor> }): Promise<void> {
  await smartDbRequest("exhibitors", "PATCH", { id, ...data });
}

async function deleteExhibitor(id: number): Promise<void> {
  await smartDbRequest("exhibitors", "DELETE", { id });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const EXPERIENCE_LABELS: Record<string, string> = {
  global: "Global", international: "International",
  regional: "Régional", local: "Local",
};
const experienceStyles: Record<string, string> = {
  global: "bg-emerald-500/10 text-emerald-600 ring-1 ring-inset ring-emerald-500/20",
  international: "bg-sky-500/10 text-sky-600 ring-1 ring-inset ring-sky-500/20",
  regional: "bg-amber-500/10 text-amber-600 ring-1 ring-inset ring-amber-500/20",
  local: "bg-muted text-muted-foreground ring-1 ring-inset ring-border",
};
const toneStyles: Record<string, string> = {
  primary: "bg-primary/10 text-primary", green: "bg-emerald-500/10 text-emerald-600",
  amber: "bg-amber-500/10 text-amber-600", blue: "bg-sky-500/10 text-sky-600",
};

function formatRevenue(val?: number): string {
  if (!val) return "—";
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M MAD`;
  if (val >= 1_000) return `${Math.round(val / 1_000)}K MAD`;
  return `${val} MAD`;
}

function LogoInitials({ name }: { name: string }) {
  const initials = name.split(" ").filter((w) => w.length > 0).slice(0, 2).map((w) => w[0].toUpperCase()).join("");
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-primary/20 to-primary-glow/20 text-xs font-semibold text-primary">
      {initials || "EX"}
    </div>
  );
}

// ─── Exhibitor Detail ─────────────────────────────────────────────────────────
function ExhibitorDetail({ ex }: { ex: Exhibitor }) {
  const exp = ex.export_experience ?? "";
  return (
    <div className="space-y-4 py-2">
      <div className="flex items-center gap-3">
        <LogoInitials name={ex.company_name ?? `#${ex.id}`} />
        <div>
          <p className="font-semibold text-foreground">{ex.company_name ?? `Exposant #${ex.id}`}</p>
          <p className="text-xs text-muted-foreground">{ex.sector ?? "—"}</p>
        </div>
        {exp && (
          <span className={cn("ml-auto inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium", experienceStyles[exp] ?? "bg-muted text-muted-foreground")}>
            {EXPERIENCE_LABELS[exp] ?? exp}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        {[
          { label: "Email", value: ex.email ?? "—" },
          { label: "Téléphone", value: ex.phone ?? "—" },
          { label: "Ville", value: ex.city ?? "—" },
          { label: "Pays", value: ex.country ?? "—" },
          { label: "Taille", value: ex.company_size ?? (ex.employee_count ? `${ex.employee_count} emp.` : "—") },
          { label: "CA annuel", value: formatRevenue(ex.annual_revenue) },
          { label: "Site web", value: ex.website ?? "—" },
          { label: "Leads ID", value: ex.leads_id != null ? String(ex.leads_id) : "—" },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-lg bg-muted/40 px-3 py-2">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
            <p className="font-medium text-foreground mt-0.5 truncate">{value}</p>
          </div>
        ))}
      </div>

      {ex.description && (
        <div className="rounded-lg bg-muted/40 px-3 py-2">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Description</p>
          <p className="text-sm text-foreground leading-relaxed">{ex.description}</p>
        </div>
      )}
    </div>
  );
}

// ─── Exhibitor Form ───────────────────────────────────────────────────────────
interface ExhibitorFormProps {
  initial?: Partial<Exhibitor>;
  onSubmit: (data: Partial<Exhibitor>) => void;
  onCancel: () => void;
  loading: boolean;
}

function ExhibitorForm({ initial = {}, onSubmit, onCancel, loading }: ExhibitorFormProps) {
  const { data: events = [] } = useQuery({
    queryKey: ["event-options"],
    queryFn: fetchEventOptions,
    staleTime: 5 * 60 * 1000,
  });

  const [form, setForm] = useState<Partial<Exhibitor>>({
    company_name: "", sector: "", email: "", phone: "", website: "",
    city: "", country: "", company_size: "", employee_count: undefined,
    annual_revenue: undefined, export_experience: "local", description: "",
    event_id: undefined,
    ...initial,
  });

  function set(key: keyof Exhibitor, value: unknown) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = { ...form };
    if (!payload.description) delete payload.description;
    if (!payload.website) delete payload.website;
    onSubmit(payload);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 py-2">
      {/* Event assignment */}
      <div className="grid gap-1.5">
        <Label>Événement</Label>
        <Select
          value={form.event_id != null ? String(form.event_id) : "none"}
          onValueChange={(v) => set("event_id", v === "none" ? undefined : Number(v))}
        >
          <SelectTrigger><SelectValue placeholder="Sélectionner un événement" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Aucun événement</SelectItem>
            {events.map((e) => (
              <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="company_name">Nom de la société *</Label>
        <Input id="company_name" required placeholder="Ex: Atlas Fruits" value={form.company_name ?? ""}
          onChange={(e) => set("company_name", e.target.value)} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="sector">Secteur</Label>
          <Input id="sector" placeholder="Ex: Agroalimentaire" value={form.sector ?? ""}
            onChange={(e) => set("sector", e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label>Expérience export</Label>
          <Select value={form.export_experience ?? "local"} onValueChange={(v) => set("export_experience", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="local">Local</SelectItem>
              <SelectItem value="regional">Régional</SelectItem>
              <SelectItem value="international">International</SelectItem>
              <SelectItem value="global">Global</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" placeholder="contact@exemple.com" value={form.email ?? ""}
            onChange={(e) => set("email", e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="phone">Téléphone</Label>
          <Input id="phone" placeholder="+212 6xx xxx xxx" value={form.phone ?? ""}
            onChange={(e) => set("phone", e.target.value)} />
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="website">Site web</Label>
        <Input id="website" placeholder="https://exemple.com" value={form.website ?? ""}
          onChange={(e) => set("website", e.target.value)} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="city">Ville</Label>
          <Input id="city" placeholder="Casablanca" value={form.city ?? ""}
            onChange={(e) => set("city", e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="country">Pays</Label>
          <Input id="country" placeholder="Morocco" value={form.country ?? ""}
            onChange={(e) => set("country", e.target.value)} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="company_size">Taille société</Label>
          <Input id="company_size" placeholder="PME / GE…" value={form.company_size ?? ""}
            onChange={(e) => set("company_size", e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="employees">Employés</Label>
          <Input id="employees" type="number" value={form.employee_count ?? ""}
            onChange={(e) => set("employee_count", e.target.value ? Number(e.target.value) : undefined)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="revenue">CA annuel (MAD)</Label>
          <Input id="revenue" type="number" value={form.annual_revenue ?? ""}
            onChange={(e) => set("annual_revenue", e.target.value ? Number(e.target.value) : undefined)} />
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="description">Description</Label>
        <Textarea id="description" rows={3} placeholder="Décrivez l'entreprise…"
          value={form.description ?? ""} onChange={(e) => set("description", e.target.value)}
          className="resize-none" />
      </div>

      <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
        <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>Annuler</Button>
        <Button type="submit" disabled={loading} className="bg-gradient-primary text-primary-foreground shadow-glow-sm">
          {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {initial.id ? "Enregistrer" : "Créer l'exposant"}
        </Button>
      </div>
    </form>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
function ExposantsPage() {
  const qc = useQueryClient();
  const { activeEvent } = useEvent();
  const eventId = activeEvent.id !== "0" ? activeEvent.id : null;
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [sectorFilter, setSectorFilter] = useState("all");
  const [eventFilter, setEventFilter] = useState("all");

  const { data: events = [] } = useQuery({
    queryKey: ["event-options"],
    queryFn: fetchEventOptions,
    staleTime: 5 * 60 * 1000,
  });
  const eventMap = Object.fromEntries(events.map((e) => [e.id, e.name]));

  const [viewEx, setViewEx] = useState<Exhibitor | null>(null);
  const [editEx, setEditEx] = useState<Exhibitor | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Exhibitor | null>(null);

  const { data: exhibitors = [], isLoading, isError, error } = useQuery({
    queryKey: ["exhibitors", eventId],
    queryFn: () => fetchExhibitors(eventId),
    staleTime: 60_000,
  });

  const createMut = useMutation({
    mutationFn: createExhibitor,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["exhibitors"] }); setShowCreate(false); },
  });
  const updateMut = useMutation({
    mutationFn: updateExhibitor,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["exhibitors"] }); setEditEx(null); },
  });
  const deleteMut = useMutation({
    mutationFn: deleteExhibitor,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["exhibitors"] }); setDeleteTarget(null); },
  });

  const sectors = Array.from(new Set(exhibitors.map((e) => e.sector).filter(Boolean))) as string[];

  const filtered = exhibitors.filter((e) => {
    const name = (e.company_name ?? "").toLowerCase();
    if (search && !name.includes(search.toLowerCase())) return false;
    if (sectorFilter !== "all" && e.sector !== sectorFilter) return false;
    if (eventFilter !== "all" && String(e.event_id ?? "") !== eventFilter) return false;
    return true;
  });

  const PAGE_SIZE = 20;
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const totalRevenue = exhibitors.reduce((sum, e) => sum + (e.annual_revenue ?? 0), 0);
  const withLeads = exhibitors.filter((e) => e.leads_id != null).length;

  const statsConfig = [
    { label: "Total exposants", value: isLoading ? "…" : String(exhibitors.length), icon: Users, tone: "primary" },
    { label: "Pays représentés", value: isLoading ? "…" : String(new Set(exhibitors.map((e) => e.country)).size), icon: Globe, tone: "blue" },
    { label: "CA cumulé", value: isLoading ? "…" : formatRevenue(totalRevenue), icon: TrendingUp, tone: "green" },
    { label: "Avec leads", value: isLoading ? "…" : String(withLeads), icon: Users, tone: "amber" },
  ];

  // CSV export
  function handleExport() {
    const headers = ["ID", "Société", "Secteur", "Email", "Téléphone", "Ville", "Pays", "Taille", "CA annuel", "Expérience"];
    const rows = exhibitors.map((e) => [
      e.id, e.company_name ?? "", e.sector ?? "", e.email ?? "", e.phone ?? "",
      e.city ?? "", e.country ?? "", e.company_size ?? "",
      e.annual_revenue ?? "", e.export_experience ?? "",
    ]);
    const csv = [headers, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "exposants.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="p-6 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Exposants</h1>
          <p className="text-sm text-muted-foreground mt-1">Gérez vos exposants et leurs profils</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="h-9 bg-card" onClick={handleExport}>
            <Download className="h-4 w-4" /> Export CSV
          </Button>
          <Button className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-glow" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4" /> Nouvel exposant
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {statsConfig.map((s) => (
          <div key={s.label} className="rounded-xl border border-border bg-card p-4 hover:shadow-md transition-shadow">
            <div className={cn("flex h-9 w-9 items-center justify-center rounded-lg", toneStyles[s.tone])}>
              <s.icon className="h-4 w-4" />
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
          <Input placeholder="Rechercher un exposant..." className="h-10 pl-9 bg-card"
            value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
        {events.length > 0 && (
          <Select value={eventFilter} onValueChange={(v) => { setEventFilter(v); setPage(1); }}>
            <SelectTrigger className="w-52 h-10 bg-card">
              <SelectValue placeholder="Tous les événements" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les événements</SelectItem>
              {events.map((e) => (
                <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <div className="flex flex-wrap gap-2">
          <button onClick={() => { setSectorFilter("all"); setPage(1); }}
            className={cn("rounded-lg px-3 py-1.5 text-sm font-medium transition-colors border",
              sectorFilter === "all" ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-muted-foreground hover:text-foreground")}>
            Tous
          </button>
          {sectors.map((s) => (
            <button key={s} onClick={() => { setSectorFilter(s); setPage(1); }}
              className={cn("rounded-lg px-3 py-1.5 text-sm font-medium transition-colors border",
                sectorFilter === s ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-muted-foreground hover:text-foreground")}>
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-20 gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Chargement des exposants…</span>
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
                  {["Exposant", "Événement", "Secteur", "Localisation", "CA annuel", "Expérience", "Actions"].map((h) => (
                    <TableHead key={h} className={cn(
                      "text-xs font-semibold uppercase tracking-wider text-muted-foreground",
                      h === "Actions" ? "text-right" : "",
                    )}>{h}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginated.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-12 text-center text-sm text-muted-foreground">
                      Aucun exposant trouvé
                    </TableCell>
                  </TableRow>
                ) : (
                  paginated.map((ex) => {
                    const exp = ex.export_experience ?? "";
                    return (
                      <TableRow key={ex.id} className="hover:bg-muted/30 cursor-pointer" onClick={() => setViewEx(ex)}>
                        <TableCell className="py-3">
                          <div className="flex items-center gap-3">
                            <LogoInitials name={ex.company_name ?? `#${ex.id}`} />
                            <div>
                              <span className="text-sm font-medium text-foreground">{ex.company_name ?? `Exposant #${ex.id}`}</span>
                              {ex.email && <span className="block text-xs text-muted-foreground">{ex.email}</span>}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-[140px] truncate">
                          {ex.event_id && eventMap[ex.event_id]
                            ? <span className="text-primary/80 font-medium">{eventMap[ex.event_id]}</span>
                            : <span className="text-muted-foreground/50">—</span>}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{ex.sector ?? "—"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {[ex.city, ex.country].filter(Boolean).join(", ") || "—"}
                        </TableCell>
                        <TableCell className="text-sm font-semibold text-foreground tabular-nums">
                          {formatRevenue(ex.annual_revenue)}
                        </TableCell>
                        <TableCell>
                          {exp ? (
                            <span className={cn("inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium",
                              experienceStyles[exp] ?? "bg-muted text-muted-foreground ring-1 ring-inset ring-border")}>
                              {EXPERIENCE_LABELS[exp] ?? exp}
                            </span>
                          ) : <span className="text-sm text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                            <button
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                              onClick={() => setViewEx(ex)} title="Voir">
                              <Eye className="h-4 w-4" />
                            </button>
                            <button
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                              onClick={() => setEditEx(ex)} title="Modifier">
                              <Pencil className="h-4 w-4" />
                            </button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
                                  <MoreHorizontal className="h-4 w-4" />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-40">
                                <DropdownMenuItem onClick={() => setViewEx(ex)}>
                                  <Eye className="h-4 w-4 mr-2" /> Voir
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setEditEx(ex)}>
                                  <Pencil className="h-4 w-4 mr-2" /> Modifier
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onClick={() => setDeleteTarget(ex)}>
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
                {filtered.length} exposant{filtered.length !== 1 ? "s" : ""}
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
      <Sheet open={!!viewEx} onOpenChange={(o) => !o && setViewEx(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader className="mb-4">
            <SheetTitle>Fiche exposant</SheetTitle>
            <SheetDescription>Informations complètes sur cet exposant.</SheetDescription>
          </SheetHeader>
          {viewEx && (
            <>
              <ExhibitorDetail ex={viewEx} />
              <div className="flex gap-2 mt-6 pt-4 border-t border-border">
                <Button variant="outline" className="flex-1" onClick={() => setViewEx(null)}>
                  <X className="h-4 w-4 mr-2" /> Fermer
                </Button>
                <Button className="flex-1 bg-gradient-primary text-primary-foreground"
                  onClick={() => { setEditEx(viewEx); setViewEx(null); }}>
                  <Pencil className="h-4 w-4 mr-2" /> Modifier
                </Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Edit Sheet */}
      <Sheet open={!!editEx} onOpenChange={(o) => !o && setEditEx(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader className="mb-4">
            <SheetTitle>Modifier l'exposant</SheetTitle>
            <SheetDescription>Mettez à jour les informations de cet exposant.</SheetDescription>
          </SheetHeader>
          {editEx && (
            <ExhibitorForm
              initial={editEx}
              loading={updateMut.isPending}
              onCancel={() => setEditEx(null)}
              onSubmit={(data) => updateMut.mutate({ id: editEx.id, data })}
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
            <SheetTitle>Nouvel exposant</SheetTitle>
            <SheetDescription>Remplissez les informations pour créer un nouvel exposant.</SheetDescription>
          </SheetHeader>
          <ExhibitorForm
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
            <AlertDialogTitle>Supprimer cet exposant ?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-semibold text-foreground">"{deleteTarget?.company_name}"</span> sera supprimé définitivement.
              Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteMut.mutate(deleteTarget.id)}>
              {deleteMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
