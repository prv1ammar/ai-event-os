import { createFileRoute } from "@tanstack/react-router";
import { useQueries } from "@tanstack/react-query";
import { Plus, Download, Wallet, TrendingUp, Receipt, PiggyBank, ArrowUpCircle, ArrowDownCircle } from "lucide-react";
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

export const Route = createFileRoute("/finance")({
  component: Finance,
  head: () => ({
    meta: [
      { title: "Finance — AI EVENT OS" },
      { name: "description", content: "Budget, dépenses, revenus et reporting financier." },
    ],
  }),
});

interface EventRecord { id: number; budget?: number; [key: string]: unknown }
interface ExhibitorRecord { id: number; annual_revenue?: number; [key: string]: unknown }

async function fetchEvents(): Promise<EventRecord[]> {
  const raw = await apiRequest<EventRecord[] | { list: EventRecord[] }>("/api/v1/data/events");
  return Array.isArray(raw) ? raw : raw.list;
}

async function fetchExhibitors(): Promise<ExhibitorRecord[]> {
  const raw = await apiRequest<ExhibitorRecord[] | { list: ExhibitorRecord[] }>("/api/v1/data/exhibitors");
  return Array.isArray(raw) ? raw : raw.list;
}

function fmtShort(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M MAD`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K MAD`;
  return `${n} MAD`;
}

const budgetData = [
  { name: "Logistique", value: 650, color: "oklch(0.55 0.24 280)" },
  { name: "Communication", value: 480, color: "oklch(0.72 0.21 295)" },
  { name: "Technique", value: 320, color: "oklch(0.68 0.17 152)" },
  { name: "Marketing", value: 300, color: "oklch(0.78 0.16 75)" },
  { name: "Restauration", value: 250, color: "oklch(0.7 0.15 230)" },
  { name: "Divers", value: 200, color: "oklch(0.65 0.18 350)" },
];
const totalBudget = budgetData.reduce((a, b) => a + b.value, 0);

const revenusData = [
  { name: "Stands", value: 1250 },
  { name: "Sponsoring", value: 350 },
  { name: "Partenariats", value: 150 },
  { name: "Inscriptions", value: 106 },
];

const depenses = [
  { date: "24 Mai", fournisseur: "Expo Services", categorie: "Logistique", montant: "45 000", statut: "Payée" },
  { date: "23 Mai", fournisseur: "Media Plus", categorie: "Communication", montant: "18 500", statut: "Payée" },
  { date: "22 Mai", fournisseur: "Tech Event", categorie: "Technique", montant: "32 000", statut: "Engagée" },
  { date: "21 Mai", fournisseur: "Catering Pro", categorie: "Restauration", montant: "25 000", statut: "Payée" },
];

type BudgetLine = {
  categorie: string;
  budget: number;
  depense: number;
};

const budgetLines: BudgetLine[] = [
  { categorie: "Logistique", budget: 650000, depense: 612000 },
  { categorie: "Communication", budget: 480000, depense: 523000 },
  { categorie: "Technique", budget: 320000, depense: 365000 },
  { categorie: "Marketing", budget: 300000, depense: 287000 },
  { categorie: "Restauration", budget: 250000, depense: 241000 },
  { categorie: "Hébergement équipe", budget: 120000, depense: 98000 },
  { categorie: "Signalétique", budget: 85000, depense: 91000 },
  { categorie: "Sécurité", budget: 95000, depense: 95000 },
  { categorie: "Divers", budget: 200000, depense: 145000 },
];

function fmt(n: number) {
  return n.toLocaleString("fr-FR") + " MAD";
}

function Finance() {
  const results = useQueries({
    queries: [
      { queryKey: ["fin-events"], queryFn: fetchEvents },
      { queryKey: ["fin-exhibitors"], queryFn: fetchExhibitors },
    ],
  });

  const events = results[0].data ?? [];
  const exhibitors = results[1].data ?? [];
  const isLoading = results.some((r) => r.isLoading);

  const totalBudgetRaw = events.reduce((s, e) => s + (e.budget ?? 0), 0);
  const totalRevenueRaw = exhibitors.reduce((s, e) => s + (e.annual_revenue ?? 0), 0);
  const resultatRaw = totalRevenueRaw - totalBudgetRaw;
  const depensePct = totalBudgetRaw > 0 ? ((totalBudgetRaw * 0.509) / totalBudgetRaw * 100).toFixed(1) : "—";
  const revenuePct = totalBudgetRaw > 0 ? ((totalRevenueRaw / totalBudgetRaw) * 100).toFixed(1) : "—";
  const resultatSign = resultatRaw >= 0 ? "+" : "";

  const kpis = [
    {
      label: "Budget total",
      value: isLoading ? "…" : fmtShort(totalBudgetRaw),
      delta: `${events.length} événement${events.length !== 1 ? "s" : ""}`,
      sub: "ligne directrice",
      icon: Wallet,
      tone: "primary" as KpiTone,
    },
    {
      label: "Dépenses engagées",
      value: isLoading ? "…" : fmtShort(totalBudgetRaw * 0.509),
      delta: `${depensePct}%`,
      sub: "du budget",
      icon: Receipt,
      tone: "amber" as KpiTone,
      trend: "up" as const,
    },
    {
      label: "Revenus confirmés",
      value: isLoading ? "…" : fmtShort(totalRevenueRaw),
      delta: `${revenuePct}%`,
      sub: "de l'objectif",
      icon: TrendingUp,
      tone: "green" as KpiTone,
    },
    {
      label: "Résultat prévisionnel",
      value: isLoading ? "…" : `${resultatSign}${fmtShort(Math.abs(resultatRaw))}`,
      delta: totalBudgetRaw > 0 ? `${resultatSign}${((resultatRaw / totalBudgetRaw) * 100).toFixed(1)}%` : "—",
      sub: "marge nette",
      icon: PiggyBank,
      tone: "rose" as KpiTone,
    },
  ];

  return (
    <PageShell
      eyebrow="Finance"
      title="Suivi financier & budget"
      description="Pilotage du budget par catégorie, revenus par source et journal des dépenses."
      actions={
        <>
          <Button variant="outline" size="sm" className="h-9">
            <Download className="h-4 w-4" /> Exporter
          </Button>
          <Button size="sm" className="h-9 bg-gradient-primary text-primary-foreground shadow-glow-sm">
            <Plus className="h-4 w-4" /> Nouvelle dépense
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {kpis.map((k) => (
          <KpiCard key={k.label} {...k} />
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Surface className="p-6">
          <h2 className="font-display text-base font-semibold text-foreground">Répartition du budget</h2>
          <p className="text-xs text-muted-foreground mt-0.5 mb-4">Par catégorie · {totalBudget * 1000} MAD au total</p>
          <div className="flex items-center gap-6">
            <div className="relative h-52 w-52 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={budgetData} innerRadius={60} outerRadius={92} paddingAngle={2} dataKey="value" stroke="none">
                    {budgetData.map((e) => <Cell key={e.name} fill={e.color} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <p className="font-display text-xl font-bold text-foreground tabular-nums">2.45M</p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">MAD</p>
              </div>
            </div>
            <ul className="flex-1 space-y-2 min-w-0">
              {budgetData.map((b) => {
                const pct = ((b.value / totalBudget) * 100).toFixed(1);
                return (
                  <li key={b.name} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ background: b.color }} />
                      <span className="text-foreground truncate">{b.name}</span>
                    </span>
                    <span className="text-muted-foreground tabular-nums">{b.value}K <span className="opacity-60">({pct}%)</span></span>
                  </li>
                );
              })}
            </ul>
          </div>
        </Surface>

        <Surface className="p-6">
          <h2 className="font-display text-base font-semibold text-foreground">Revenus par source</h2>
          <p className="text-xs text-muted-foreground mt-0.5 mb-4">Confirmés à date · en milliers MAD</p>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={revenusData} margin={{ top: 10, right: 10, bottom: 0, left: -10 }}>
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
                  contentStyle={{ background: "oklch(1 0 0)", border: "1px solid oklch(0.92 0.012 285)", borderRadius: 12, fontSize: 12 }}
                  cursor={{ fill: "oklch(0.96 0.01 285)" }}
                />
                <Bar dataKey="value" fill="url(#barGrad)" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Surface>
      </div>

      {/* Budget vs Dépensé table with Écart column */}
      <Surface className="p-0 overflow-hidden">
        <div className="border-b border-border/60 px-5 py-4 flex items-center justify-between">
          <div>
            <h2 className="font-display font-semibold text-foreground">Suivi budgétaire par catégorie</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Budget alloué vs. dépenses réelles — écart calculé automatiquement</p>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1"><ArrowUpCircle className="h-3.5 w-3.5 text-success" /> Excédent</span>
            <span className="inline-flex items-center gap-1"><ArrowDownCircle className="h-3.5 w-3.5 text-destructive" /> Dépassement</span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-5 py-2.5 text-left font-medium">Catégorie</th>
                <th className="px-5 py-2.5 text-right font-medium">Budget alloué</th>
                <th className="px-5 py-2.5 text-right font-medium">Dépensé</th>
                <th className="px-5 py-2.5 text-right font-medium">Écart</th>
                <th className="px-5 py-2.5 text-left font-medium">Avancement</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {budgetLines.map((line) => {
                const ecart = line.budget - line.depense;
                const pct = Math.min(100, Math.round((line.depense / line.budget) * 100));
                const over = ecart < 0;
                return (
                  <tr key={line.categorie} className="hover:bg-muted/30 transition-colors">
                    <td className="px-5 py-2.5 font-medium text-foreground">{line.categorie}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums text-muted-foreground">{fmt(line.budget)}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums font-medium text-foreground">{fmt(line.depense)}</td>
                    <td className="px-5 py-2.5 text-right">
                      <span className={cn(
                        "inline-flex items-center gap-1 text-xs font-bold tabular-nums",
                        over ? "text-destructive" : "text-success",
                      )}>
                        {over ? (
                          <ArrowDownCircle className="h-3.5 w-3.5 shrink-0" />
                        ) : (
                          <ArrowUpCircle className="h-3.5 w-3.5 shrink-0" />
                        )}
                        {over ? "-" : "+"}{fmt(Math.abs(ecart))}
                      </span>
                    </td>
                    <td className="px-5 py-2.5 min-w-[140px]">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className={cn("h-full rounded-full transition-all", over ? "bg-destructive" : "bg-gradient-primary")}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className={cn("text-[11px] font-semibold tabular-nums w-8 text-right", over ? "text-destructive" : "text-muted-foreground")}>
                          {pct}%
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="border-t-2 border-border bg-muted/30">
              <tr>
                <td className="px-5 py-2.5 font-bold text-foreground text-sm">Total</td>
                <td className="px-5 py-2.5 text-right tabular-nums font-bold text-foreground">
                  {fmt(budgetLines.reduce((a, b) => a + b.budget, 0))}
                </td>
                <td className="px-5 py-2.5 text-right tabular-nums font-bold text-foreground">
                  {fmt(budgetLines.reduce((a, b) => a + b.depense, 0))}
                </td>
                <td className="px-5 py-2.5 text-right">
                  {(() => {
                    const totalEcart = budgetLines.reduce((a, b) => a + (b.budget - b.depense), 0);
                    const over = totalEcart < 0;
                    return (
                      <span className={cn("inline-flex items-center gap-1 text-sm font-bold", over ? "text-destructive" : "text-success")}>
                        {over ? <ArrowDownCircle className="h-4 w-4" /> : <ArrowUpCircle className="h-4 w-4" />}
                        {over ? "-" : "+"}{fmt(Math.abs(totalEcart))}
                      </span>
                    );
                  })()}
                </td>
                <td className="px-5 py-2.5" />
              </tr>
            </tfoot>
          </table>
        </div>
      </Surface>

      {/* Recent transactions */}
      <Surface className="p-0 overflow-hidden">
        <div className="border-b border-border/60 px-5 py-3.5">
          <h2 className="font-display font-semibold text-foreground">Dernières dépenses</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Journal des transactions financières</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-5 py-2.5 text-left font-medium">Date</th>
                <th className="px-5 py-2.5 text-left font-medium">Fournisseur</th>
                <th className="px-5 py-2.5 text-left font-medium">Catégorie</th>
                <th className="px-5 py-2.5 text-right font-medium">Montant (MAD)</th>
                <th className="px-5 py-2.5 text-left font-medium">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {depenses.map((d, i) => (
                <tr key={i} className="hover:bg-muted/30 transition-colors">
                  <td className="px-5 py-2.5 text-muted-foreground tabular-nums">{d.date}</td>
                  <td className="px-5 py-2.5 font-medium text-foreground">{d.fournisseur}</td>
                  <td className="px-5 py-2.5 text-muted-foreground">{d.categorie}</td>
                  <td className="px-5 py-2.5 text-right font-medium tabular-nums">{d.montant}</td>
                  <td className="px-5 py-2.5">
                    <span className={cn(
                      "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ring-1 ring-inset",
                      d.statut === "Payée"
                        ? "bg-success/10 text-success ring-success/20"
                        : "bg-warning/10 text-warning ring-warning/20",
                    )}>
                      {d.statut}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Surface>
    </PageShell>
  );
}
