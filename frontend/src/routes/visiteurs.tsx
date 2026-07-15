import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import QRCode from "react-qr-code";
import {
  Plus,
  Search,
  Eye,
  Pencil,
  Trash2,
  Users,
  CheckCircle2,
  Crown,
  Clock3,
  Download,
  Upload,
  ChevronLeft,
  ChevronRight,
  QrCode,
  X,
  Loader2,
  AlertCircle,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { apiRequest, smartDbRequest } from "@/lib/api";
import { useEvent } from "@/lib/event-context";
import { useRef, useState } from "react";

export const Route = createFileRoute("/visiteurs")({
  component: VisiteursPage,
  head: () => ({
    meta: [
      { title: "Visiteurs — AI EVENT" },
      { name: "description", content: "Gérez vos visiteurs." },
    ],
  }),
});

interface RelatedRef { id: number; name?: string; first_name?: string }
interface VipRef { id: number; vip_level?: string; first_name?: string }

interface Visitor {
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
  events?: RelatedRef;
  badges?: unknown[];
  scans?: unknown[];
  "b2b meetings"?: unknown[];
  vip?: VipRef[];
  "badges - qr_code"?: string[];
  [key: string]: unknown;
}

const VIP_LEVELS = ["standard", "premium", "diamant"];
const VIP_LEVEL_LABELS: Record<string, string> = {
  standard: "Standard", premium: "Premium", diamant: "Diamant",
};

interface VipInfo { isVip: boolean; level: string; existingId?: number }

interface EventOption { id: number; name: string }

async function fetchEventOptions(): Promise<EventOption[]> {
  const raw = await apiRequest<EventOption[] | { list: EventOption[] }>("/api/v1/events?limit=100");
  const rows = Array.isArray(raw) ? raw : (raw.list ?? []);
  return rows.map((e) => ({ id: Number(e.id), name: String(e.name ?? `Event #${e.id}`) }));
}

const toneStyles: Record<string, string> = {
  primary: "bg-primary/10 text-primary",
  green: "bg-emerald-500/10 text-emerald-600",
  amber: "bg-amber-500/10 text-amber-600",
  sky: "bg-sky-500/10 text-sky-600",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "En attente", confirmed: "Confirmé", cancelled: "Annulé", no_show: "Absent",
};
const statusStyles: Record<string, string> = {
  pending: "bg-amber-500/15 text-amber-700 ring-1 ring-inset ring-amber-500/25",
  confirmed: "bg-emerald-500/15 text-emerald-700 ring-1 ring-inset ring-emerald-500/25",
  cancelled: "bg-muted text-muted-foreground ring-1 ring-inset ring-border",
  no_show: "bg-rose-500/15 text-rose-700 ring-1 ring-inset ring-rose-500/25",
};

function getFullName(v: Visitor): string {
  return [v.first_name, v.last_name].filter(Boolean).join(" ") || `Visiteur #${v.id}`;
}

function isVip(v: Visitor): boolean {
  return (v.vip?.length ?? 0) > 0;
}

function vipLevelOf(v: Visitor): string | undefined {
  return v.vip?.[0]?.vip_level;
}

function getBadgeCode(v: Visitor): string {
  const code = v["badges - qr_code"]?.[0];
  return code ?? "—";
}

function formatDate(iso?: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

function formatDateTime(iso?: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function toDatetimeLocal(iso?: string): string {
  if (!iso) return "";
  return iso.slice(0, 16);
}

async function fetchVisitors(eventId: string | null): Promise<Visitor[]> {
  const url = eventId
    ? `/api/v1/visitors?limit=500&event_id=${eventId}`
    : `/api/v1/visitors?limit=500`;
  const raw = await apiRequest<Visitor[] | { list: Visitor[] }>(url);
  return Array.isArray(raw) ? raw : (raw.list ?? []);
}

async function syncVip(person: Partial<Visitor>, personId: number, vipInfo: VipInfo): Promise<void> {
  const vipPayload = {
    first_name: person.first_name,
    last_name: person.last_name,
    email: person.email,
    phone: person.phone,
    company_name: person.company_name,
    vip_level: vipInfo.level,
    events_id: person.events_id,
    visiteurs_id: personId,
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

async function createVisitor({ data, vipInfo }: { data: Partial<Visitor>; vipInfo: VipInfo }): Promise<void> {
  const created = await smartDbRequest("visitors", "POST", data as Record<string, unknown>) as { id: number };
  await syncVip(data, created.id, vipInfo);
}

async function updateVisitor({ id, data, vipInfo }: { id: number; data: Partial<Visitor>; vipInfo: VipInfo }): Promise<void> {
  await smartDbRequest("visitors", "PATCH", { id, ...data });
  await syncVip(data, id, vipInfo);
}

async function deleteVisitor(id: number): Promise<void> {
  await smartDbRequest("visitors", "DELETE", { id });
}

// ─── Visitor Form ─────────────────────────────────────────────────────────────
function VisitorForm({ initial = {}, onSubmit, onCancel, loading, eventId }: {
  initial?: Partial<Visitor>;
  onSubmit: (data: Partial<Visitor>, vipInfo: VipInfo) => void;
  onCancel: () => void;
  loading: boolean;
  eventId?: string | null;
}) {
  const { data: events = [] } = useQuery({
    queryKey: ["event-options"],
    queryFn: fetchEventOptions,
    staleTime: 5 * 60 * 1000,
  });

  const [form, setForm] = useState<Partial<Visitor>>({
    first_name: "", last_name: "", email: "", phone: "", company_name: "",
    registration_status: "pending",
    events_id: eventId ? Number(eventId) : undefined,
    ...initial,
  });
  const existingVip = initial.vip?.[0];
  const [isVipChecked, setIsVipChecked] = useState(!!existingVip);
  const [vipLevel, setVipLevel] = useState(existingVip?.vip_level ?? "standard");

  function set(key: keyof Visitor, val: unknown) {
    setForm((p) => ({ ...p, [key]: val }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = { ...form };
    delete payload.events;
    delete payload.badges;
    delete payload.scans;
    delete payload["b2b meetings"];
    delete payload.vip;
    delete payload["badges - qr_code"];
    if (!payload.last_name) delete payload.last_name;
    if (!payload.email) delete payload.email;
    if (!payload.phone) delete payload.phone;
    if (!payload.company_name) delete payload.company_name;
    if (!payload.registration_date) delete payload.registration_date;
    if (!payload.arrived_at) delete payload.arrived_at;
    onSubmit(payload, { isVip: isVipChecked, level: vipLevel, existingId: existingVip?.id });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 py-2">
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
          <Input id="first_name" required placeholder="Mohamed" value={form.first_name ?? ""}
            onChange={(e) => set("first_name", e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="last_name">Nom</Label>
          <Input id="last_name" placeholder="Alaoui" value={form.last_name ?? ""}
            onChange={(e) => set("last_name", e.target.value)} />
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" placeholder="contact@exemple.com" value={form.email ?? ""}
          onChange={(e) => set("email", e.target.value)} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="company_name">Société</Label>
        <Input id="company_name" placeholder="Ex: Atlas Cloud Solutions" value={form.company_name ?? ""}
          onChange={(e) => set("company_name", e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="phone">Téléphone</Label>
          <Input id="phone" placeholder="+212 6xx xxx xxx" value={form.phone ?? ""}
            onChange={(e) => set("phone", e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label>Statut</Label>
          <Select value={form.registration_status ?? "pending"} onValueChange={(v) => set("registration_status", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(STATUS_LABELS).map(([v, label]) => (
                <SelectItem key={v} value={v}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
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
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                    active
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-card text-muted-foreground hover:border-primary/40",
                  )}>
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
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          {initial.id ? "Enregistrer" : "Créer le visiteur"}
        </Button>
      </div>
    </form>
  );
}

function Avatar({ name }: { name: string }) {
  const initials = name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-primary-glow/20 text-xs font-semibold text-primary">
      {initials || "V"}
    </div>
  );
}

function buildQRValue(visitor: Visitor, badgeNum: string): string {
  return `AIEVENT|${visitor.id}|visitor|${badgeNum}`;
}

function VisitorDrawer({ visitor, open, onClose, onEdit }: { visitor: Visitor | null; open: boolean; onClose: () => void; onEdit: () => void }) {
  if (!visitor) return null;
  const name = getFullName(visitor);
  const status = visitor.registration_status ?? "";
  const vip = isVip(visitor);
  const badgeNum = getBadgeCode(visitor);
  const qrValue = buildQRValue(visitor, badgeNum !== "—" ? badgeNum : `VIS-${String(visitor.id).padStart(4, "0")}`);

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent side="right" className="w-full sm:w-[400px] p-0 flex flex-col overflow-y-auto">
        <SheetHeader className="px-5 py-4 border-b border-border">
          <div className="flex items-center justify-between">
            <SheetTitle className="text-base font-semibold">Détails du pass</SheetTitle>
            <button onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
        </SheetHeader>

        <div className="flex-1 px-5 py-5 space-y-5">
          <div className="flex items-center gap-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-primary-glow/20 text-xl font-bold text-primary">
              {name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("")}
            </div>
            <div>
              <p className="font-display text-base font-semibold text-foreground">{name}</p>
              {visitor.events?.name && <p className="text-sm text-muted-foreground">{visitor.events.name}</p>}
              <div className="flex items-center gap-2 mt-1">
                {vip && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 text-amber-700 ring-1 ring-inset ring-amber-500/25 px-2 py-0.5 text-xs font-medium">
                    <Crown className="h-3 w-3" /> VIP {vipLevelOf(visitor) ? `· ${VIP_LEVEL_LABELS[vipLevelOf(visitor)!] ?? vipLevelOf(visitor)}` : ""}
                  </span>
                )}
                <span className={cn("inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium",
                  statusStyles[status] ?? "bg-muted text-muted-foreground")}>
                  {STATUS_LABELS[status] ?? status}
                </span>
              </div>
            </div>
          </div>

          <div className="space-y-2 rounded-xl border border-border bg-muted/30 p-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Informations de contact</p>
            <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-sm">
              {visitor.email && <><span className="text-muted-foreground">Email</span><span className="text-foreground font-medium truncate">{visitor.email}</span></>}
              {visitor.phone && <><span className="text-muted-foreground">Tél.</span><span className="text-foreground font-medium">{visitor.phone}</span></>}
              {visitor.company_name && <><span className="text-muted-foreground">Société</span><span className="text-foreground font-medium truncate">{visitor.company_name}</span></>}
              <span className="text-muted-foreground">Inscription</span><span className="text-foreground">{formatDate(visitor.registration_date)}</span>
              <span className="text-muted-foreground">Arrivée</span><span className="text-foreground">{formatDateTime(visitor.arrived_at)}</span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 text-sm">
            {[
              { label: "Scans", value: visitor.scans?.length ?? 0 },
              { label: "RDV B2B", value: visitor["b2b meetings"]?.length ?? 0 },
              { label: "Badges", value: visitor.badges?.length ?? 0 },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-lg bg-muted/40 px-3 py-2 text-center">
                <p className="text-lg font-bold text-foreground">{value}</p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
              </div>
            ))}
          </div>

          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">Badge d'accès</p>
            <div className="rounded-2xl border-2 border-primary/20 bg-card overflow-hidden shadow-card">
              <div className={cn("px-4 py-3 text-white text-center", vip ? "bg-gradient-to-br from-purple-600 to-indigo-600" : "bg-sky-600")}>
                <p className="text-[9px] tracking-[0.22em] uppercase opacity-80">AI EVENT OS</p>
                <p className="font-display text-sm font-bold tracking-wider uppercase mt-0.5">
                  {vip ? "VIP" : "Visiteur"}
                </p>
              </div>
              <div className="flex flex-col items-center gap-3 px-6 py-5">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-primary/15 to-primary-glow/15 text-xl font-bold text-primary">
                  {name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("")}
                </div>
                <p className="font-display text-base font-bold text-foreground text-center">{name}</p>
                <div className="p-3 rounded-xl bg-white border border-border">
                  <QRCode value={qrValue} size={80} level="M" />
                </div>
                <p className="font-mono text-xs text-muted-foreground tracking-widest">
                  {badgeNum !== "—" ? badgeNum : `VIS-${String(visitor.id).padStart(4, "0")}`}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-border px-5 py-4 flex gap-2">
          <Button variant="outline" className="h-9 text-sm" onClick={onEdit}>
            <Pencil className="h-4 w-4" /> Modifier
          </Button>
          <Button className="flex-1 bg-gradient-primary text-primary-foreground shadow-glow-sm h-9 text-sm">
            <QrCode className="h-4 w-4" />
            Télécharger QR
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function VisiteursPage() {
  const qc = useQueryClient();
  const { activeEvent } = useEvent();
  const eventId = activeEvent.id !== "0" ? activeEvent.id : null;
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedVisitor, setSelectedVisitor] = useState<Visitor | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editVisitor, setEditVisitor] = useState<Visitor | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Visitor | null>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);

  const createMut = useMutation({
    mutationFn: createVisitor,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["visitors"] }); setShowCreate(false); },
  });
  const updateMut = useMutation({
    mutationFn: updateVisitor,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["visitors"] }); setEditVisitor(null); },
  });
  const deleteMut = useMutation({
    mutationFn: deleteVisitor,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["visitors"] }); setDeleteTarget(null); setDrawerOpen(false); },
  });

  function handleImportCSV(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const text = ev.target?.result as string;
      const lines = text.trim().split("\n");
      const headers = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/"/g, ""));
      let created = 0;
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(",").map((c) => c.trim().replace(/"/g, ""));
        const row: Record<string, string> = {};
        headers.forEach((h, idx) => { if (cols[idx]) row[h] = cols[idx]; });
        const firstName = row.first_name ?? row.prenom ?? row.firstname ?? "";
        if (!firstName) continue;
        const payload: Partial<Visitor> = {
          first_name: firstName,
          last_name: row.last_name ?? row.nom ?? row.lastname ?? "",
          email: row.email ?? "",
          phone: row.phone ?? row.telephone ?? "",
          company_name: row.company_name ?? row.societe ?? row.entreprise ?? "",
          registration_status: row.registration_status ?? row.statut ?? "confirmed",
        };
        if (eventId) payload.events_id = Number(eventId);
        try {
          await createVisitor({ data: payload, vipInfo: { isVip: false, level: "standard" } });
          created++;
        } catch { /* skip malformed row */ }
      }
      qc.invalidateQueries({ queryKey: ["visitors"] });
      alert(`${created} visiteur(s) importé(s) avec succès.`);
      if (csvInputRef.current) csvInputRef.current.value = "";
    };
    reader.readAsText(file);
  }

  function handleExportCSV() {
    const headers = ["ID", "Prénom", "Nom", "Email", "Téléphone", "Société", "Statut", "Date inscription", "Arrivée", "VIP", "Niveau VIP", "Événement"];
    const rows = visitors.map((v) => [
      v.id, v.first_name ?? "", v.last_name ?? "", v.email ?? "", v.phone ?? "", v.company_name ?? "",
      STATUS_LABELS[v.registration_status ?? ""] ?? v.registration_status ?? "",
      v.registration_date ?? "", v.arrived_at ?? "", isVip(v) ? "Oui" : "Non",
      vipLevelOf(v) ? VIP_LEVEL_LABELS[vipLevelOf(v)!] ?? vipLevelOf(v) : "", v.events?.name ?? "",
    ]);
    const csv = [headers, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "visiteurs.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  const { data: visitors = [], isLoading, isError, error } = useQuery({
    queryKey: ["visitors", eventId],
    queryFn: () => fetchVisitors(eventId),
    staleTime: 60_000,
  });

  const counts = {
    total: visitors.length,
    confirmed: visitors.filter((v) => v.registration_status === "confirmed").length,
    pending: visitors.filter((v) => v.registration_status === "pending").length,
    vip: visitors.filter(isVip).length,
  };

  const filtered = visitors.filter((v) => {
    const name = getFullName(v).toLowerCase();
    if (search && !name.includes(search.toLowerCase()) && !(v.email ?? "").toLowerCase().includes(search.toLowerCase())) return false;
    if (statusFilter !== "all" && v.registration_status !== statusFilter) return false;
    return true;
  });

  const PAGE_SIZE = 20;
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const statsConfig = [
    { label: "Inscriptions totales", value: isLoading ? "…" : counts.total.toLocaleString("fr-FR"), icon: Users, tone: "primary" },
    { label: "Confirmés", value: isLoading ? "…" : counts.confirmed.toLocaleString("fr-FR"), icon: CheckCircle2, tone: "green" },
    { label: "En attente", value: isLoading ? "…" : counts.pending.toLocaleString("fr-FR"), icon: Clock3, tone: "amber" },
    { label: "VIP", value: isLoading ? "…" : counts.vip.toLocaleString("fr-FR"), icon: Crown, tone: "sky" },
  ];

  return (
    <div className="p-5 md:p-6 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Visiteurs</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Gérez vos visiteurs et leurs accès</p>
        </div>
        <div className="flex items-center gap-2">
          <input ref={csvInputRef} type="file" accept=".csv" className="hidden" onChange={handleImportCSV} />
          <Button variant="outline" size="sm" className="h-8 bg-card" onClick={() => csvInputRef.current?.click()}>
            <Upload className="h-3.5 w-3.5" />
            Import CSV
          </Button>
          <Button variant="outline" size="sm" className="h-8 bg-card" onClick={handleExportCSV}>
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </Button>
          <Button size="sm" className="h-8 bg-gradient-primary text-primary-foreground shadow-glow-sm" onClick={() => setShowCreate(true)}>
            <Plus className="h-3.5 w-3.5" />
            Ajouter visiteur
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {statsConfig.map((s) => (
          <div key={s.label} className="rounded-xl border border-border bg-card p-3 hover:shadow-md transition-shadow">
            <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg mb-2", toneStyles[s.tone])}>
              <s.icon className="h-4 w-4" />
            </div>
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <p className="text-xl font-bold text-foreground tracking-tight tabular-nums mt-0.5">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Rechercher un visiteur..." className="h-9 pl-9 bg-card text-sm"
            value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="w-[160px] h-9 bg-card text-sm">
            <SelectValue placeholder="Tous les statuts" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les statuts</SelectItem>
            {Object.entries(STATUS_LABELS).map(([v, label]) => (
              <SelectItem key={v} value={v}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-20 gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Chargement des visiteurs…</span>
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
                  {["Visiteur", "Société", "Événement", "Statut", "Badge", "Arrivée", "Actions"].map((h) => (
                    <TableHead key={h} className={cn(
                      "text-xs font-semibold uppercase tracking-wider text-muted-foreground py-2.5",
                      h === "Actions" && "text-right",
                    )}>
                      {h}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginated.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-12 text-center text-sm text-muted-foreground">
                      Aucun visiteur trouvé
                    </TableCell>
                  </TableRow>
                ) : (
                  paginated.map((v) => {
                    const name = getFullName(v);
                    const status = v.registration_status ?? "";
                    const vip = isVip(v);
                    return (
                      <TableRow key={v.id} className="hover:bg-muted/30 cursor-pointer"
                        onClick={() => { setSelectedVisitor(v); setDrawerOpen(true); }}>
                        <TableCell className="py-2.5">
                          <div className="flex items-center gap-2.5">
                            <Avatar name={name} />
                            <div>
                              <span className="text-sm font-medium text-foreground">{name}</span>
                              {vip && (
                                <span className="ml-1.5 inline-flex items-center gap-0.5 rounded-full bg-amber-500/15 text-amber-700 px-1.5 py-0 text-[10px] font-semibold align-middle">
                                  <Crown className="h-2.5 w-2.5" /> {VIP_LEVEL_LABELS[vipLevelOf(v) ?? ""] ?? "VIP"}
                                </span>
                              )}
                              {v.email && <span className="block text-xs text-muted-foreground">{v.email}</span>}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{v.company_name ?? "—"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-[140px] truncate">
                          {v.events?.name ?? "—"}
                        </TableCell>
                        <TableCell className="py-2.5">
                          <span className={cn(
                            "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
                            statusStyles[status] ?? "bg-muted text-muted-foreground",
                          )}>
                            {STATUS_LABELS[status] ?? status}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs font-mono text-muted-foreground py-2.5">{getBadgeCode(v)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap py-2.5">
                          {formatDate(v.arrived_at)}
                        </TableCell>
                        <TableCell className="py-2.5" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => { setSelectedVisitor(v); setDrawerOpen(true); }}
                              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground" title="Voir">
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                            <button onClick={() => setEditVisitor(v)}
                              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground" title="Modifier">
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button onClick={() => setDeleteTarget(v)}
                              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive" title="Supprimer">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
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
                {filtered.length} visiteur{filtered.length !== 1 ? "s" : ""}
              </p>
              <div className="flex items-center gap-1">
                <button disabled={page === 1} onClick={() => setPage((p) => p - 1)}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted disabled:opacity-50">
                  <ChevronLeft className="h-4 w-4" />
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                  <button key={p} onClick={() => setPage(p)}
                    className={cn("inline-flex h-7 w-7 items-center justify-center rounded-md text-xs font-medium",
                      p === page ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground hover:bg-muted")}>
                    {p}
                  </button>
                ))}
                <button disabled={page === totalPages} onClick={() => setPage((p) => p + 1)}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted disabled:opacity-50">
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      <VisitorDrawer
        visitor={selectedVisitor}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onEdit={() => { if (selectedVisitor) { setEditVisitor(selectedVisitor); setDrawerOpen(false); } }}
      />

      {/* Create Sheet */}
      <Sheet open={showCreate} onOpenChange={setShowCreate}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader className="mb-4">
            <SheetTitle>Nouveau visiteur</SheetTitle>
            <SheetDescription>Remplissez les informations pour créer un visiteur.</SheetDescription>
          </SheetHeader>
          <VisitorForm
            eventId={eventId}
            loading={createMut.isPending}
            onCancel={() => setShowCreate(false)}
            onSubmit={(data, vipInfo) => createMut.mutate({ data, vipInfo })}
          />
          {createMut.isError && (
            <p className="text-xs text-destructive mt-2">{(createMut.error as Error).message}</p>
          )}
        </SheetContent>
      </Sheet>

      {/* Edit Sheet */}
      <Sheet open={!!editVisitor} onOpenChange={(o) => !o && setEditVisitor(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader className="mb-4">
            <SheetTitle>Modifier le visiteur</SheetTitle>
            <SheetDescription>Mettez à jour les informations de ce visiteur.</SheetDescription>
          </SheetHeader>
          {editVisitor && (
            <VisitorForm
              initial={editVisitor}
              eventId={eventId}
              loading={updateMut.isPending}
              onCancel={() => setEditVisitor(null)}
              onSubmit={(data, vipInfo) => updateMut.mutate({ id: editVisitor.id, data, vipInfo })}
            />
          )}
          {updateMut.isError && (
            <p className="text-xs text-destructive mt-2">{(updateMut.error as Error).message}</p>
          )}
        </SheetContent>
      </Sheet>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce visiteur ?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-semibold text-foreground">"{deleteTarget ? getFullName(deleteTarget) : ""}"</span> sera supprimé définitivement.
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
