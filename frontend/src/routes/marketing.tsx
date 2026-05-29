import { createFileRoute } from "@tanstack/react-router";
import {
  Plus,
  TrendingUp,
  Eye,
  MousePointerClick,
  Users,
  Mail,
  Download,
  ChevronDown,
  Linkedin,
  Facebook,
  MessageSquare,
  ArrowRight,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/marketing")({
  component: MarketingPage,
  head: () => ({
    meta: [
      { title: "Marketing & Com — AI EVENT" },
      { name: "description", content: "Marketing et communication pour votre événement." },
    ],
  }),
});

const campaigns = [
  {
    name: "Campagne LinkedIn",
    status: "Active",
    statusColor: "green",
    icon: Linkedin,
    iconBg: "bg-[#0A66C2]/10 text-[#0A66C2]",
    audience: 25430,
    audienceMax: 50000,
    audienceLabel: "25,430",
    ctr: 3.6,
    ctrMax: 10,
    ctrLabel: "3.6%",
    leads: 312,
    leadsMax: 600,
    leadsLabel: "312",
    date: "Lancée le 02 Mai 2025",
  },
  {
    name: "Campagne Facebook",
    status: "Active",
    statusColor: "green",
    icon: Facebook,
    iconBg: "bg-[#1877F2]/10 text-[#1877F2]",
    audience: 18920,
    audienceMax: 50000,
    audienceLabel: "18,920",
    ctr: 2.8,
    ctrMax: 10,
    ctrLabel: "2.8%",
    leads: 215,
    leadsMax: 600,
    leadsLabel: "215",
    date: "Lancée le 03 Mai 2025",
  },
  {
    name: "Emailing Invités",
    status: "Planifiée",
    statusColor: "gray",
    icon: Mail,
    iconBg: "bg-muted text-muted-foreground",
    audience: 8450,
    audienceMax: 50000,
    audienceLabel: "8,450",
    ctr: 0,
    ctrMax: 10,
    ctrLabel: "—",
    leads: 0,
    leadsMax: 600,
    leadsLabel: "—",
    date: "Prévu le 15 Mai 2025",
  },
];

const statusBadgeStyles: Record<string, string> = {
  green: "bg-emerald-500/10 text-emerald-600 ring-1 ring-inset ring-emerald-500/20",
  gray: "bg-muted text-muted-foreground ring-1 ring-inset ring-border",
};

const siteKpis = [
  { label: "Sessions", value: "12,458", delta: "+24.5%", icon: Eye, tone: "primary" },
  { label: "Utilisateurs", value: "9,231", delta: "+18.7%", icon: Users, tone: "blue" },
  { label: "Inscriptions", value: "1,876", delta: "+26.3%", icon: MousePointerClick, tone: "green" },
  { label: "Taux de conv.", value: "15.1%", delta: "+5.6pts", icon: TrendingUp, tone: "amber" },
];

const sessionsData = [
  { day: "01 Mai", v: 1050 }, { day: "03 Mai", v: 1320 }, { day: "05 Mai", v: 1500 },
  { day: "07 Mai", v: 1550 }, { day: "09 Mai", v: 1850 }, { day: "11 Mai", v: 1900 },
  { day: "13 Mai", v: 2050 }, { day: "15 Mai", v: 2350 }, { day: "17 Mai", v: 2400 },
  { day: "19 Mai", v: 2480 }, { day: "21 Mai", v: 2750 }, { day: "23 Mai", v: 2820 },
  { day: "25 Mai", v: 3100 }, { day: "27 Mai", v: 3200 },
];

const trafficData = [
  { name: "Organic Search", value: 5681, color: "oklch(0.58 0.22 280)" },
  { name: "Direct", value: 3027, color: "oklch(0.72 0.18 285)" },
  { name: "Social Media", value: 2330, color: "oklch(0.7 0.18 145)" },
  { name: "Email", value: 922, color: "oklch(0.78 0.18 80)" },
  { name: "Autres", value: 498, color: "oklch(0.65 0.18 200)" },
];

const socials = [
  { name: "LinkedIn", followers: "8,752", growth: "+13.3%", tone: "blue", icon: Linkedin },
  { name: "Facebook", followers: "6,321", growth: "+8.7%", tone: "sky", icon: Facebook },
  { name: "WhatsApp", followers: "4,215", growth: "+15.1%", tone: "green", icon: MessageSquare },
];

const toneStyles: Record<string, string> = {
  primary: "bg-primary/10 text-primary",
  blue: "bg-[#0A66C2]/10 text-[#0A66C2]",
  green: "bg-emerald-500/10 text-emerald-600",
  gray: "bg-muted text-muted-foreground",
  amber: "bg-amber-500/10 text-amber-600",
  rose: "bg-rose-500/10 text-rose-600",
  sky: "bg-[#1877F2]/10 text-[#1877F2]",
};

function MicroBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="h-1 w-full rounded-full bg-muted overflow-hidden">
      <div className={cn("h-full rounded-full transition-all duration-500", color)} style={{ width: `${pct}%` }} />
    </div>
  );
}

function MarketingPage() {
  const totalSessions = trafficData.reduce((a, b) => a + b.value, 0);

  return (
    <div className="p-5 md:p-6 space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Marketing & Com</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Campagnes, performance et réseaux sociaux</p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/automatisation">
            <Button variant="outline" size="sm" className="h-8 bg-card">
              Relances & Auto
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
          <Button size="sm" className="h-8 bg-gradient-primary text-primary-foreground shadow-glow-sm">
            <Plus className="h-3.5 w-3.5" />
            Nouvelle campagne
          </Button>
        </div>
      </div>

      {/* Campaign Cards with progress micro-bars */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {campaigns.map((c) => (
          <div
            key={c.name}
            className="rounded-xl border border-border bg-card p-4 hover:shadow-md transition-shadow"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2.5">
                <div className={cn("flex h-9 w-9 items-center justify-center rounded-lg", c.iconBg)}>
                  <c.icon className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-foreground">{c.name}</h3>
                  <span className={cn("inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium mt-0.5", statusBadgeStyles[c.statusColor])}>
                    {c.status}
                  </span>
                </div>
              </div>
            </div>

            {/* Metrics with progress bars */}
            <div className="space-y-2.5">
              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-muted-foreground">Audience</span>
                  <span className="font-semibold text-foreground tabular-nums">{c.audienceLabel}</span>
                </div>
                <MicroBar value={c.audience} max={c.audienceMax} color="bg-[#0A66C2]/70" />
              </div>
              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-muted-foreground">CTR</span>
                  <span className="font-semibold text-foreground tabular-nums">{c.ctrLabel}</span>
                </div>
                <MicroBar value={c.ctr} max={c.ctrMax} color="bg-gradient-primary" />
              </div>
              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-muted-foreground">Leads générés</span>
                  <span className="font-semibold text-foreground tabular-nums">{c.leadsLabel}</span>
                </div>
                <MicroBar value={c.leads} max={c.leadsMax} color="bg-success/70" />
              </div>
            </div>

            <p className="mt-3 text-[11px] text-muted-foreground">{c.date}</p>
          </div>
        ))}
      </div>

      {/* Performance + Traffic Sources */}
      <div className="grid gap-4 lg:grid-cols-5">
        {/* Site Performance */}
        <div className="rounded-xl border border-border bg-card p-5 lg:col-span-3 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-foreground">Performance du site (Landing page)</h2>
            <button className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted">
              30 derniers jours
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
            {siteKpis.map((k) => (
              <div key={k.label} className="rounded-lg border border-border bg-background p-3">
                <div className={cn("flex h-8 w-8 items-center justify-center rounded-md", toneStyles[k.tone])}>
                  <k.icon className="h-4 w-4" />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">{k.label}</p>
                <p className="mt-1 text-lg font-bold text-foreground tracking-tight tabular-nums">{k.value}</p>
                <p className="mt-1 text-xs font-medium text-success">{k.delta}</p>
              </div>
            ))}
          </div>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={sessionsData} margin={{ top: 10, right: 10, bottom: 0, left: -10 }}>
                <defs>
                  <linearGradient id="sessGrad" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="oklch(0.58 0.22 280)" />
                    <stop offset="100%" stopColor="oklch(0.72 0.18 285)" />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.92 0.01 255)" vertical={false} />
                <XAxis dataKey="day" stroke="oklch(0.5 0.02 260)" fontSize={10} tickLine={false} axisLine={false} interval={2} />
                <YAxis stroke="oklch(0.5 0.02 260)" fontSize={10} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ background: "oklch(1 0 0)", border: "1px solid oklch(0.92 0.01 255)", borderRadius: 8, fontSize: 12 }}
                />
                <Line type="monotone" dataKey="v" stroke="url(#sessGrad)" strokeWidth={2} dot={false}
                  activeDot={{ r: 4, fill: "oklch(0.58 0.22 280)", strokeWidth: 2, stroke: "#fff" }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Traffic Sources */}
        <div className="rounded-xl border border-border bg-card p-5 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Sources de trafic</h2>
            <p className="text-xs text-muted-foreground">{totalSessions.toLocaleString("fr-FR")} sessions</p>
          </div>
          <div className="flex items-center gap-3 mt-4">
            <div className="relative h-40 w-40 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={trafficData} innerRadius={50} outerRadius={74} paddingAngle={2} dataKey="value" stroke="none">
                    {trafficData.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex-1 space-y-2 min-w-0">
              {trafficData.map((t) => {
                const pct = ((t.value / totalSessions) * 100).toFixed(1);
                return (
                  <div key={t.name}>
                    <div className="flex items-center justify-between gap-2 text-xs mb-0.5">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="h-2 w-2 rounded-sm shrink-0" style={{ background: t.color }} />
                        <span className="text-foreground truncate text-[11px]">{t.name}</span>
                      </div>
                      <span className="text-muted-foreground tabular-nums text-[11px] whitespace-nowrap">{pct}%</span>
                    </div>
                    <div className="h-1 w-full rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: t.color }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Social Media */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-foreground">Réseaux sociaux</h2>
          <Button variant="outline" size="sm" className="h-8 bg-card">
            <Download className="h-3.5 w-3.5" /> Export
          </Button>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {socials.map((s) => (
            <div key={s.name} className="rounded-xl border border-border bg-card p-4 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-foreground">{s.name}</h3>
                <div className={cn("flex h-8 w-8 items-center justify-center rounded-md", toneStyles[s.tone])}>
                  <s.icon className="h-4 w-4" />
                </div>
              </div>
              <p className="text-2xl font-bold text-foreground tabular-nums">{s.followers}</p>
              <p className="text-xs text-muted-foreground mt-0.5 mb-3">Abonnés</p>
              <div className="flex items-center gap-1 text-xs font-medium text-success">
                <TrendingUp className="h-3.5 w-3.5" />
                {s.growth} ce mois
              </div>
              <div className="mt-3 h-1.5 w-full rounded-full bg-muted overflow-hidden">
                <div className="h-full rounded-full bg-gradient-primary" style={{ width: "65%" }} />
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">65% vers objectif mensuel</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
