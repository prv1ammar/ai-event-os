import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  Globe,
  LayoutTemplate,
  BarChart3,
  Mail,
  Megaphone,
  Tag,
  Radar,
  Plus,
  Eye,
  Edit3,
  Copy,
  ExternalLink,
  CheckCircle2,
  TrendingUp,
  Users,
  MousePointerClick,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useEvent } from "@/lib/event-context";

export const Route = createFileRoute("/landing-page")({
  component: LandingPageModule,
  head: () => ({
    meta: [{ title: "Landing Pages — AI EVENT OS" }],
  }),
});

const tabs = [
  { key: "pages", label: "Landing pages", icon: LayoutTemplate },
  { key: "seo", label: "SEO", icon: Globe },
  { key: "analytics", label: "Analytics", icon: BarChart3 },
  { key: "forms", label: "Formulaires", icon: Mail },
  { key: "cta", label: "CTA", icon: Megaphone },
  { key: "tracking", label: "Tracking", icon: Radar },
] as const;
type Tab = (typeof tabs)[number]["key"];

const pages = [
  {
    id: "1",
    name: "Page principale 2025",
    slug: "/salon-agro-2025",
    status: "Publiée",
    visits: "12,458",
    conversions: "1,876",
    cr: "15.1%",
    updatedAt: "Aujourd'hui",
  },
  {
    id: "2",
    name: "Landing exposants",
    slug: "/exposants-2025",
    status: "Publiée",
    visits: "4,320",
    conversions: "642",
    cr: "14.9%",
    updatedAt: "Hier",
  },
  {
    id: "3",
    name: "Page VIP & Presse",
    slug: "/vip-presse-2025",
    status: "Brouillon",
    visits: "—",
    conversions: "—",
    cr: "—",
    updatedAt: "22 Mai",
  },
];

const seoData = [
  { label: "Title tag", value: "Salon International de l'Agroalimentaire 2025 | Casablanca", status: "ok" },
  { label: "Meta description", value: "Rejoignez la 12e édition du Salon Agroalimentaire — 243 exposants, 12 000 visiteurs attendus.", status: "ok" },
  { label: "Open Graph image", value: "/og-agroalimentaire-2025.jpg", status: "ok" },
  { label: "Canonical URL", value: "https://salon-agro.ma/2025", status: "ok" },
  { label: "Sitemap", value: "Généré automatiquement", status: "warn" },
  { label: "Robots.txt", value: "Allow all pages", status: "ok" },
];

const ctas = [
  { label: "S'inscrire visiteur", color: "bg-primary text-primary-foreground", clicks: "8,204", cr: "12.3%" },
  { label: "Devenir exposant", color: "bg-emerald-600 text-white", clicks: "2,156", cr: "8.7%" },
  { label: "Programme J1-J4", color: "bg-sky-600 text-white", clicks: "5,891", cr: "—" },
  { label: "Contacter l'équipe", color: "bg-muted text-foreground border border-border", clicks: "943", cr: "—" },
];

const formFields = [
  { name: "Prénom *", type: "text", required: true },
  { name: "Nom *", type: "text", required: true },
  { name: "Email professionnel *", type: "email", required: true },
  { name: "Société", type: "text", required: false },
  { name: "Secteur", type: "select", required: false },
  { name: "Pack", type: "radio", required: true },
];

const analyticsKpis = [
  { label: "Sessions", value: "12,458", delta: "+24.5%", icon: Eye },
  { label: "Utilisateurs", value: "9,231", delta: "+18.7%", icon: Users },
  { label: "Inscriptions", value: "1,876", delta: "+26.3%", icon: MousePointerClick },
  { label: "Taux de conv.", value: "15.1%", delta: "+5.6pts", icon: TrendingUp },
];

function RightPanelContent({ tab, selectedPage }: { tab: Tab; selectedPage: string }) {
  if (tab === "pages" || tab === "cta") {
    return <LivePreviewCanvas selectedPage={selectedPage} />;
  }
  if (tab === "seo") {
    return (
      <div className="p-6 space-y-4">
        <h3 className="font-display text-base font-semibold text-foreground">Paramètres SEO</h3>
        <div className="space-y-3">
          {seoData.map((s) => (
            <div key={s.label} className="flex items-start gap-3 rounded-lg border border-border bg-card p-3">
              <CheckCircle2 className={cn("h-4 w-4 mt-0.5 shrink-0", s.status === "ok" ? "text-success" : "text-warning")} />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{s.label}</p>
                <p className="text-sm text-foreground mt-0.5 truncate">{s.value}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (tab === "analytics") {
    return (
      <div className="p-6 space-y-4">
        <h3 className="font-display text-base font-semibold text-foreground">Analytics — 30 derniers jours</h3>
        <div className="grid grid-cols-2 gap-3">
          {analyticsKpis.map((k) => (
            <div key={k.label} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-2 mb-2">
                <k.icon className="h-4 w-4 text-primary" />
                <span className="text-xs text-muted-foreground">{k.label}</span>
              </div>
              <p className="text-xl font-bold text-foreground tabular-nums">{k.value}</p>
              <p className="text-xs font-medium text-success mt-1">{k.delta}</p>
            </div>
          ))}
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Taux de conversion par canal</p>
          {[
            { label: "Organic Search", pct: 62 },
            { label: "Social Media", pct: 21 },
            { label: "Email", pct: 11 },
            { label: "Direct", pct: 6 },
          ].map((s) => (
            <div key={s.label} className="mb-2.5">
              <div className="flex justify-between text-xs mb-1">
                <span className="text-foreground">{s.label}</span>
                <span className="text-muted-foreground tabular-nums">{s.pct}%</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                <div className="h-full rounded-full bg-gradient-primary" style={{ width: `${s.pct}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (tab === "forms") {
    return (
      <div className="p-6 space-y-4">
        <h3 className="font-display text-base font-semibold text-foreground">Formulaire d'inscription</h3>
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="bg-muted/40 px-4 py-2 border-b border-border">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Champs du formulaire</p>
          </div>
          <div className="divide-y divide-border/60">
            {formFields.map((f) => (
              <div key={f.name} className="flex items-center justify-between px-4 py-2.5">
                <div className="flex items-center gap-3">
                  <div className="h-2 w-2 rounded-full bg-primary" />
                  <span className="text-sm text-foreground">{f.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{f.type}</span>
                  {f.required && (
                    <span className="rounded-full bg-destructive/10 text-destructive text-[10px] font-semibold px-1.5 py-0.5">Requis</span>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="px-4 py-3 border-t border-border">
            <Button size="sm" variant="outline" className="h-8 text-xs">
              <Plus className="h-3 w-3" />
              Ajouter un champ
            </Button>
          </div>
        </div>
      </div>
    );
  }
  if (tab === "tracking") {
    return (
      <div className="p-6 space-y-4">
        <h3 className="font-display text-base font-semibold text-foreground">Pixels & Tracking</h3>
        {[
          { name: "Google Analytics 4", id: "G-XXXXXXXXXX", status: "Actif" },
          { name: "Meta Pixel", id: "1234567890123", status: "Actif" },
          { name: "LinkedIn Insight Tag", id: "987654", status: "Inactif" },
          { name: "Google Tag Manager", id: "GTM-XXXXXX", status: "Actif" },
        ].map((t) => (
          <div key={t.name} className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3">
            <div>
              <p className="text-sm font-medium text-foreground">{t.name}</p>
              <p className="text-xs text-muted-foreground font-mono mt-0.5">{t.id}</p>
            </div>
            <span className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
              t.status === "Actif"
                ? "bg-success/10 text-success ring-success/20"
                : "bg-muted text-muted-foreground ring-border",
            )}>
              <span className={cn("h-1.5 w-1.5 rounded-full", t.status === "Actif" ? "bg-success" : "bg-muted-foreground")} />
              {t.status}
            </span>
          </div>
        ))}
      </div>
    );
  }
  return null;
}

function LivePreviewCanvas({ selectedPage }: { selectedPage: string }) {
  const { activeEvent } = useEvent();
  const page = pages.find((p) => p.id === selectedPage) ?? pages[0];

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            <span className="h-3 w-3 rounded-full bg-destructive/60" />
            <span className="h-3 w-3 rounded-full bg-warning/60" />
            <span className="h-3 w-3 rounded-full bg-success/60" />
          </div>
          <div className="flex items-center rounded-md bg-card border border-border px-3 py-1 text-xs text-muted-foreground font-mono">
            salon-agro.ma{page.slug}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-xs text-muted-foreground hover:text-foreground">
            <ExternalLink className="h-3 w-3" />
            Ouvrir
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="rounded-xl border border-border overflow-hidden shadow-elevated bg-white">
          {/* Nav */}
          <div className="flex items-center justify-between px-6 py-3 bg-[oklch(0.18_0.04_275)] text-white">
            <span className="font-display font-bold text-sm tracking-wide">AGROALIMENTAIRE</span>
            <div className="hidden md:flex items-center gap-5 text-xs text-white/70">
              <span>Programme</span>
              <span>Exposants</span>
              <span>Infos pratiques</span>
            </div>
            <span className="text-xs rounded-full bg-gradient-primary px-3 py-1 font-semibold">S'inscrire</span>
          </div>

          {/* Hero */}
          <div
            className="relative px-8 py-14 text-white text-center"
            style={{ background: "linear-gradient(135deg, oklch(0.18 0.04 275) 0%, oklch(0.3 0.15 290) 50%, oklch(0.25 0.2 305) 100%)" }}
          >
            <div className="absolute inset-0 opacity-10" style={{
              backgroundImage: "radial-gradient(circle at 20% 50%, white, transparent 50%), radial-gradient(circle at 80% 20%, oklch(0.7 0.2 295), transparent 40%)",
            }} />
            <p className="text-[10px] font-semibold tracking-[0.25em] uppercase text-white/60 mb-3">12e Édition · {activeEvent.dates}</p>
            <h1 className="font-display text-2xl md:text-3xl font-bold leading-tight mb-2">{activeEvent.name}</h1>
            <p className="text-sm text-white/70 mb-6">{activeEvent.lieu}</p>
            <div className="flex items-center justify-center gap-3 flex-wrap">
              <span className="rounded-full bg-gradient-primary px-5 py-2 text-sm font-semibold shadow-glow-sm">
                S'inscrire gratuitement
              </span>
              <span className="rounded-full border border-white/30 px-5 py-2 text-sm font-medium text-white/90">
                Voir le programme
              </span>
            </div>
          </div>

          {/* Stats ribbon */}
          <div className="grid grid-cols-3 divide-x divide-border bg-card">
            {[
              { label: "Exposants", value: "243+" },
              { label: "Visiteurs attendus", value: "12 000" },
              { label: "Pays représentés", value: "28" },
            ].map((s) => (
              <div key={s.label} className="px-4 py-3 text-center">
                <p className="font-display text-lg font-bold text-foreground tabular-nums">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Features */}
          <div className="px-6 py-5 bg-muted/20">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Pourquoi participer ?</p>
            <div className="grid grid-cols-2 gap-2">
              {["Networking B2B", "Conférences & Ateliers", "Démonstrations live", "Matchmaking IA"].map((f) => (
                <div key={f} className="flex items-center gap-2 text-xs text-foreground">
                  <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />
                  {f}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function LandingPageModule() {
  const [activeTab, setActiveTab] = useState<Tab>("pages");
  const [selectedPageId, setSelectedPageId] = useState("1");

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      {/* Page header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card/50">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Landing Pages</p>
          <h1 className="font-display text-xl font-semibold text-foreground mt-0.5">Générateur de landing pages</h1>
        </div>
        <Button size="sm" className="h-8 bg-gradient-primary text-primary-foreground shadow-glow-sm text-xs">
          <Plus className="h-3.5 w-3.5" />
          Nouvelle page
        </Button>
      </div>

      {/* Split workspace */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Control Panel */}
        <aside className="w-72 shrink-0 border-r border-border flex flex-col bg-card overflow-y-auto">
          {/* Tabs */}
          <div className="p-3 border-b border-border">
            <div className="grid grid-cols-3 gap-1">
              {tabs.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setActiveTab(t.key)}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-lg px-2 py-2 text-[10px] font-medium transition-colors",
                    activeTab === t.key
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                  )}
                >
                  <t.icon className="h-3.5 w-3.5" />
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Pages list */}
          <div className="flex-1 p-3 space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground px-1 mb-2">
              Pages créées
            </p>
            {pages.map((p) => (
              <button
                key={p.id}
                onClick={() => setSelectedPageId(p.id)}
                className={cn(
                  "w-full rounded-lg px-3 py-2.5 text-left transition-colors",
                  selectedPageId === p.id
                    ? "bg-primary/10 ring-1 ring-primary/30"
                    : "hover:bg-muted/50",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className={cn("text-xs font-medium", selectedPageId === p.id ? "text-primary" : "text-foreground")}>
                    {p.name}
                  </span>
                  <span className={cn(
                    "shrink-0 rounded-full text-[10px] font-semibold px-1.5 py-0.5",
                    p.status === "Publiée"
                      ? "bg-success/10 text-success"
                      : "bg-muted text-muted-foreground",
                  )}>
                    {p.status}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground font-mono mt-1 truncate">{p.slug}</p>
                <div className="flex items-center gap-3 mt-1.5 text-[11px] text-muted-foreground">
                  <span>{p.visits} vues</span>
                  <span>•</span>
                  <span>{p.cr} CR</span>
                </div>
              </button>
            ))}
          </div>

          {/* Quick actions */}
          <div className="border-t border-border p-3 space-y-1">
            {[
              { label: "Modifier la page", icon: Edit3 },
              { label: "Dupliquer", icon: Copy },
              { label: "Aperçu", icon: Eye },
            ].map((a) => (
              <button
                key={a.label}
                className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                <a.icon className="h-3.5 w-3.5" />
                {a.label}
              </button>
            ))}
          </div>
        </aside>

        {/* Right: Preview / Content Canvas */}
        <div className="flex-1 flex flex-col overflow-hidden bg-muted/20">
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-card/50">
            <Tag className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold text-foreground">Aperçu de la page</span>
            <span className="ml-auto text-xs text-muted-foreground">
              {pages.find((p) => p.id === selectedPageId)?.name}
            </span>
          </div>
          <div className="flex-1 overflow-y-auto">
            <RightPanelContent tab={activeTab} selectedPage={selectedPageId} />
          </div>
        </div>
      </div>
    </div>
  );
}
