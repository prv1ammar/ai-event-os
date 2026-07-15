import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  Plus, Download, Mail, Briefcase, Building2, MapPin,
  CheckCircle2, Clock, Pencil, Trash2, Search, Phone,
  Loader2, AlertCircle, Calendar,
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
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { apiRequest, smartDbRequest } from "@/lib/api";
import { useEvent } from "@/lib/event-context";

export const Route = createFileRoute("/leads")({
  component: LeadsPage,
  head: () => ({
    meta: [
      { title: "Leads — AI EVENT" },
      { name: "description", content: "Gestion des leads et RDV B2B" },
    ],
  }),
});

interface RelatedRef { id: number; name?: string; first_name?: string }

interface Lead {
  id: number;
  first_name: string;
  last_name?: string;
  email?: string;
  phone?: string;
  whatsapp?: string;
  linkedin_url?: string;
  job_title?: string;
  country?: string;
  city?: string;
  source?: string;
  lead_status?: string;
  consent_marketing?: boolean;
  created_at?: string;
  events_id?: number;
  companies_id?: number;
  companies?: RelatedRef | null;
  event?: RelatedRef | null;
  orders?: unknown[];
  invoices?: unknown[];
  [key: string]: unknown;
}

interface Meeting {
  id: number;
  subject?: string;
  location?: string;
  start_time?: string;
  end_time?: string;
  status?: string;
  events?: RelatedRef | null;
  visiteurs?: RelatedRef | null;
  exposants?: RelatedRef | null;
  [key: string]: unknown;
}

const STATUS_LABELS: Record<string, string> = {
  new: "Nouveau", qualified: "Qualifié", contacted: "Contacté",
  converted: "Converti", lost: "Perdu",
};
const statusBadge: Record<string, string> = {
  new: "bg-sky-100 text-sky-700 border-sky-200",
  qualified: "bg-amber-100 text-amber-700 border-amber-200",
  contacted: "bg-purple-100 text-purple-700 border-purple-200",
  converted: "bg-emerald-100 text-emerald-700 border-emerald-200",
  lost: "bg-gray-100 text-gray-600 border-gray-200",
};
const SOURCE_LABELS: Record<string, string> = {
  chatbot: "Chatbot", whatsapp: "WhatsApp", form: "Formulaire",
  import: "Import", referral: "Recommandation", event: "Événement",
};
const MEETING_STATUS_LABELS: Record<string, string> = {
  requested: "Demandé", accepted: "Accepté", declined: "Refusé",
  cancelled: "Annulé", completed: "Terminé", no_show: "Absent",
};
const meetingBadge: Record<string, string> = {
  requested: "bg-amber-100 text-amber-700 border-amber-200",
  accepted: "bg-emerald-100 text-emerald-700 border-emerald-200",
  declined: "bg-gray-100 text-gray-600 border-gray-200",
  cancelled: "bg-gray-100 text-gray-600 border-gray-200",
  completed: "bg-sky-100 text-sky-700 border-sky-200",
  no_show: "bg-red-100 text-red-700 border-red-200",
};

function fullName(l: Lead): string {
  return [l.first_name, l.last_name].filter(Boolean).join(" ") || `Lead #${l.id}`;
}

function Avatar({ name, size = "sm" }: { name: string; size?: "sm" | "lg" }) {
  const ini = name.split(" ").filter(Boolean).map((n) => n[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div className={cn(
      "flex items-center justify-center rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 font-semibold text-white shrink-0",
      size === "sm" ? "h-8 w-8 text-xs" : "h-16 w-16 text-lg",
    )}>{ini || "L"}</div>
  );
}

function fmtDateTime(iso?: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

async function fetchLeads(eventId: string | null): Promise<Lead[]> {
  const url = eventId ? `/api/v1/leads?limit=500&event_id=${eventId}` : `/api/v1/leads?limit=500`;
  const raw = await apiRequest<Lead[] | { list: Lead[] }>(url);
  return Array.isArray(raw) ? raw : (raw.list ?? []);
}
async function fetchMeetings(eventId: string | null): Promise<Meeting[]> {
  const url = eventId ? `/api/v1/meetings?limit=500&event_id=${eventId}` : `/api/v1/meetings?limit=500`;
  const raw = await apiRequest<Meeting[] | { list: Meeting[] }>(url);
  return Array.isArray(raw) ? raw : (raw.list ?? []);
}
async function createLead(data: Partial<Lead>): Promise<void> {
  await smartDbRequest("leads", "POST", data as Record<string, unknown>);
}
async function updateLead({ id, data }: { id: number; data: Partial<Lead> }): Promise<void> {
  await smartDbRequest("leads", "PATCH", { id, ...data });
}
async function deleteLead(id: number): Promise<void> {
  await smartDbRequest("leads", "DELETE", { id });
}

interface EventOption { id: number; name: string }
async function fetchEventOptions(): Promise<EventOption[]> {
  const raw = await apiRequest<EventOption[] | { list: EventOption[] }>("/api/v1/events?limit=100");
  const rows = Array.isArray(raw) ? raw : (raw.list ?? []);
  return rows.map((e) => ({ id: Number(e.id), name: String(e.name ?? `Event #${e.id}`) }));
}

// ─── Lead Form ────────────────────────────────────────────────────────────────
function LeadForm({ initial = {}, onSubmit, onCancel, loading, eventId }: {
  initial?: Partial<Lead>;
  onSubmit: (data: Partial<Lead>) => void;
  onCancel: () => void;
  loading: boolean;
  eventId?: string | null;
}) {
  const { data: events = [] } = useQuery({
    queryKey: ["event-options"],
    queryFn: fetchEventOptions,
    staleTime: 5 * 60 * 1000,
  });

  const [form, setForm] = useState<Partial<Lead>>({
    first_name: "", last_name: "", email: "", phone: "", job_title: "",
    city: "", country: "", source: "event", lead_status: "new",
    events_id: eventId ? Number(eventId) : undefined,
    ...initial,
  });

  function set(key: keyof Lead, val: unknown) {
    setForm((p) => ({ ...p, [key]: val }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = { ...form };
    delete payload.companies;
    delete payload.event;
    delete payload.orders;
    delete payload.invoices;
    for (const k of Object.keys(payload)) {
      if (payload[k] === "" || payload[k] === undefined) delete payload[k];
    }
    onSubmit(payload);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 py-2">
      <div className="grid gap-1.5">
        <Label>Événement</Label>
        <Select
          value={form.events_id != null ? String(form.events_id) : "none"}
          onValueChange={(v) => set("events_id", v === "none" ? undefined : Number(v))}
        >
          <SelectTrigger><SelectValue placeholder="Sélectionner un événement" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Aucun (lead global)</SelectItem>
            {events.map((e) => (
              <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="first_name">Prénom *</Label>
          <Input id="first_name" required placeholder="Sara" value={form.first_name ?? ""}
            onChange={(e) => set("first_name", e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="last_name">Nom</Label>
          <Input id="last_name" placeholder="Bennis" value={form.last_name ?? ""}
            onChange={(e) => set("last_name", e.target.value)} />
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
        <Label htmlFor="job_title">Fonction</Label>
        <Input id="job_title" placeholder="Ex: Head of Product" value={form.job_title ?? ""}
          onChange={(e) => set("job_title", e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="city">Ville</Label>
          <Input id="city" placeholder="Rabat" value={form.city ?? ""}
            onChange={(e) => set("city", e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="country">Pays</Label>
          <Input id="country" placeholder="Maroc" value={form.country ?? ""}
            onChange={(e) => set("country", e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label>Source</Label>
          <Select value={form.source ?? "event"} onValueChange={(v) => set("source", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(SOURCE_LABELS).map(([v, label]) => (
                <SelectItem key={v} value={v}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label>Statut</Label>
          <Select value={form.lead_status ?? "new"} onValueChange={(v) => set("lead_status", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(STATUS_LABELS).map(([v, label]) => (
                <SelectItem key={v} value={v}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
        <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>Annuler</Button>
        <Button type="submit" disabled={loading} className="bg-purple-600 hover:bg-purple-700 text-white">
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          {initial.id ? "Enregistrer" : "Créer le lead"}
        </Button>
      </div>
    </form>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
function LeadsPage() {
  const qc = useQueryClient();
  const { activeEvent } = useEvent();
  const eventId = activeEvent.id !== "0" ? activeEvent.id : null;
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  const [editLead, setEditLead] = useState<Lead | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Lead | null>(null);

  const createMut = useMutation({
    mutationFn: createLead,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["leads"] }); setShowCreate(false); },
  });
  const updateMut = useMutation({
    mutationFn: updateLead,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["leads"] }); setEditLead(null); },
  });
  const deleteMut = useMutation({
    mutationFn: deleteLead,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["leads"] }); setDeleteTarget(null); setSelectedId(null); },
  });

  const { data: leads = [], isLoading, isError, error } = useQuery({
    queryKey: ["leads", eventId],
    queryFn: () => fetchLeads(eventId),
    staleTime: 60_000,
  });

  const { data: meetings = [], isLoading: meetingsLoading } = useQuery({
    queryKey: ["meetings", eventId],
    queryFn: () => fetchMeetings(eventId),
    staleTime: 60_000,
  });

  const filtered = leads.filter((l) => {
    if (statusFilter !== "all" && l.lead_status !== statusFilter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      fullName(l).toLowerCase().includes(q) ||
      (l.email ?? "").toLowerCase().includes(q) ||
      (l.companies?.name ?? "").toLowerCase().includes(q) ||
      (l.job_title ?? "").toLowerCase().includes(q)
    );
  });

  const selected = leads.find((l) => l.id === selectedId) ?? filtered[0] ?? null;

  function handleExport() {
    const headers = ["ID", "Prénom", "Nom", "Email", "Téléphone", "Fonction", "Société", "Ville", "Pays", "Source", "Statut", "Créé le"];
    const rows = leads.map((l) => [
      l.id, l.first_name ?? "", l.last_name ?? "", l.email ?? "", l.phone ?? "",
      l.job_title ?? "", l.companies?.name ?? "", l.city ?? "", l.country ?? "",
      SOURCE_LABELS[l.source ?? ""] ?? l.source ?? "",
      STATUS_LABELS[l.lead_status ?? ""] ?? l.lead_status ?? "",
      l.created_at ? new Date(l.created_at).toLocaleDateString("fr-FR") : "",
    ]);
    const csv = [headers, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "leads.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Gestion des Leads</h1>
          <p className="text-sm text-muted-foreground">Suivi et qualification des contacts générés pendant l'événement</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleExport}>
            <Download className="h-4 w-4" /> Export
          </Button>
          <Button className="bg-purple-600 hover:bg-purple-700 text-white" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4" /> Ajouter un lead
          </Button>
        </div>
      </div>

      <Tabs defaultValue="leads">
        <TabsList>
          <TabsTrigger value="leads">Leads ({isLoading ? "…" : leads.length})</TabsTrigger>
          <TabsTrigger value="rdv">RDV B2B ({meetingsLoading ? "…" : meetings.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="leads" className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Rechercher un lead..." className="h-9 pl-9 bg-card text-sm"
                value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
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

          {isLoading ? (
            <div className="flex items-center justify-center py-20 gap-2 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">Chargement des leads…</span>
            </div>
          ) : isError ? (
            <div className="flex items-center justify-center py-16 gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              <span className="text-sm">{error instanceof Error ? error.message : "Erreur de chargement"}</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
              <div className="lg:col-span-3 rounded-lg border border-border bg-card">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Lead</TableHead>
                      <TableHead>Société</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="py-12 text-center text-sm text-muted-foreground">
                          Aucun lead trouvé
                        </TableCell>
                      </TableRow>
                    ) : (
                      filtered.map((l) => {
                        const status = l.lead_status ?? "new";
                        return (
                          <TableRow key={l.id} onClick={() => setSelectedId(l.id)}
                            className={cn("cursor-pointer",
                              selected?.id === l.id && "bg-purple-50 hover:bg-purple-50 dark:bg-purple-950/20")}>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Avatar name={fullName(l)} />
                                <div>
                                  <span className="font-medium text-foreground">{fullName(l)}</span>
                                  {l.job_title && <span className="block text-xs text-muted-foreground">{l.job_title}</span>}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              {l.companies?.name ?? "—"}
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              {SOURCE_LABELS[l.source ?? ""] ?? l.source ?? "—"}
                            </TableCell>
                            <TableCell>
                              <span className={cn("inline-flex rounded-md border px-2 py-0.5 text-xs font-medium",
                                statusBadge[status] ?? "bg-gray-100 text-gray-700 border-gray-200")}>
                                {STATUS_LABELS[status] ?? status}
                              </span>
                            </TableCell>
                            <TableCell onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center justify-end gap-1">
                                <button onClick={() => setEditLead(l)}
                                  className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground" title="Modifier">
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                                <button onClick={() => setDeleteTarget(l)}
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
              </div>

              <aside className="lg:col-span-2 rounded-lg border border-border bg-card p-5 space-y-5">
                {selected ? (
                  <>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <Avatar name={fullName(selected)} size="lg" />
                        <div>
                          <h3 className="text-base font-semibold text-foreground">{fullName(selected)}</h3>
                          <p className="text-sm text-muted-foreground">{selected.job_title ?? "—"}</p>
                          <span className={cn("inline-flex rounded-md border px-2 py-0.5 text-xs font-medium mt-1",
                            statusBadge[selected.lead_status ?? "new"] ?? "bg-gray-100 text-gray-700 border-gray-200")}>
                            {STATUS_LABELS[selected.lead_status ?? "new"] ?? selected.lead_status}
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <button onClick={() => setEditLead(selected)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground" title="Modifier">
                          <Pencil className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-md border border-border p-3">
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Mail className="h-3.5 w-3.5" /> Email
                        </div>
                        <div className="mt-1 text-sm font-semibold text-foreground truncate">{selected.email ?? "—"}</div>
                      </div>
                      <div className="rounded-md border border-border p-3">
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Phone className="h-3.5 w-3.5" /> Téléphone
                        </div>
                        <div className="mt-1 text-sm font-semibold text-foreground">{selected.phone ?? "—"}</div>
                      </div>
                      <div className="rounded-md border border-border p-3">
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Building2 className="h-3.5 w-3.5" /> Société
                        </div>
                        <div className="mt-1 text-sm font-semibold text-foreground">{selected.companies?.name ?? "—"}</div>
                      </div>
                      <div className="rounded-md border border-border p-3">
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <MapPin className="h-3.5 w-3.5" /> Localisation
                        </div>
                        <div className="mt-1 text-sm font-semibold text-foreground">
                          {[selected.city, selected.country].filter(Boolean).join(", ") || "—"}
                        </div>
                      </div>
                      <div className="rounded-md border border-border p-3">
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Briefcase className="h-3.5 w-3.5" /> Commandes
                        </div>
                        <div className="mt-1 text-sm font-semibold text-foreground">{selected.orders?.length ?? 0}</div>
                      </div>
                      <div className="rounded-md border border-border p-3">
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Clock className="h-3.5 w-3.5" /> Créé le
                        </div>
                        <div className="mt-1 text-sm font-semibold text-foreground">
                          {selected.created_at
                            ? new Date(selected.created_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })
                            : "—"}
                        </div>
                      </div>
                    </div>

                    {selected.consent_marketing != null && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <CheckCircle2 className={cn("h-3.5 w-3.5", selected.consent_marketing ? "text-emerald-500" : "text-muted-foreground/40")} />
                        Consentement marketing : {selected.consent_marketing ? "oui" : "non"}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex items-center justify-center h-full text-sm text-muted-foreground py-12">
                    Sélectionnez un lead pour voir les détails
                  </div>
                )}
              </aside>
            </div>
          )}
        </TabsContent>

        <TabsContent value="rdv" className="space-y-4">
          {meetingsLoading ? (
            <div className="flex items-center justify-center py-20 gap-2 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">Chargement des RDV…</span>
            </div>
          ) : meetings.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-card p-12 text-center text-muted-foreground">
              Aucun RDV B2B planifié pour cet événement.
            </div>
          ) : (
            <div className="rounded-lg border border-border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Sujet</TableHead>
                    <TableHead>Lieu</TableHead>
                    <TableHead>Horaire</TableHead>
                    <TableHead>Participants</TableHead>
                    <TableHead>Statut</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {meetings.map((m) => {
                    const status = m.status ?? "requested";
                    const participants = [m.visiteurs?.first_name, m.exposants?.first_name].filter(Boolean).join(" ↔ ");
                    return (
                      <TableRow key={m.id}>
                        <TableCell className="font-medium text-foreground">{m.subject ?? `RDV #${m.id}`}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{m.location ?? "—"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                          <span className="inline-flex items-center gap-1">
                            <Calendar className="h-3.5 w-3.5" /> {fmtDateTime(m.start_time)}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{participants || "—"}</TableCell>
                        <TableCell>
                          <span className={cn("inline-flex rounded-md border px-2 py-0.5 text-xs font-medium",
                            meetingBadge[status] ?? "bg-gray-100 text-gray-700 border-gray-200")}>
                            {MEETING_STATUS_LABELS[status] ?? status}
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Create Sheet */}
      <Sheet open={showCreate} onOpenChange={setShowCreate}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader className="mb-4">
            <SheetTitle>Nouveau lead</SheetTitle>
            <SheetDescription>Qualifiez et enregistrez un nouveau lead.</SheetDescription>
          </SheetHeader>
          <LeadForm
            eventId={eventId}
            loading={createMut.isPending}
            onCancel={() => setShowCreate(false)}
            onSubmit={(data) => createMut.mutate(data)}
          />
          {createMut.isError && (
            <p className="text-xs text-destructive mt-2">{(createMut.error as Error).message}</p>
          )}
        </SheetContent>
      </Sheet>

      {/* Edit Sheet */}
      <Sheet open={!!editLead} onOpenChange={(o) => !o && setEditLead(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader className="mb-4">
            <SheetTitle>Modifier le lead</SheetTitle>
            <SheetDescription>Mettez à jour les informations de ce lead.</SheetDescription>
          </SheetHeader>
          {editLead && (
            <LeadForm
              initial={editLead}
              eventId={eventId}
              loading={updateMut.isPending}
              onCancel={() => setEditLead(null)}
              onSubmit={(data) => updateMut.mutate({ id: editLead.id, data })}
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
            <AlertDialogTitle>Supprimer ce lead ?</AlertDialogTitle>
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
