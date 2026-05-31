import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  Plus, Download, Calendar, Mail, Briefcase,
  CheckCircle2, Clock, MoreHorizontal, Search,
  Loader2, AlertCircle, X,
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
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
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

interface Lead {
  id: number;
  source?: string;
  lead_score?: number;
  score?: number;
  interest_level?: string;
  status?: string;
  stage?: string;
  budget_range?: string;
  decision_power?: string;
  notes?: string;
  ai_summary?: string;
  created_at?: string;
  event_id?: number | null;
  [key: string]: unknown;
}

const INTEREST_LABELS: Record<string, string> = {
  hot: "Chaud", warm: "Tiède", cold: "Froid",
};
const DECISION_LABELS: Record<string, string> = {
  decision_maker: "Décideur", influencer: "Influenceur",
  gatekeeper: "Intermédiaire", end_user: "Utilisateur final",
};
const SOURCE_LABELS: Record<string, string> = {
  qr_scan: "Scan QR", manual: "Manuel", form: "Formulaire", import: "Import",
};
const interestBadge: Record<string, string> = {
  hot: "bg-red-100 text-red-700 border-red-200",
  warm: "bg-amber-100 text-amber-700 border-amber-200",
  cold: "bg-blue-100 text-blue-700 border-blue-200",
};

function getLeadScore(l: Lead) { return l.lead_score ?? l.score ?? 0; }
function getInterestLevel(l: Lead) {
  return (l.interest_level ?? l.status ?? l.stage ?? "cold").toLowerCase();
}
function scoreColor(score: number) {
  if (score >= 80) return "bg-emerald-100 text-emerald-700 border-emerald-200";
  if (score >= 60) return "bg-amber-100 text-amber-700 border-amber-200";
  return "bg-gray-100 text-gray-600 border-gray-200";
}
function Avatar({ name, size = "sm" }: { name: string; size?: "sm" | "lg" }) {
  const ini = name.split(" ").filter(Boolean).map((n) => n[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div className={cn(
      "flex items-center justify-center rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 font-semibold text-white shrink-0",
      size === "sm" ? "h-8 w-8 text-xs" : "h-16 w-16 text-lg",
    )}>{ini}</div>
  );
}

async function fetchLeads(eventId: string | null): Promise<Lead[]> {
  const url = eventId ? `/api/v1/leads?limit=500&event_id=${eventId}` : `/api/v1/leads?limit=500`;
  const raw = await apiRequest<Lead[] | { list: Lead[] }>(url);
  return Array.isArray(raw) ? raw : (raw.list ?? []);
}
async function createLead(data: Partial<Lead>): Promise<void> {
  await smartDbRequest("leads", "POST", data as Record<string, unknown>);
}

// ─── Lead Form ────────────────────────────────────────────────────────────────
function LeadForm({ onSubmit, onCancel, loading, eventId }: {
  onSubmit: (data: Partial<Lead>) => void;
  onCancel: () => void;
  loading: boolean;
  eventId?: string | null;
}) {
  const [form, setForm] = useState<Partial<Lead>>({
    source: "manual", interest_level: "warm",
    decision_power: "decision_maker", budget_range: "", notes: "", lead_score: undefined,
  });

  function set(key: keyof Lead, val: unknown) {
    setForm((p) => ({ ...p, [key]: val }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = { ...form };
    if (eventId) (payload as Record<string, unknown>).event_id = Number(eventId);
    onSubmit(payload);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 py-2">
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label>Source</Label>
          <Select value={form.source ?? "manual"} onValueChange={(v) => set("source", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="manual">Manuel</SelectItem>
              <SelectItem value="qr_scan">Scan QR</SelectItem>
              <SelectItem value="form">Formulaire</SelectItem>
              <SelectItem value="import">Import</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label>Niveau d'intérêt</Label>
          <Select value={form.interest_level ?? "warm"} onValueChange={(v) => set("interest_level", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="hot">Chaud</SelectItem>
              <SelectItem value="warm">Tiède</SelectItem>
              <SelectItem value="cold">Froid</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label>Pouvoir décisionnel</Label>
          <Select value={form.decision_power ?? "decision_maker"} onValueChange={(v) => set("decision_power", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="decision_maker">Décideur</SelectItem>
              <SelectItem value="influencer">Influenceur</SelectItem>
              <SelectItem value="gatekeeper">Intermédiaire</SelectItem>
              <SelectItem value="end_user">Utilisateur final</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="lead_score">Score (0–100)</Label>
          <Input id="lead_score" type="number" min={0} max={100} placeholder="75"
            value={form.lead_score ?? ""}
            onChange={(e) => set("lead_score", e.target.value ? Number(e.target.value) : undefined)} />
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="budget_range">Budget</Label>
        <Input id="budget_range" placeholder="Ex: 50 000 – 200 000 MAD"
          value={form.budget_range ?? ""} onChange={(e) => set("budget_range", e.target.value)} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="notes">Notes</Label>
        <Textarea id="notes" rows={3} placeholder="Informations supplémentaires sur ce lead…"
          value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)}
          className="resize-none" />
      </div>
      <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
        <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>Annuler</Button>
        <Button type="submit" disabled={loading} className="bg-purple-600 hover:bg-purple-700 text-white">
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          Créer le lead
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
  const [showCreate, setShowCreate] = useState(false);

  const createMut = useMutation({
    mutationFn: createLead,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["leads"] }); setShowCreate(false); },
  });

  const { data: leads = [], isLoading, isError, error } = useQuery({
    queryKey: ["leads", eventId],
    queryFn: () => fetchLeads(eventId),
    staleTime: 60_000,
  });

  const filtered = leads.filter((l) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      `Lead #${l.id}`.toLowerCase().includes(q) ||
      (l.source ?? "").toLowerCase().includes(q) ||
      (l.notes ?? "").toLowerCase().includes(q)
    );
  });

  const selected = leads.find((l) => l.id === selectedId) ?? leads[0] ?? null;

  function handleExport() {
    const headers = ["ID", "Source", "Intérêt", "Budget", "Score", "Décision", "Notes", "Créé le"];
    const rows = leads.map((l) => [
      l.id,
      SOURCE_LABELS[l.source ?? ""] ?? l.source ?? "",
      INTEREST_LABELS[getInterestLevel(l)] ?? getInterestLevel(l),
      l.budget_range ?? "",
      getLeadScore(l),
      DECISION_LABELS[l.decision_power ?? ""] ?? l.decision_power ?? "",
      (l.notes ?? "").replace(/,/g, ";"),
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
          <p className="text-sm text-muted-foreground">Suivi et qualification des leads générés pendant l'événement</p>
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
          <TabsTrigger value="rdv">RDV B2B</TabsTrigger>
        </TabsList>

        <TabsContent value="leads" className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Rechercher un lead..." className="h-9 pl-9 bg-card text-sm"
                value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
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
                      <TableHead>Source</TableHead>
                      <TableHead>Intérêt</TableHead>
                      <TableHead>Budget</TableHead>
                      <TableHead>Score</TableHead>
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
                        const interest = getInterestLevel(l);
                        const score = getLeadScore(l);
                        return (
                          <TableRow key={l.id} onClick={() => setSelectedId(l.id)}
                            className={cn("cursor-pointer",
                              selectedId === l.id && "bg-purple-50 hover:bg-purple-50 dark:bg-purple-950/20")}>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Avatar name={`L${l.id}`} />
                                <span className="font-medium text-foreground">Lead #{l.id}</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              {SOURCE_LABELS[l.source ?? ""] ?? l.source ?? "—"}
                            </TableCell>
                            <TableCell>
                              <span className={cn("inline-flex rounded-md border px-2 py-0.5 text-xs font-medium",
                                interestBadge[interest] ?? "bg-gray-100 text-gray-700 border-gray-200")}>
                                {INTEREST_LABELS[interest] ?? interest}
                              </span>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">{l.budget_range ?? "—"}</TableCell>
                            <TableCell>
                              {score > 0 ? (
                                <span className={cn("inline-flex min-w-[2.5rem] justify-center rounded-md border px-2 py-0.5 text-xs font-semibold", scoreColor(score))}>
                                  {score}
                                </span>
                              ) : <span className="text-sm text-muted-foreground">—</span>}
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
                        <Avatar name={`L${selected.id}`} size="lg" />
                        <div>
                          <h3 className="text-base font-semibold text-foreground">Lead #{selected.id}</h3>
                          <p className="text-sm text-muted-foreground">{SOURCE_LABELS[selected.source ?? ""] ?? selected.source ?? "—"}</p>
                          <span className={cn("inline-flex rounded-md border px-2 py-0.5 text-xs font-medium mt-1",
                            interestBadge[getInterestLevel(selected)] ?? "bg-gray-100 text-gray-700 border-gray-200")}>
                            {INTEREST_LABELS[getInterestLevel(selected)] ?? getInterestLevel(selected)}
                          </span>
                        </div>
                      </div>
                      <button className="text-muted-foreground hover:text-foreground">
                        <MoreHorizontal className="h-5 w-5" />
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-md border border-border p-3">
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Score IA
                        </div>
                        <div className="mt-1 text-sm font-semibold text-foreground">
                          {getLeadScore(selected) > 0 ? `${getLeadScore(selected)}/100` : "—"}
                        </div>
                      </div>
                      <div className="rounded-md border border-border p-3">
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Briefcase className="h-3.5 w-3.5" /> Pouvoir décisionnel
                        </div>
                        <div className="mt-1 text-sm font-semibold text-foreground">
                          {DECISION_LABELS[selected.decision_power ?? ""] ?? selected.decision_power ?? "—"}
                        </div>
                      </div>
                      <div className="rounded-md border border-border p-3">
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Mail className="h-3.5 w-3.5" /> Budget
                        </div>
                        <div className="mt-1 text-sm font-semibold text-foreground">{selected.budget_range ?? "—"}</div>
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

                    {selected.ai_summary && (
                      <div>
                        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Résumé IA</h4>
                        <p className="text-sm text-muted-foreground leading-relaxed italic">{selected.ai_summary}</p>
                      </div>
                    )}
                    {selected.notes && (
                      <div>
                        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Notes</h4>
                        <p className="text-sm text-muted-foreground leading-relaxed">{selected.notes}</p>
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

        <TabsContent value="rdv">
          <div className="rounded-lg border border-dashed border-border bg-card p-12 text-center text-muted-foreground">
            Module RDV B2B à venir.
          </div>
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
    </div>
  );
}
