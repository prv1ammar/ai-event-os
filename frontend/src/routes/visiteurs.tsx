import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Plus,
  Search,
  SlidersHorizontal,
  Eye,
  Pencil,
  MoreHorizontal,
  Users,
  CheckCircle2,
  Crown,
  Newspaper,
  Download,
  Upload,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  QrCode,
  X,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/api";
import { useState } from "react";

export const Route = createFileRoute("/visiteurs")({
  component: VisiteursPage,
  head: () => ({
    meta: [
      { title: "Visiteurs — AI EVENT" },
      { name: "description", content: "Gérez vos visiteurs." },
    ],
  }),
});

interface Visitor {
  id: number;
  firstname?: string;
  lastname?: string;
  first_name?: string;
  last_name?: string;
  name?: string;
  full_name?: string;
  email?: string;
  phone?: string;
  country?: string;
  city?: string;
  company?: string;
  organization?: string;
  job_title?: string;
  visitor_type?: string;
  ticket_type?: string;
  pack?: string;
  category?: string;
  buyer_level?: string;
  status?: string;
  badge_number?: string;
  badge_code?: string;
  badges_id?: number;
  leads_id?: number;
  created_at?: string;
  registration_date?: string;
  [key: string]: unknown;
}

const toneStyles: Record<string, string> = {
  primary: "bg-primary/10 text-primary",
  green: "bg-emerald-500/10 text-emerald-600",
  amber: "bg-amber-500/10 text-amber-600",
  sky: "bg-sky-500/10 text-sky-600",
};

const TICKET_LABELS: Record<string, string> = {
  vip: "VIP",
  standard: "Standard",
  press: "Presse",
  presse: "Presse",
  invite: "Invité",
  guest: "Invité",
  organizer: "Organisateur",
};

const ticketStyles: Record<string, string> = {
  vip: "bg-amber-500/15 text-amber-700 ring-1 ring-inset ring-amber-500/25",
  standard: "bg-sky-500/15 text-sky-700 ring-1 ring-inset ring-sky-500/25",
  press: "bg-purple-500/15 text-purple-700 ring-1 ring-inset ring-purple-500/25",
  presse: "bg-purple-500/15 text-purple-700 ring-1 ring-inset ring-purple-500/25",
  invite: "bg-emerald-500/15 text-emerald-700 ring-1 ring-inset ring-emerald-500/25",
  guest: "bg-emerald-500/15 text-emerald-700 ring-1 ring-inset ring-emerald-500/25",
  organizer: "bg-primary/15 text-primary ring-1 ring-inset ring-primary/25",
};

const statusStyles: Record<string, string> = {
  confirmed: "bg-emerald-500/15 text-emerald-700 ring-1 ring-inset ring-emerald-500/25",
  confirme: "bg-emerald-500/15 text-emerald-700 ring-1 ring-inset ring-emerald-500/25",
  registered: "bg-emerald-500/15 text-emerald-700 ring-1 ring-inset ring-emerald-500/25",
  pending: "bg-amber-500/15 text-amber-700 ring-1 ring-inset ring-amber-500/25",
  en_attente: "bg-amber-500/15 text-amber-700 ring-1 ring-inset ring-amber-500/25",
  cancelled: "bg-red-500/15 text-red-700 ring-1 ring-inset ring-red-500/25",
};

const STATUS_LABELS: Record<string, string> = {
  confirmed: "Confirmé",
  confirme: "Confirmé",
  registered: "Confirmé",
  pending: "En attente",
  en_attente: "En attente",
  cancelled: "Annulé",
};

function getFullName(v: Visitor): string {
  if (v.full_name) return v.full_name;
  if (v.name) return v.name;
  const first = v.firstname ?? v.first_name ?? "";
  const last = v.lastname ?? v.last_name ?? "";
  if (first || last) return `${first} ${last}`.trim();
  return `Visiteur #${v.id}`;
}

function getCompany(v: Visitor): string {
  return (v.company ?? v.organization ?? "—") as string;
}

function getTicketType(v: Visitor): string {
  return (v.visitor_type ?? v.ticket_type ?? v.pack ?? v.category ?? "standard").toLowerCase();
}

function getStatus(v: Visitor): string {
  return (v.status ?? "confirmed").toLowerCase();
}

function getBadge(v: Visitor): string {
  if (v.badge_number) return String(v.badge_number);
  if (v.badge_code) return String(v.badge_code);
  if (v.badges_id) return `#${v.badges_id}`;
  return "—";
}

function formatDate(iso?: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

async function fetchVisitors(): Promise<Visitor[]> {
  const raw = await apiRequest<Visitor[] | { list: Visitor[] }>(`/api/v1/visitors?limit=500`);
  return Array.isArray(raw) ? raw : (raw.list ?? []);
}

function Avatar({ name }: { name: string }) {
  const initials = name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-primary-glow/20 text-xs font-semibold text-primary">
      {initials || "V"}
    </div>
  );
}

function MockQRGrid({ size = 80 }: { size?: number }) {
  const n = 9;
  const cell = size / n;
  const corner = [
    [1,1,1,1,1,1,1],[1,0,0,0,0,0,1],[1,0,1,1,1,0,1],
    [1,0,1,1,1,0,1],[1,0,1,1,1,0,1],[1,0,0,0,0,0,1],[1,1,1,1,1,1,1],
  ];
  const rects: { x: number; y: number }[] = [];
  corner.forEach((row, r) => row.forEach((c, col) => { if (c) rects.push({ x: col * cell, y: r * cell }); }));
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (r < 7 && c < 7) continue;
      if (((r * 17 + c * 13) % 3) !== 0) rects.push({ x: c * cell, y: r * cell });
    }
  }
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="text-foreground">
      {rects.map(({ x, y }, i) => (
        <rect key={i} x={x + 0.5} y={y + 0.5} width={cell - 1} height={cell - 1} fill="currentColor" />
      ))}
    </svg>
  );
}

function VisitorDrawer({ visitor, open, onClose }: { visitor: Visitor | null; open: boolean; onClose: () => void }) {
  if (!visitor) return null;
  const name = getFullName(visitor);
  const ticketType = getTicketType(visitor);
  const status = getStatus(visitor);
  const badgeHeaderColor =
    ticketType === "vip" ? "bg-gradient-to-br from-purple-600 to-indigo-600" :
    ticketType === "press" || ticketType === "presse" ? "bg-orange-500" : "bg-sky-600";

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
              <p className="text-sm text-muted-foreground">{getCompany(visitor)}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className={cn("inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium",
                  ticketStyles[ticketType] ?? "bg-muted text-muted-foreground")}>
                  {TICKET_LABELS[ticketType] ?? ticketType}
                </span>
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
              {visitor.country && <><span className="text-muted-foreground">Pays</span><span className="text-foreground">{visitor.country}</span></>}
              {(visitor.created_at ?? visitor.registration_date) && (
                <><span className="text-muted-foreground">Inscription</span><span className="text-foreground">{formatDate(visitor.created_at ?? visitor.registration_date as string)}</span></>
              )}
            </div>
          </div>

          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">Badge d'accès</p>
            <div className="rounded-2xl border-2 border-primary/20 bg-card overflow-hidden shadow-card">
              <div className={cn("px-4 py-3 text-white text-center", badgeHeaderColor)}>
                <p className="text-[9px] tracking-[0.22em] uppercase opacity-80">AI EVENT OS · 2026</p>
                <p className="font-display text-sm font-bold tracking-wider uppercase mt-0.5">
                  {TICKET_LABELS[ticketType] ?? ticketType}
                </p>
              </div>
              <div className="flex flex-col items-center gap-3 px-6 py-5">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-primary/15 to-primary-glow/15 text-xl font-bold text-primary">
                  {name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("")}
                </div>
                <div>
                  <p className="font-display text-base font-bold text-foreground text-center">{name}</p>
                  <p className="text-xs text-muted-foreground text-center">{getCompany(visitor)}</p>
                </div>
                <div className="p-3 rounded-xl bg-muted/30 border border-border">
                  <MockQRGrid size={80} />
                </div>
                <p className="font-mono text-xs text-muted-foreground tracking-widest">{getBadge(visitor)}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-border px-5 py-4 flex gap-2">
          <Button className="flex-1 bg-gradient-primary text-primary-foreground shadow-glow-sm h-9 text-sm">
            <QrCode className="h-4 w-4" />
            Télécharger QR
          </Button>
          <Button variant="outline" className="h-9 text-sm">
            <Download className="h-4 w-4" />
            Badge PDF
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function VisiteursPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [packFilter, setPackFilter] = useState("all");
  const [selectedVisitor, setSelectedVisitor] = useState<Visitor | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const { data: visitors = [], isLoading, isError, error } = useQuery({
    queryKey: ["visitors"],
    queryFn: fetchVisitors,
  });

  const counts = {
    total: visitors.length,
    confirmed: visitors.filter((v) => ["confirmed", "confirme", "registered"].includes(getStatus(v))).length,
    vip: visitors.filter((v) => getTicketType(v) === "vip").length,
    press: visitors.filter((v) => ["press", "presse"].includes(getTicketType(v))).length,
  };

  const filtered = visitors.filter((v) => {
    const name = getFullName(v).toLowerCase();
    if (search && !name.includes(search.toLowerCase())) return false;
    if (packFilter !== "all" && getTicketType(v) !== packFilter) return false;
    return true;
  });

  const statsConfig = [
    { label: "Inscriptions totales", value: isLoading ? "…" : counts.total.toLocaleString("fr-FR"), icon: Users, tone: "primary" },
    { label: "Visiteurs confirmés", value: isLoading ? "…" : counts.confirmed.toLocaleString("fr-FR"), icon: CheckCircle2, tone: "green" },
    { label: "Visiteurs VIP", value: isLoading ? "…" : counts.vip.toLocaleString("fr-FR"), icon: Crown, tone: "amber" },
    { label: "Presse", value: isLoading ? "…" : counts.press.toLocaleString("fr-FR"), icon: Newspaper, tone: "sky" },
    {
      label: "Taux de confirmation",
      value: isLoading ? "…" : (counts.total > 0 ? `${Math.round((counts.confirmed / counts.total) * 100)}%` : "—"),
      icon: TrendingUp, tone: "primary",
    },
  ];

  return (
    <div className="p-5 md:p-6 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Visiteurs</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Gérez vos visiteurs et leurs accès</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-8 bg-card">
            <Upload className="h-3.5 w-3.5" />
            Import CSV
          </Button>
          <Button size="sm" className="h-8 bg-gradient-primary text-primary-foreground shadow-glow-sm">
            <Plus className="h-3.5 w-3.5" />
            Ajouter visiteur
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
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
            value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={packFilter} onValueChange={setPackFilter}>
          <SelectTrigger className="w-[140px] h-9 bg-card text-sm">
            <SelectValue placeholder="Tous les packs" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les packs</SelectItem>
            <SelectItem value="vip">VIP</SelectItem>
            <SelectItem value="standard">Standard</SelectItem>
            <SelectItem value="press">Presse</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" className="h-9 bg-card">
          <SlidersHorizontal className="h-4 w-4" />
          Filtres
        </Button>
        <Button variant="outline" size="sm" className="h-9 bg-card">
          <Download className="h-4 w-4" />
          Export
        </Button>
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
                  {["Visiteur", "Entreprise", "Pays", "Pack", "Statut", "Badge", "Inscription", "Actions"].map((h) => (
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
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-12 text-center text-sm text-muted-foreground">
                      Aucun visiteur trouvé
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((v) => {
                    const name = getFullName(v);
                    const ticketType = getTicketType(v);
                    const status = getStatus(v);
                    return (
                      <TableRow key={v.id} className="hover:bg-muted/30 cursor-pointer"
                        onClick={() => { setSelectedVisitor(v); setDrawerOpen(true); }}>
                        <TableCell className="py-2.5">
                          <div className="flex items-center gap-2.5">
                            <Avatar name={name} />
                            <span className="text-sm font-medium text-foreground">{name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground py-2.5">{getCompany(v)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground py-2.5">{v.country ?? "—"}</TableCell>
                        <TableCell className="py-2.5">
                          <span className={cn(
                            "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
                            ticketStyles[ticketType] ?? "bg-muted text-muted-foreground",
                          )}>
                            {TICKET_LABELS[ticketType] ?? ticketType}
                          </span>
                        </TableCell>
                        <TableCell className="py-2.5">
                          <span className={cn(
                            "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
                            statusStyles[status] ?? "bg-muted text-muted-foreground",
                          )}>
                            {STATUS_LABELS[status] ?? status}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs font-mono text-muted-foreground py-2.5">{getBadge(v)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap py-2.5">
                          {formatDate(v.created_at ?? v.registration_date as string)}
                        </TableCell>
                        <TableCell className="py-2.5" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => { setSelectedVisitor(v); setDrawerOpen(true); }}
                              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                            <button className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
                              <MoreHorizontal className="h-3.5 w-3.5" />
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
                <button className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground text-xs font-medium">
                  {page}
                </button>
                <button onClick={() => setPage((p) => p + 1)}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted">
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      <VisitorDrawer visitor={selectedVisitor} open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </div>
  );
}
