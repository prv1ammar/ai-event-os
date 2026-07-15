import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  Plus, Search, Eye, Pencil, MoreHorizontal, Users, CheckCircle2, Clock3,
  Download, ChevronLeft, ChevronRight, Loader2, AlertCircle, Trash2, X, Crown, Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import QRCode from "react-qr-code";
import { cn } from "@/lib/utils";
import { apiRequest, smartDbRequest } from "@/lib/api";

export const Route = createFileRoute("/exposants")({
  component: ExposantsPage,
  head: () => ({
    meta: [
      { title: "Exposants — AI EVENT" },
      { name: "description", content: "Gérez vos exposants." },
    ],
  }),
});

interface RelatedRef { id: number; name?: string; first_name?: string; order_number?: string }
interface VipRef { id: number; vip_level?: string; first_name?: string }

interface Exhibitor {
  id: number;
  first_name: string;
  last_name?: string;
  email?: string;
  phone?: string;
  company_name?: string;
  registration_status?: string;
  registration_date?: string;
  arrived_at?: string;
  events_id?: number;
  contacts_id?: number;
  events?: RelatedRef;
  contacts?: RelatedRef;
  badges?: unknown[];
  scans?: unknown[];
  "b2b meetings"?: unknown[];
  vip?: VipRef[];
  "verified company name"?: string | null;
  [key: string]: unknown;
}

const VIP_LEVELS = ["standard", "premium", "diamant"];
const VIP_LEVEL_LABELS: Record<string, string> = {
  standard: "Standard", premium: "Premium", diamant: "Diamant",
};
interface VipInfo { isVip: boolean; level: string; existingId?: number }

function isVip(ex: Exhibitor): boolean {
  return (ex.vip?.length ?? 0) > 0;
}
function vipLevelOf(ex: Exhibitor): string | undefined {
  return ex.vip?.[0]?.vip_level;
}

interface EventOption { id: number; name: string }

async function fetchEventOptions(): Promise<EventOption[]> {
  const raw = await apiRequest<EventOption[] | { list: EventOption[] }>("/api/v1/events?limit=100");
  const rows = Array.isArray(raw) ? raw : (raw.list ?? []);
  return rows.map((e) => ({ id: Number(e.id), name: String(e.name ?? `Event #${e.id}`) }));
}

// ─── API ─────────────────────────────────────────────────────────────────────
async function fetchExhibitors(eventId: string | null): Promise<Exhibitor[]> {
  const url = eventId
    ? `/api/v1/exhibitors?limit=100&event_id=${eventId}`
    : `/api/v1/exhibitors?limit=100`;
  const raw = await apiRequest<Exhibitor[] | { list: Exhibitor[] }>(url);
  return Array.isArray(raw) ? raw : (raw.list ?? []);
}

async function syncVip(person: Partial<Exhibitor>, personId: number, vipInfo: VipInfo): Promise<void> {
  const vipPayload = {
    first_name: person.first_name,
    last_name: person.last_name,
    email: person.email,
    phone: person.phone,
    company_name: person.company_name,
    vip_level: vipInfo.level,
    events_id: person.events_id,
    exposants_id: personId,
  };
  if (vipInfo.isVip) {
    if (vipInfo.existingId) {
      await smartDbRequest("vip", "PATCH", { id: vipInfo.existingId, ...vipPayload });
    } else {
      await smartDbRequest("vip", "POST", vipPayload as Record<string, unknown>);
    }
  } else if (vipInfo.existingId) {
    await smartDbRequest("vip", "DELETE", { id: vipInfo.existingId });
  }
}

async function createExhibitor({ data, vipInfo }: { data: Partial<Exhibitor>; vipInfo: VipInfo }): Promise<void> {
  const created = await smartDbRequest("exhibitors", "POST", data as Record<string, unknown>) as { id: number };
  await syncVip(data, created.id, vipInfo);
}

async function updateExhibitor({ id, data, vipInfo }: { id: number; data: Partial<Exhibitor>; vipInfo: VipInfo }): Promise<void> {
  await smartDbRequest("exhibitors", "PATCH", { id, ...data });
  await syncVip(data, id, vipInfo);
}

async function deleteExhibitor(id: number): Promise<void> {
  await smartDbRequest("exhibitors", "DELETE", { id });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const STATUS_LABELS: Record<string, string> = {
  pending: "En attente", confirmed: "Confirmé", cancelled: "Annulé", no_show: "Absent",
};
const statusStyles: Record<string, string> = {
  pending: "bg-amber-500/10 text-amber-600 ring-1 ring-inset ring-amber-500/20",
  confirmed: "bg-emerald-500/10 text-emerald-600 ring-1 ring-inset ring-emerald-500/20",
  cancelled: "bg-muted text-muted-foreground ring-1 ring-inset ring-border",
  no_show: "bg-rose-500/10 text-rose-600 ring-1 ring-inset ring-rose-500/20",
};
const toneStyles: Record<string, string> = {
  primary: "bg-primary/10 text-primary", green: "bg-emerald-500/10 text-emerald-600",
  amber: "bg-amber-500/10 text-amber-600", blue: "bg-sky-500/10 text-sky-600",
};

function fullName(ex: Exhibitor): string {
  return [ex.first_name, ex.last_name].filter(Boolean).join(" ") || `Exposant #${ex.id}`;
}

function fmtDateTime(iso?: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
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
  const status = ex.registration_status ?? "";
  const badgeCount = ex.badges?.length ?? 0;
  const scanCount = ex.scans?.length ?? 0;
  const meetingCount = ex["b2b meetings"]?.length ?? 0;
  const vip = isVip(ex);
  return (
    <div className="space-y-4 py-2">
      <div className="flex items-center gap-3">
        <LogoInitials name={ex.company_name ?? fullName(ex)} />
        <div>
          <p className="font-semibold text-foreground">{ex.company_name ?? `Exposant #${ex.id}`}</p>
          <p className="text-xs text-muted-foreground">{fullName(ex)}</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {vip && (
            <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 text-amber-700 ring-1 ring-inset ring-amber-500/25 px-2 py-0.5 text-xs font-medium">
              <Crown className="h-3 w-3" /> VIP {vipLevelOf(ex) ? `· ${VIP_LEVEL_LABELS[vipLevelOf(ex)!] ?? vipLevelOf(ex)}` : ""}
            </span>
          )}
          {status && (
            <span className={cn("inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium", statusStyles[status] ?? "bg-muted text-muted-foreground")}>
              {STATUS_LABELS[status] ?? status}
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        {[
          { label: "Email", value: ex.email ?? "—" },
          { label: "Téléphone", value: ex.phone ?? "—" },
          { label: "Événement", value: ex.events?.name ?? "—" },
          { label: "Société vérifiée (CRM)", value: ex["verified company name"] ?? "—" },
          { label: "Date d'inscription", value: fmtDateTime(ex.registration_date) },
          { label: "Arrivée sur site", value: fmtDateTime(ex.arrived_at) },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-lg bg-muted/40 px-3 py-2">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
            <p className="font-medium text-foreground mt-0.5 truncate">{value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-3 text-sm">
        {[
          { label: "Badges", value: badgeCount },
          { label: "Scans", value: scanCount },
          { label: "RDV B2B", value: meetingCount },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-lg bg-muted/40 px-3 py-2 text-center">
            <p className="text-lg font-bold text-foreground">{value}</p>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>

      {/* Badge d'accès */}
      <div className="rounded-lg bg-muted/40 p-3 space-y-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Badge d'accès</p>
        <div className="rounded-2xl border-2 border-emerald-200 bg-white overflow-hidden shadow-sm">
          <div className="bg-emerald-600 px-3 py-2 text-white text-center">
            <p className="text-[8px] tracking-widest uppercase opacity-80">AI EVENT OS</p>
            <p className="text-[10px] font-bold tracking-wider uppercase">EXPOSANT</p>
          </div>
          <div className="flex flex-col items-center gap-2 px-4 py-3">
            <div className="h-10 w-10 rounded-full bg-emerald-500/10 flex items-center justify-center text-sm font-bold text-emerald-600">
              {(ex.company_name ?? "EX").slice(0, 2).toUpperCase()}
            </div>
            <div className="text-center">
              <p className="text-xs font-bold text-gray-900">{ex.company_name ?? fullName(ex)}</p>
              <p className="text-[10px] text-gray-400">{fullName(ex)}</p>
            </div>
            <div className="p-2 rounded-lg bg-white border border-border">
              <QRCode
                value={`AIEVENT|EXH-${ex.id}|exhibitor|EXP-${String(ex.id).padStart(4, "0")}`}
                size={64}
                level="M"
              />
            </div>
            <p className="font-mono text-[9px] text-gray-400 tracking-widest">
              EXP-{String(ex.id).padStart(4, "0")}
            </p>
          </div>
          <div className="bg-emerald-500/10 px-3 py-1.5 text-center">
            <p className="text-[9px] font-semibold uppercase tracking-wider text-emerald-600">Accès exposant</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button className="flex-1 inline-flex items-center justify-center gap-1.5 h-8 rounded-md border border-border bg-card text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
            <Download className="h-3.5 w-3.5" /> Badge PDF
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Exhibitor Form ───────────────────────────────────────────────────────────
interface ExhibitorFormProps {
  initial?: Partial<Exhibitor>;
  onSubmit: (data: Partial<Exhibitor>, vipInfo: VipInfo) => void;
  onCancel: () => void;
  loading: boolean;
  activeEventId?: number;
}

function toDatetimeLocal(iso?: string): string {
  if (!iso) return "";
  return iso.slice(0, 16);
}

function ExhibitorForm({ initial = {}, onSubmit, onCancel, loading, activeEventId }: ExhibitorFormProps) {
  const { data: events = [] } = useQuery({
    queryKey: ["event-options"],
    queryFn: fetchEventOptions,
    staleTime: 5 * 60 * 1000,
  });

  const [form, setForm] = useState<Partial<Exhibitor>>({
    first_name: "", last_name: "", email: "", phone: "", company_name: "",
    registration_status: "pending",
    events_id: activeEventId,
    ...initial,
  });
  const existingVip = initial.vip?.[0];
  const [isVipChecked, setIsVipChecked] = useState(!!existingVip);
  const [vipLevel, setVipLevel] = useState(existingVip?.vip_level ?? "standard");

  function set(key: keyof Exhibitor, value: unknown) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = { ...form };
    delete payload.events;
    delete payload.contacts;
    delete payload.badges;
    delete payload.scans;
    delete payload["b2b meetings"];
    delete payload.vip;
    delete payload["verified company name"];
    if (!payload.last_name) delete payload.last_name;
    if (!payload.email) delete payload.email;
    if (!payload.phone) delete payload.phone;
    if (!payload.registration_date) delete payload.registration_date;
    if (!payload.arrived_at) delete payload.arrived_at;
    onSubmit(payload, { isVip: isVipChecked, level: vipLevel, existingId: existingVip?.id });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 py-2">
      {/* Event assignment */}
      <div className="grid gap-1.5">
        <Label>Événement *</Label>
        <Select
          required
          value={form.events_id != null ? String(form.events_id) : ""}
          onValueChange={(v) => set("events_id", Number(v))}
        >
          <SelectTrigger><SelectValue placeholder="Sélectionner un événement" /></SelectTrigger>
          <SelectContent>
            {events.map((e) => (
              <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="first_name">Prénom *</Label>
          <Input id="first_name" required placeholder="Ex: Nawal" value={form.first_name ?? ""}
            onChange={(e) => set("first_name", e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="last_name">Nom</Label>
          <Input id="last_name" placeholder="Ex: Iraqi" value={form.last_name ?? ""}
            onChange={(e) => set("last_name", e.target.value)} />
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="company_name">Société</Label>
        <Input id="company_name" placeholder="Ex: Atlas Cloud Solutions" value={form.company_name ?? ""}
          onChange={(e) => set("company_name", e.target.value)} />
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
        <Label>Statut d'inscription</Label>
        <Select value={form.registration_status ?? "pending"} onValueChange={(v) => set("registration_status", v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.entries(STATUS_LABELS).map(([v, label]) => (
              <SelectItem key={v} value={v}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="registration_date">Date d'inscription</Label>
          <Input id="registration_date" type="datetime-local"
            value={toDatetimeLocal(form.registration_date as string)}
            onChange={(e) => set("registration_date", e.target.value ? e.target.value + ":00" : undefined)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="arrived_at">Arrivée sur site</Label>
          <Input id="arrived_at" type="datetime-local"
            value={toDatetimeLocal(form.arrived_at as string)}
            onChange={(e) => set("arrived_at", e.target.value ? e.target.value + ":00" : undefined)} />
        </div>
      </div>

      <p className="text-xs text-muted-foreground -mt-2">
        Les informations détaillées de la société (secteur, taille, site web…) se gèrent dans le CRM.
      </p>

      <div className="grid gap-2 rounded-lg border border-border p-3">
        <div className="flex items-center justify-between">
          <Label className="flex items-center gap-1.5"><Crown className="h-3.5 w-3.5 text-amber-500" /> Invité VIP</Label>
          <button type="button" onClick={() => setIsVipChecked((v) => !v)}
            className={cn("rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
              isVipChecked ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground")}>
            {isVipChecked ? "Oui" : "Non"}
          </button>
        </div>
        {isVipChecked && (
          <div className="flex flex-wrap gap-2 pt-1">
            {VIP_LEVELS.map((lvl) => {
              const active = vipLevel === lvl;
              return (
                <button key={lvl} type="button" onClick={() => setVipLevel(lvl)}
                  className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                    active ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground hover:border-primary/40")}>
                  {VIP_LEVEL_LABELS[lvl]}
                  {active && <Check className="h-3 w-3" />}
                </button>
              );
            })}
          </div>
        )}
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
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [eventFilter, setEventFilter] = useState("all");

  const { data: events = [] } = useQuery({
    queryKey: ["event-options"],
    queryFn: fetchEventOptions,
    staleTime: 5 * 60 * 1000,
  });

  const [viewEx, setViewEx] = useState<Exhibitor | null>(null);
  const [editEx, setEditEx] = useState<Exhibitor | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Exhibitor | null>(null);

  const { data: exhibitors = [], isLoading, isError, error } = useQuery({
    queryKey: ["exhibitors", eventFilter],
    queryFn: () => fetchExhibitors(eventFilter !== "all" ? eventFilter : null),
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

  const filtered = exhibitors.filter((e) => {
    const q = search.toLowerCase();
    if (search) {
      const matches = [e.company_name, e.first_name, e.last_name, e.email]
        .filter(Boolean).some((v) => String(v).toLowerCase().includes(q));
      if (!matches) return false;
    }
    if (statusFilter !== "all" && e.registration_status !== statusFilter) return false;
    return true;
  });

  const PAGE_SIZE = 20;
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const confirmedCount = exhibitors.filter((e) => e.registration_status === "confirmed").length;
  const pendingCount = exhibitors.filter((e) => e.registration_status === "pending").length;
  const arrivedCount = exhibitors.filter((e) => !!e.arrived_at).length;

  const statsConfig = [
    { label: "Total exposants", value: isLoading ? "…" : String(exhibitors.length), icon: Users, tone: "primary" },
    { label: "Confirmés", value: isLoading ? "…" : String(confirmedCount), icon: CheckCircle2, tone: "green" },
    { label: "En attente", value: isLoading ? "…" : String(pendingCount), icon: Clock3, tone: "amber" },
    { label: "Arrivés sur site", value: isLoading ? "…" : String(arrivedCount), icon: Users, tone: "blue" },
  ];

  // CSV export
  function handleExport() {
    const headers = ["ID", "Prénom", "Nom", "Société", "Email", "Téléphone", "Statut", "Date inscription", "Arrivée", "Événement"];
    const rows = exhibitors.map((e) => [
      e.id, e.first_name ?? "", e.last_name ?? "", e.company_name ?? "", e.email ?? "", e.phone ?? "",
      STATUS_LABELS[e.registration_status ?? ""] ?? e.registration_status ?? "",
      e.registration_date ?? "", e.arrived_at ?? "", e.events?.name ?? "",
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
          <button onClick={() => { setStatusFilter("all"); setPage(1); }}
            className={cn("rounded-lg px-3 py-1.5 text-sm font-medium transition-colors border",
              statusFilter === "all" ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-muted-foreground hover:text-foreground")}>
            Tous
          </button>
          {Object.entries(STATUS_LABELS).map(([v, label]) => (
            <button key={v} onClick={() => { setStatusFilter(v); setPage(1); }}
              className={cn("rounded-lg px-3 py-1.5 text-sm font-medium transition-colors border",
                statusFilter === v ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-muted-foreground hover:text-foreground")}>
              {label}
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
                  {["Exposant", "Société", "Événement", "Statut", "Arrivée", "Actions"].map((h) => (
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
                    <TableCell colSpan={6} className="py-12 text-center text-sm text-muted-foreground">
                      Aucun exposant trouvé
                    </TableCell>
                  </TableRow>
                ) : (
                  paginated.map((ex) => {
                    const status = ex.registration_status ?? "";
                    const vip = isVip(ex);
                    return (
                      <TableRow key={ex.id} className="hover:bg-muted/30 cursor-pointer" onClick={() => setViewEx(ex)}>
                        <TableCell className="py-3">
                          <div className="flex items-center gap-3">
                            <LogoInitials name={ex.company_name ?? fullName(ex)} />
                            <div>
                              <span className="text-sm font-medium text-foreground">{fullName(ex)}</span>
                              {vip && (
                                <span className="ml-1.5 inline-flex items-center gap-0.5 rounded-full bg-amber-500/15 text-amber-700 px-1.5 py-0 text-[10px] font-semibold align-middle">
                                  <Crown className="h-2.5 w-2.5" /> {VIP_LEVEL_LABELS[vipLevelOf(ex) ?? ""] ?? "VIP"}
                                </span>
                              )}
                              {ex.email && <span className="block text-xs text-muted-foreground">{ex.email}</span>}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{ex.company_name ?? "—"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-[140px] truncate">
                          {ex.events?.name
                            ? <span className="text-primary/80 font-medium">{ex.events.name}</span>
                            : <span className="text-muted-foreground/50">—</span>}
                        </TableCell>
                        <TableCell>
                          {status ? (
                            <span className={cn("inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium",
                              statusStyles[status] ?? "bg-muted text-muted-foreground ring-1 ring-inset ring-border")}>
                              {STATUS_LABELS[status] ?? status}
                            </span>
                          ) : <span className="text-sm text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                          {ex.arrived_at ? fmtDateTime(ex.arrived_at) : "—"}
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
              onSubmit={(data, vipInfo) => updateMut.mutate({ id: editEx.id, data, vipInfo })}
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
            activeEventId={eventFilter !== "all" ? Number(eventFilter) : undefined}
            onCancel={() => setShowCreate(false)}
            onSubmit={(data, vipInfo) => createMut.mutate({ data, vipInfo })}
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
              <span className="font-semibold text-foreground">"{deleteTarget ? fullName(deleteTarget) : ""}"</span> sera supprimé définitivement.
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
