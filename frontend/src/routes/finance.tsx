import { createFileRoute } from "@tanstack/react-router";
import { useQueries } from "@tanstack/react-query";
import { Download, Wallet, TrendingUp, Receipt, PiggyBank, Loader2 } from "lucide-react";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { PageShell, Surface } from "@/components/PageShell";
import { KpiCard, type KpiTone } from "@/components/KpiCard";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/api";
import { useEvent } from "@/lib/event-context";

export const Route = createFileRoute("/finance")({
  component: Finance,
  head: () => ({
    meta: [
      { title: "Finance — AI EVENT OS" },
      { name: "description", content: "Commandes, paiements, factures et reporting financier." },
    ],
  }),
});

interface RelatedRef { id: number; name?: string; order_number?: string }

interface Order {
  id: number;
  order_number?: string;
  total?: number | string;
  order_type?: string;   // billet | stand | sponsoring | package
  source?: string;       // website | whatsapp | chatbot | manual | landing_page
  status?: string;       // draft | pending | paid | partial | cancelled | refunded
  payment_due_date?: string;
  created_at?: string;
  events_id?: number;
  events?: RelatedRef | null;
  contacts?: RelatedRef | null;
  companies?: RelatedRef | null;
  [key: string]: unknown;
}

interface Payment {
  id: number;
  payment_type?: string;    // charge | refund
  amount?: number | string;
  payment_method?: string;  // card | bank_transfer | cash | mobile_money | paypal
  provider?: string;
  transaction_reference?: string;
  status?: string;          // pending | processing | completed | failed | refunded
  paid_at?: string;
  orders?: RelatedRef | null;
  [key: string]: unknown;
}

interface Invoice {
  id: number;
  invoice_number?: string;
  total?: number | string;
  status?: string;          // draft | issued | paid | overdue | cancelled
  issued_at?: string;
  due_date?: string;
  paid_at?: string;
  pdf_url?: string;
  companies?: RelatedRef | null;
  contacts?: RelatedRef | null;
  [key: string]: unknown;
}

async function fetchList<T>(path: string): Promise<T[]> {
  const raw = await apiRequest<T[] | { list: T[] }>(path);
  return Array.isArray(raw) ? raw : (raw.list ?? []);
}

function num(v: number | string | undefined): number {
  const n = Number(v ?? 0);
  return isNaN(n) ? 0 : n;
}

function fmtShort(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M MAD`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K MAD`;
  return `${Math.round(n)} MAD`;
}

function fmt(n: number) {
  return n.toLocaleString("fr-FR") + " MAD";
}

function fmtDate(iso?: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

const ORDER_TYPE_LABELS: Record<string, string> = {
  billet: "Billets", stand: "Stands", sponsoring: "Sponsoring", package: "Packages",
};
const ORDER_TYPE_COLORS: Record<string, string> = {
  billet: "oklch(0.55 0.24 280)",
  stand: "oklch(0.68 0.17 152)",
  sponsoring: "oklch(0.78 0.16 75)",
  package: "oklch(0.7 0.15 230)",
};
const ORDER_STATUS_LABELS: Record<string, string> = {
  draft: "Brouillon", pending: "En attente", paid: "Payée", partial: "Partielle",
  cancelled: "Annulée", refunded: "Remboursée",
};
const orderStatusStyle: Record<string, string> = {
  paid: "bg-success/10 text-success ring-success/20",
  partial: "bg-sky-500/10 text-sky-600 ring-sky-500/20",
  pending: "bg-warning/10 text-warning ring-warning/20",
  draft: "bg-muted text-muted-foreground ring-border",
  cancelled: "bg-muted text-muted-foreground ring-border",
  refunded: "bg-destructive/10 text-destructive ring-destructive/20",
};
const SOURCE_LABELS: Record<string, string> = {
  website: "Site web", whatsapp: "WhatsApp", chatbot: "Chatbot",
  manual: "Manuel", landing_page: "Landing page",
};
const PAYMENT_METHOD_LABELS: Record<string, string> = {
  card: "Carte", bank_transfer: "Virement", cash: "Espèces",
  mobile_money: "Mobile money", paypal: "PayPal",
};
const PAYMENT_STATUS_LABELS: Record<string, string> = {
  pending: "En attente", processing: "En cours", completed: "Complété",
  failed: "Échoué", refunded: "Remboursé",
};
const INVOICE_STATUS_LABELS: Record<string, string> = {
  draft: "Brouillon", issued: "Émise", paid: "Payée", overdue: "En retard", cancelled: "Annulée",
};
const invoiceStatusStyle: Record<string, string> = {
  paid: "bg-success/10 text-success ring-success/20",
  issued: "bg-sky-500/10 text-sky-600 ring-sky-500/20",
  overdue: "bg-destructive/10 text-destructive ring-destructive/20",
  draft: "bg-muted text-muted-foreground ring-border",
  cancelled: "bg-muted text-muted-foreground ring-border",
};

const PAID_STATUSES = new Set(["paid", "partial"]);

function Finance() {
  const { activeEvent } = useEvent();
  const eventId = activeEvent.id !== "0" ? activeEvent.id : null;

  const results = useQueries({
    queries: [
      {
        queryKey: ["fin-orders", eventId],
        queryFn: () => fetchList<Order>(eventId ? `/api/v1/orders?limit=500&event_id=${eventId}` : "/api/v1/orders?limit=500"),
      },
      { queryKey: ["fin-payments"], queryFn: () => fetchList<Payment>("/api/v1/payments?limit=500") },
      { queryKey: ["fin-invoices"], queryFn: () => fetchList<Invoice>("/api/v1/invoices?limit=500") },
    ],
  });

  const orders = results[0].data ?? [];
  const payments = results[1].data ?? [];
  const invoices = results[2].data ?? [];
  const isLoading = results.some((r) => r.isLoading);

  const revenuePaid = orders.filter((o) => PAID_STATUSES.has(o.status ?? "")).reduce((s, o) => s + num(o.total), 0);
  const revenuePending = orders.filter((o) => o.status === "pending").reduce((s, o) => s + num(o.total), 0);
  const invoicesPaid = invoices.filter((i) => i.status === "paid").length;
  const invoicesOverdue = invoices.filter((i) => i.status === "overdue").length;

  const kpis = [
    {
      label: "Revenu encaissé",
      value: isLoading ? "…" : fmtShort(revenuePaid),
      delta: `${orders.filter((o) => PAID_STATUSES.has(o.status ?? "")).length} commandes`,
      sub: "payées ou partielles",
      icon: Wallet,
      tone: "primary" as KpiTone,
    },
    {
      label: "En attente",
      value: isLoading ? "…" : fmtShort(revenuePending),
      delta: `${orders.filter((o) => o.status === "pending").length} commandes`,
      sub: "à encaisser",
      icon: Receipt,
      tone: "amber" as KpiTone,
    },
    {
      label: "Commandes",
      value: isLoading ? "…" : String(orders.length),
      delta: eventId ? "événement actif" : "toutes",
      sub: "billets, stands, sponsoring",
      icon: TrendingUp,
      tone: "green" as KpiTone,
    },
    {
      label: "Factures",
      value: isLoading ? "…" : String(invoices.length),
      delta: `${invoicesPaid} payées`,
      sub: invoicesOverdue > 0 ? `${invoicesOverdue} en retard` : "aucun retard",
      icon: PiggyBank,
      tone: "rose" as KpiTone,
    },
  ];

  // Pie: revenue by order type
  const revenueByType = Object.entries(
    orders.reduce<Record<string, number>>((acc, o) => {
      const t = o.order_type ?? "billet";
      acc[t] = (acc[t] ?? 0) + num(o.total);
      return acc;
    }, {})
  ).map(([k, v]) => ({
    key: k,
    name: ORDER_TYPE_LABELS[k] ?? k,
    value: v,
    color: ORDER_TYPE_COLORS[k] ?? "oklch(0.6 0.05 270)",
  })).filter((d) => d.value > 0);
  const totalRevenue = revenueByType.reduce((a, b) => a + b.value, 0);

  // Bar: revenue by source
  const revenueBySource = Object.entries(
    orders.reduce<Record<string, number>>((acc, o) => {
      const s = o.source ?? "manual";
      acc[s] = (acc[s] ?? 0) + num(o.total);
      return acc;
    }, {})
  ).map(([k, v]) => ({ name: SOURCE_LABELS[k] ?? k, value: Math.round(v / 1000) }));

  const sortedOrders = [...orders].sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));

  function handleExport() {
    const headers = ["N° commande", "Type", "Source", "Total (MAD)", "Statut", "Échéance", "Événement"];
    const rows = orders.map((o) => [
      o.order_number ?? o.id,
      ORDER_TYPE_LABELS[o.order_type ?? ""] ?? o.order_type ?? "",
      SOURCE_LABELS[o.source ?? ""] ?? o.source ?? "",
      num(o.total),
      ORDER_STATUS_LABELS[o.status ?? ""] ?? o.status ?? "",
      o.payment_due_date ?? "",
      o.events?.name ?? "",
    ]);
    const csv = [headers, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "commandes.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <PageShell
      eyebrow="Finance"
      title="Suivi financier & revenus"
      description="Commandes, paiements et factures — chiffres en temps réel depuis TybotFlow."
      actions={
        <Button variant="outline" size="sm" className="h-9" onClick={handleExport}>
          <Download className="h-4 w-4" /> Exporter
        </Button>
      }
    >
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {kpis.map((k) => (
          <KpiCard key={k.label} {...k} />
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Surface className="p-6">
          <h2 className="font-display text-base font-semibold text-foreground">Revenus par type de commande</h2>
          <p className="text-xs text-muted-foreground mt-0.5 mb-4">
            {isLoading ? "Chargement…" : `${fmtShort(totalRevenue)} au total (toutes commandes)`}
          </p>
          {revenueByType.length === 0 ? (
            <div className="flex items-center justify-center h-52 text-sm text-muted-foreground">
              {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Aucune commande"}
            </div>
          ) : (
            <div className="flex items-center gap-6">
              <div className="relative h-52 w-52 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={revenueByType} innerRadius={60} outerRadius={92} paddingAngle={2} dataKey="value" stroke="none">
                      {revenueByType.map((e) => <Cell key={e.key} fill={e.color} />)}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <p className="font-display text-xl font-bold text-foreground tabular-nums">{fmtShort(totalRevenue)}</p>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total</p>
                </div>
              </div>
              <ul className="flex-1 space-y-2 min-w-0">
                {revenueByType.map((b) => {
                  const pct = totalRevenue > 0 ? ((b.value / totalRevenue) * 100).toFixed(1) : "0";
                  return (
                    <li key={b.key} className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-2 min-w-0">
                        <span className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ background: b.color }} />
                        <span className="text-foreground truncate">{b.name}</span>
                      </span>
                      <span className="text-muted-foreground tabular-nums">{fmtShort(b.value)} <span className="opacity-60">({pct}%)</span></span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </Surface>

        <Surface className="p-6">
          <h2 className="font-display text-base font-semibold text-foreground">Revenus par source</h2>
          <p className="text-xs text-muted-foreground mt-0.5 mb-4">Canal d'acquisition · en milliers MAD</p>
          {revenueBySource.length === 0 ? (
            <div className="flex items-center justify-center h-52 text-sm text-muted-foreground">
              {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Aucune commande"}
            </div>
          ) : (
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={revenueBySource} margin={{ top: 10, right: 10, bottom: 0, left: -10 }}>
                  <defs>
                    <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="oklch(0.55 0.24 280)" />
                      <stop offset="100%" stopColor="oklch(0.72 0.21 295)" />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.92 0.012 285)" vertical={false} />
                  <XAxis dataKey="name" stroke="oklch(0.5 0.03 270)" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="oklch(0.5 0.03 270)" fontSize={11} tickLine={false} axisLine={false} />
                  <Tooltip
                    formatter={(v) => [`${v}K MAD`, "Revenu"]}
                    contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 12 }}
                    cursor={{ fill: "oklch(0.96 0.01 285)" }}
                  />
                  <Bar dataKey="value" fill="url(#barGrad)" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Surface>
      </div>

      {/* Orders table */}
      <Surface className="p-0 overflow-hidden">
        <div className="border-b border-border/60 px-5 py-4">
          <h2 className="font-display font-semibold text-foreground">Commandes</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {isLoading ? "Chargement…" : `${orders.length} commande${orders.length !== 1 ? "s" : ""}${eventId ? " pour l'événement actif" : ""}`}
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-5 py-2.5 text-left font-medium">N° commande</th>
                <th className="px-5 py-2.5 text-left font-medium">Type</th>
                <th className="px-5 py-2.5 text-left font-medium">Source</th>
                <th className="px-5 py-2.5 text-left font-medium">Client</th>
                <th className="px-5 py-2.5 text-right font-medium">Total</th>
                <th className="px-5 py-2.5 text-left font-medium">Échéance</th>
                <th className="px-5 py-2.5 text-left font-medium">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {sortedOrders.length === 0 ? (
                <tr><td colSpan={7} className="px-5 py-10 text-center text-muted-foreground">Aucune commande</td></tr>
              ) : sortedOrders.map((o) => (
                <tr key={o.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-5 py-2.5 font-mono text-xs font-medium text-foreground">{o.order_number ?? `#${o.id}`}</td>
                  <td className="px-5 py-2.5 text-muted-foreground">{ORDER_TYPE_LABELS[o.order_type ?? ""] ?? o.order_type ?? "—"}</td>
                  <td className="px-5 py-2.5 text-muted-foreground">{SOURCE_LABELS[o.source ?? ""] ?? o.source ?? "—"}</td>
                  <td className="px-5 py-2.5 text-muted-foreground">{o.companies?.name ?? o.contacts?.name ?? "—"}</td>
                  <td className="px-5 py-2.5 text-right font-medium tabular-nums">{fmt(num(o.total))}</td>
                  <td className="px-5 py-2.5 text-muted-foreground tabular-nums">{fmtDate(o.payment_due_date)}</td>
                  <td className="px-5 py-2.5">
                    <span className={cn(
                      "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ring-1 ring-inset",
                      orderStatusStyle[o.status ?? ""] ?? "bg-muted text-muted-foreground ring-border",
                    )}>
                      {ORDER_STATUS_LABELS[o.status ?? ""] ?? o.status ?? "—"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Surface>

      {/* Payments + invoices */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Surface className="p-0 overflow-hidden">
          <div className="border-b border-border/60 px-5 py-3.5">
            <h2 className="font-display font-semibold text-foreground">Derniers paiements</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{payments.length} transaction{payments.length !== 1 ? "s" : ""}</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-5 py-2.5 text-left font-medium">Référence</th>
                  <th className="px-5 py-2.5 text-left font-medium">Méthode</th>
                  <th className="px-5 py-2.5 text-right font-medium">Montant</th>
                  <th className="px-5 py-2.5 text-left font-medium">Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {payments.length === 0 ? (
                  <tr><td colSpan={4} className="px-5 py-10 text-center text-muted-foreground">Aucun paiement</td></tr>
                ) : payments.map((p) => (
                  <tr key={p.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-5 py-2.5 font-mono text-xs text-foreground">{p.transaction_reference ?? `#${p.id}`}</td>
                    <td className="px-5 py-2.5 text-muted-foreground">{PAYMENT_METHOD_LABELS[p.payment_method ?? ""] ?? p.payment_method ?? "—"}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums font-medium">
                      {p.payment_type === "refund" ? "-" : ""}{fmt(num(p.amount))}
                    </td>
                    <td className="px-5 py-2.5 text-muted-foreground">{PAYMENT_STATUS_LABELS[p.status ?? ""] ?? p.status ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Surface>

        <Surface className="p-0 overflow-hidden">
          <div className="border-b border-border/60 px-5 py-3.5">
            <h2 className="font-display font-semibold text-foreground">Factures</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{invoices.length} facture{invoices.length !== 1 ? "s" : ""}</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-5 py-2.5 text-left font-medium">N° facture</th>
                  <th className="px-5 py-2.5 text-left font-medium">Client</th>
                  <th className="px-5 py-2.5 text-right font-medium">Total</th>
                  <th className="px-5 py-2.5 text-left font-medium">Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {invoices.length === 0 ? (
                  <tr><td colSpan={4} className="px-5 py-10 text-center text-muted-foreground">Aucune facture</td></tr>
                ) : invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-5 py-2.5 font-mono text-xs text-foreground">
                      {inv.pdf_url ? (
                        <a href={inv.pdf_url} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                          {inv.invoice_number ?? `#${inv.id}`}
                        </a>
                      ) : (inv.invoice_number ?? `#${inv.id}`)}
                    </td>
                    <td className="px-5 py-2.5 text-muted-foreground">{inv.companies?.name ?? "—"}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums font-medium">{fmt(num(inv.total))}</td>
                    <td className="px-5 py-2.5">
                      <span className={cn(
                        "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ring-1 ring-inset",
                        invoiceStatusStyle[inv.status ?? ""] ?? "bg-muted text-muted-foreground ring-border",
                      )}>
                        {INVOICE_STATUS_LABELS[inv.status ?? ""] ?? inv.status ?? "—"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Surface>
      </div>
    </PageShell>
  );
}
