import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQueries } from "@tanstack/react-query";
import {
  Download,
  FileText,
  FileSpreadsheet,
  Presentation,
  Star,
  Sparkles,
  CheckSquare,
  Square,
  CheckCircle2,
} from "lucide-react";
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { PageShell, Surface } from "@/components/PageShell";
import { KpiCard, type KpiTone } from "@/components/KpiCard";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/api";

export const Route = createFileRoute("/rapports")({
  component: Rapports,
  head: () => ({
    meta: [
      { title: "Rapports — AI EVENT OS" },
      { name: "description", content: "Analyses post-événement, ROI, satisfaction et recommandations IA." },
    ],
  }),
});

interface LeadRecord { id: number; interest_level?: string; [key: string]: unknown }
interface VisitorRecord { id: number; [key: string]: unknown }
interface ExhibitorRecord { id: number; [key: string]: unknown }

async function fetchVisitors(): Promise<VisitorRecord[]> {
  const raw = await apiRequest<VisitorRecord[] | { list: VisitorRecord[] }>("/api/v1/visitors?limit=500");
  return Array.isArray(raw) ? raw : (raw.list ?? []);
}

async function fetchLeads(): Promise<LeadRecord[]> {
  const raw = await apiRequest<LeadRecord[] | { list: LeadRecord[] }>("/api/v1/leads?limit=500");
  return Array.isArray(raw) ? raw : (raw.list ?? []);
}

async function fetchExhibitors(): Promise<ExhibitorRecord[]> {
  const raw = await apiRequest<ExhibitorRecord[] | { list: ExhibitorRecord[] }>("/api/v1/exhibitors?limit=100");
  return Array.isArray(raw) ? raw : (raw.list ?? []);
}

const radarData = [
  { axis: "ROI", value: 95, goal: 80 },
  { axis: "Visibilité", value: 92, goal: 80 },
  { axis: "Leads", value: 88, goal: 75 },
  { axis: "Satisfaction", value: 92, goal: 85 },
  { axis: "Rdv B2B", value: 86, goal: 70 },
];

const downloads = [
  { label: "Rapport exécutif", desc: "Synthèse 12 pages", icon: FileText, color: "bg-destructive/10 text-destructive" },
  { label: "Données leads", desc: "Excel · 5 621 lignes", icon: FileSpreadsheet, color: "bg-success/10 text-success" },
  { label: "Analyse ROI", desc: "Détail par catégorie", icon: FileText, color: "bg-info/10 text-info" },
  { label: "Présentation executive", desc: "Slides · 22 pages", icon: Presentation, color: "bg-warning/10 text-warning" },
];

const recommandations = [
  {
    text: "Augmenter la visibilité des exposants premium en J1",
    impact: "Élevé",
    effort: "Moyen",
  },
  {
    text: "Étendre la zone B2B et les espaces de networking",
    impact: "Élevé",
    effort: "Élevé",
  },
  {
    text: "Renforcer la campagne digitale en amont (J-30)",
    impact: "Moyen",
    effort: "Faible",
  },
  {
    text: "Optimiser le parcours visiteur et la signalétique",
    impact: "Moyen",
    effort: "Faible",
  },
  {
    text: "Lancer un programme de fidélité pour les exposants récurrents",
    impact: "Élevé",
    effort: "Moyen",
  },
  {
    text: "Intégrer un système de matchmaking IA pour le B2B",
    impact: "Très élevé",
    effort: "Élevé",
  },
];

const impactColors: Record<string, string> = {
  "Très élevé": "text-primary font-semibold",
  "Élevé": "text-success",
  "Moyen": "text-warning",
};

function Rapports() {
  const [checkedIds, setCheckedIds] = useState<Set<number>>(new Set());

  const results = useQueries({
    queries: [
      { queryKey: ["rap-visitors"], queryFn: fetchVisitors },
      { queryKey: ["rap-leads"], queryFn: fetchLeads },
      { queryKey: ["rap-exhibitors"], queryFn: fetchExhibitors },
    ],
  });

  const visitors = results[0].data ?? [];
  const leads = results[1].data ?? [];
  const exhibitors = results[2].data ?? [];
  const isLoading = results.some((r) => r.isLoading);

  const hotCount = leads.filter((l) => l.interest_level === "hot").length;
  const warmCount = leads.filter((l) => l.interest_level === "warm").length;
  const coldCount = leads.filter((l) => l.interest_level === "cold").length;
  const conversionRate = visitors.length > 0
    ? ((leads.length / visitors.length) * 100).toFixed(1)
    : "—";

  const leadsQuality = [
    { name: "Chauds", value: hotCount || 1, color: "oklch(0.55 0.24 280)" },
    { name: "Tièdes", value: warmCount || 1, color: "oklch(0.72 0.21 295)" },
    { name: "Froids", value: coldCount || 1, color: "oklch(0.68 0.17 152)" },
  ].filter((l) => l.value > 0);

  const kpis = [
    { label: "Visiteurs totaux", value: isLoading ? "…" : visitors.length.toLocaleString("fr-FR"), delta: `${visitors.length} enreg.`, sub: "base de données", icon: Sparkles, tone: "primary" as KpiTone },
    { label: "Leads générés", value: isLoading ? "…" : leads.length.toLocaleString("fr-FR"), delta: `${leads.length} enreg.`, sub: "base de données", icon: Sparkles, tone: "green" as KpiTone },
    { label: "Exposants", value: isLoading ? "…" : exhibitors.length.toLocaleString("fr-FR"), delta: `${exhibitors.length} enreg.`, sub: "inscrits", icon: Sparkles, tone: "blue" as KpiTone },
    { label: "Taux de conversion", value: isLoading ? "…" : `${conversionRate}%`, delta: "leads / visiteurs", sub: "ratio", icon: Sparkles, tone: "amber" as KpiTone },
    { label: "Leads chauds", value: isLoading ? "…" : hotCount.toLocaleString("fr-FR"), delta: leads.length > 0 ? `${((hotCount / leads.length) * 100).toFixed(1)}%` : "—", sub: "des leads", icon: Sparkles, tone: "rose" as KpiTone },
  ];

  function toggleCheck(i: number) {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  const completedCount = checkedIds.size;
  const totalCount = recommandations.length;

  return (
    <PageShell
      eyebrow="Rapports & analyses"
      title="Bilan post-événement"
      description="Mesurez le ROI, la performance globale et la satisfaction. Recommandations IA prêtes à l'emploi."
      actions={
        <Button size="sm" className="h-9 bg-gradient-primary text-primary-foreground shadow-glow-sm">
          <Sparkles className="h-4 w-4" /> Générer rapport
        </Button>
      }
    >
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
        {kpis.map((k) => (
          <KpiCard key={k.label} {...k} />
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Radar chart */}
        <Surface className="p-6 lg:col-span-2">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h2 className="font-display text-base font-semibold text-foreground">Performance globale</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Réalisé vs. objectif sur 5 axes clés</p>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-sm bg-primary" /> Réalisé
              </span>
              <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                <span className="h-2 w-2 rounded-sm bg-muted-foreground/40" /> Objectif
              </span>
            </div>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData} outerRadius={90}>
                <PolarGrid stroke="oklch(0.92 0.012 285)" />
                <PolarAngleAxis
                  dataKey="axis"
                  tick={{ fontSize: 12, fill: "oklch(0.4 0.03 270)", fontWeight: 500 }}
                />
                <PolarRadiusAxis tick={false} axisLine={false} domain={[0, 100]} />
                <Radar
                  dataKey="goal"
                  stroke="oklch(0.5 0.03 270)"
                  fill="oklch(0.5 0.03 270)"
                  fillOpacity={0.1}
                  strokeDasharray="3 3"
                />
                <Radar
                  dataKey="value"
                  stroke="oklch(0.55 0.24 280)"
                  fill="oklch(0.55 0.24 280)"
                  fillOpacity={0.35}
                  strokeWidth={2}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
          {/* Axis scores */}
          <div className="grid grid-cols-5 gap-2 mt-2">
            {radarData.map((d) => (
              <div key={d.axis} className="text-center">
                <p className="text-xs font-bold text-foreground tabular-nums">{d.value}</p>
                <p className="text-[10px] text-muted-foreground">{d.axis}</p>
                <div className="h-1 w-full rounded-full bg-muted overflow-hidden mt-1">
                  <div className="h-full rounded-full bg-gradient-primary" style={{ width: `${d.value}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Surface>

        {/* Leads quality */}
        <Surface className="p-6">
          <h2 className="font-display text-base font-semibold text-foreground">Qualité des leads</h2>
          <p className="text-xs text-muted-foreground mt-0.5 mb-4">{leads.length.toLocaleString("fr-FR")} leads au total</p>
          <div className="relative h-44 w-44 mx-auto">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={leadsQuality} innerRadius={52} outerRadius={80} paddingAngle={3} dataKey="value" stroke="none">
                  {leadsQuality.map((e) => <Cell key={e.name} fill={e.color} />)}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <p className="font-display text-lg font-bold text-foreground">{leads.length.toLocaleString("fr-FR")}</p>
              <p className="text-[10px] text-muted-foreground">leads</p>
            </div>
          </div>
          <ul className="space-y-2 mt-4">
            {leadsQuality.map((l) => {
              const total = leadsQuality.reduce((a, b) => a + b.value, 0);
              const pct = ((l.value / total) * 100).toFixed(1);
              return (
                <li key={l.name} className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-sm" style={{ background: l.color }} />
                    <span className="text-foreground">{l.name}</span>
                  </span>
                  <span className="text-muted-foreground tabular-nums">
                    {l.value.toLocaleString("fr-FR")} <span className="opacity-60">({pct}%)</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </Surface>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Satisfaction */}
        <Surface className="p-6">
          <h2 className="font-display text-base font-semibold text-foreground mb-1">Satisfaction globale</h2>
          <div className="flex items-baseline gap-3 mt-2">
            <p className="font-display text-5xl font-bold text-gradient">4.6</p>
            <p className="text-sm text-muted-foreground">/ 5</p>
          </div>
          <div className="flex gap-1 mt-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <Star
                key={i}
                className={i <= 4 ? "h-5 w-5 fill-warning text-warning" : "h-5 w-5 fill-warning/40 text-warning/60"}
              />
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-3">Basé sur 243 réponses · taux 78%</p>
          <div className="mt-4 space-y-2">
            {[
              { label: "Organisation", score: 4.8 },
              { label: "Contenu", score: 4.5 },
              { label: "Networking", score: 4.7 },
              { label: "Logistique", score: 4.3 },
            ].map((s) => (
              <div key={s.label}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-muted-foreground">{s.label}</span>
                  <span className="font-medium text-foreground">{s.score}</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full bg-gradient-primary" style={{ width: `${(s.score / 5) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Surface>

        {/* AI Recommandations with checkboxes */}
        <Surface className="p-6 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-primary text-primary-foreground shadow-glow-sm">
                <Sparkles className="h-4 w-4" />
              </div>
              <div>
                <h2 className="font-display text-base font-semibold text-foreground">Recommandations IA</h2>
                <p className="text-xs text-muted-foreground">Stratégies d'optimisation pour la prochaine édition</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1">
              <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
              <span className="text-xs font-semibold text-primary">{completedCount}/{totalCount}</span>
            </div>
          </div>

          {/* Progress bar */}
          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden mb-4">
            <div
              className="h-full rounded-full bg-gradient-primary transition-all duration-500"
              style={{ width: `${(completedCount / totalCount) * 100}%` }}
            />
          </div>

          <ul className="space-y-2">
            {recommandations.map((r, i) => {
              const checked = checkedIds.has(i);
              return (
                <li
                  key={i}
                  onClick={() => toggleCheck(i)}
                  className={cn(
                    "flex items-start gap-3 rounded-lg p-2.5 -mx-2 transition-all cursor-pointer select-none",
                    checked
                      ? "bg-success/5 hover:bg-success/10"
                      : "bg-gradient-subtle/40 hover:bg-accent/50",
                  )}
                >
                  <div className="mt-0.5 shrink-0 text-primary">
                    {checked ? (
                      <CheckSquare className="h-4 w-4 text-success" />
                    ) : (
                      <Square className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={cn("text-sm text-foreground leading-snug", checked && "line-through text-muted-foreground")}>
                      {r.text}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={cn("text-[10px] font-semibold", impactColors[r.impact] ?? "text-muted-foreground")}>
                        Impact : {r.impact}
                      </span>
                      <span className="text-[10px] text-muted-foreground">· Effort : {r.effort}</span>
                    </div>
                  </div>
                  <span className={cn(
                    "shrink-0 flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold",
                    checked
                      ? "bg-success text-white"
                      : "bg-primary text-primary-foreground",
                  )}>
                    {i + 1}
                  </span>
                </li>
              );
            })}
          </ul>
        </Surface>
      </div>

      <Surface className="p-6">
        <h2 className="font-display text-base font-semibold text-foreground mb-4">Téléchargements</h2>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          {downloads.map((d) => (
            <button
              key={d.label}
              className="group flex items-center gap-3 rounded-xl border border-border/60 p-3 text-left transition-all hover:border-primary/40 hover:shadow-card hover-lift bg-card"
            >
              <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${d.color}`}>
                <d.icon className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{d.label}</p>
                <p className="text-xs text-muted-foreground truncate">{d.desc}</p>
              </div>
              <Download className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-y-0.5" />
            </button>
          ))}
        </div>
      </Surface>
    </PageShell>
  );
}
