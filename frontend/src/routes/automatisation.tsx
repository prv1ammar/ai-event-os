import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  Plus,
  Mail,
  MessageSquare,
  Linkedin,
  Play,
  Pause,
  Edit3,
  Copy,
  BarChart3,
  Users,
  TrendingUp,
  Clock,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/automatisation")({
  component: AutomatisationPage,
  head: () => ({
    meta: [{ title: "Relances & Automatisation — AI EVENT OS" }],
  }),
});

type CampaignStatus = "Envoyée" | "Planifiée" | "Brouillon" | "Inactive";
type Channel = "email" | "whatsapp" | "linkedin";

type CampaignStep = {
  id: string;
  label: string;
  timing: string;
  target: string;
  email: { status: CampaignStatus; sent?: number; openRate?: string; ctr?: string };
  whatsapp: { status: CampaignStatus; sent?: number; openRate?: string };
  linkedin: { status: CampaignStatus; sent?: number; ctr?: string };
};

const steps: CampaignStep[] = [
  {
    id: "j15",
    label: "Relance J-15",
    timing: "09 Mai 2025",
    target: "Tous les inscrits",
    email: { status: "Envoyée", sent: 8450, openRate: "42.3%", ctr: "8.7%" },
    whatsapp: { status: "Envoyée", sent: 3210, openRate: "78.4%" },
    linkedin: { status: "Envoyée", sent: 5230, ctr: "4.2%" },
  },
  {
    id: "j7",
    label: "Relance J-7",
    timing: "17 Mai 2025",
    target: "Inscrits non confirmés",
    email: { status: "Envoyée", sent: 4820, openRate: "51.6%", ctr: "11.2%" },
    whatsapp: { status: "Envoyée", sent: 2140, openRate: "82.1%" },
    linkedin: { status: "Planifiée", sent: 0 },
  },
  {
    id: "j3",
    label: "Relance J-3",
    timing: "21 Mai 2025",
    target: "Confirmés VIP + Presse",
    email: { status: "Envoyée", sent: 1240, openRate: "67.3%", ctr: "15.4%" },
    whatsapp: { status: "Planifiée", sent: 0 },
    linkedin: { status: "Brouillon" },
  },
  {
    id: "j0",
    label: "Jour J — Rappel",
    timing: "24 Mai 2025",
    target: "Tous les confirmés",
    email: { status: "Planifiée" },
    whatsapp: { status: "Planifiée" },
    linkedin: { status: "Inactive" },
  },
  {
    id: "postj1",
    label: "Post-Event J+1",
    timing: "28 Mai 2025",
    target: "Tous les participants",
    email: { status: "Brouillon" },
    whatsapp: { status: "Brouillon" },
    linkedin: { status: "Brouillon" },
  },
  {
    id: "postj7",
    label: "Post-Event J+7",
    timing: "03 Juin 2025",
    target: "Leads qualifiés",
    email: { status: "Brouillon" },
    whatsapp: { status: "Inactive" },
    linkedin: { status: "Brouillon" },
  },
];

const statusConfig: Record<CampaignStatus, { label: string; className: string; icon: typeof CheckCircle2 }> = {
  Envoyée: {
    label: "Envoyée",
    className: "bg-success/10 text-success ring-1 ring-inset ring-success/20",
    icon: CheckCircle2,
  },
  Planifiée: {
    label: "Planifiée",
    className: "bg-sky-500/10 text-sky-600 ring-1 ring-inset ring-sky-500/20",
    icon: Clock,
  },
  Brouillon: {
    label: "Brouillon",
    className: "bg-muted text-muted-foreground ring-1 ring-inset ring-border",
    icon: Edit3,
  },
  Inactive: {
    label: "Inactive",
    className: "bg-muted/50 text-muted-foreground/60 ring-1 ring-inset ring-border/40",
    icon: AlertCircle,
  },
};

const channelConfig: Record<Channel, { label: string; icon: typeof Mail; color: string }> = {
  email: { label: "Email", icon: Mail, color: "text-primary" },
  whatsapp: { label: "WhatsApp", icon: MessageSquare, color: "text-emerald-600" },
  linkedin: { label: "LinkedIn", icon: Linkedin, color: "text-sky-600" },
};

function StatusBadge({ status }: { status: CampaignStatus }) {
  const cfg = statusConfig[status];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium", cfg.className)}>
      <cfg.icon className="h-3 w-3" />
      {cfg.label}
    </span>
  );
}

function MetricMini({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
      <span className="font-medium text-foreground">{value}</span>
      <span>{label}</span>
    </div>
  );
}

function AutomatisationPage() {
  const [activeWorkflow, setActiveWorkflow] = useState<"visiteurs" | "exposants" | "presse">("visiteurs");

  const totalSent = steps.reduce((acc, s) => {
    return acc + (s.email.sent ?? 0) + (s.whatsapp.sent ?? 0) + (s.linkedin.sent ?? 0);
  }, 0);

  const sentSteps = steps.filter(
    (s) => s.email.status === "Envoyée" || s.whatsapp.status === "Envoyée",
  );

  return (
    <div className="p-6 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Automation</p>
          <h1 className="font-display text-2xl font-semibold text-foreground mt-0.5">Relances & Automatisation</h1>
          <p className="text-sm text-muted-foreground mt-1">Workflows multi-canaux · Email, WhatsApp, LinkedIn</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-9">
            <BarChart3 className="h-4 w-4" />
            Analytiques
          </Button>
          <Button size="sm" className="h-9 bg-gradient-primary text-primary-foreground shadow-glow-sm">
            <Plus className="h-4 w-4" />
            Nouveau workflow
          </Button>
        </div>
      </div>

      {/* KPI ribbon */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: "Messages envoyés", value: totalSent.toLocaleString("fr-FR"), icon: Mail, tone: "primary" },
          { label: "Étapes actives", value: sentSteps.length.toString(), icon: Play, tone: "green" },
          { label: "Taux ouverture moy.", value: "54.4%", icon: TrendingUp, tone: "amber" },
          { label: "Leads réengagés", value: "1,243", icon: Users, tone: "blue" },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-border bg-card p-4">
            <div className={cn(
              "flex h-8 w-8 items-center justify-center rounded-lg mb-2",
              s.tone === "primary" && "bg-primary/10 text-primary",
              s.tone === "green" && "bg-success/10 text-success",
              s.tone === "amber" && "bg-warning/10 text-warning",
              s.tone === "blue" && "bg-info/10 text-info",
            )}>
              <s.icon className="h-4 w-4" />
            </div>
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <p className="text-xl font-bold text-foreground tabular-nums mt-0.5">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Workflow selector */}
      <div className="flex items-center gap-2">
        <p className="text-xs text-muted-foreground font-medium mr-1">Workflow :</p>
        {(["visiteurs", "exposants", "presse"] as const).map((w) => (
          <button
            key={w}
            onClick={() => setActiveWorkflow(w)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm font-medium capitalize transition-colors",
              activeWorkflow === w
                ? "bg-primary text-primary-foreground"
                : "bg-card border border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {w.charAt(0).toUpperCase() + w.slice(1)}
          </button>
        ))}
      </div>

      {/* Campaign workflow table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {/* Column headers */}
        <div className="grid grid-cols-[2fr_repeat(3,1fr)_auto] border-b border-border bg-muted/40">
          <div className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Étape
          </div>
          {(["email", "whatsapp", "linkedin"] as Channel[]).map((ch) => {
            const cfg = channelConfig[ch];
            return (
              <div key={ch} className="px-4 py-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground border-l border-border">
                <cfg.icon className={cn("h-3.5 w-3.5", cfg.color)} />
                {cfg.label}
              </div>
            );
          })}
          <div className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground border-l border-border">
            Actions
          </div>
        </div>

        {/* Rows */}
        {steps.map((step, idx) => (
          <div
            key={step.id}
            className={cn(
              "grid grid-cols-[2fr_repeat(3,1fr)_auto] transition-colors hover:bg-muted/20",
              idx !== steps.length - 1 && "border-b border-border/60",
            )}
          >
            {/* Step info */}
            <div className="px-5 py-3.5 flex flex-col gap-0.5">
              <div className="flex items-center gap-2">
                <span className={cn(
                  "h-2 w-2 rounded-full shrink-0",
                  step.email.status === "Envoyée" ? "bg-success" :
                  step.email.status === "Planifiée" ? "bg-sky-500" :
                  "bg-muted-foreground/40",
                )} />
                <span className="text-sm font-semibold text-foreground">{step.label}</span>
              </div>
              <p className="text-xs text-muted-foreground pl-4">{step.timing} · {step.target}</p>
            </div>

            {/* Email */}
            <div className="px-4 py-3.5 border-l border-border/60 flex flex-col gap-1">
              <StatusBadge status={step.email.status} />
              {step.email.status === "Envoyée" && (
                <div className="flex flex-col gap-0.5">
                  <MetricMini label="envoyés" value={step.email.sent?.toLocaleString("fr-FR")} />
                  <MetricMini label="ouverture" value={step.email.openRate} />
                  <MetricMini label="CTR" value={step.email.ctr} />
                </div>
              )}
            </div>

            {/* WhatsApp */}
            <div className="px-4 py-3.5 border-l border-border/60 flex flex-col gap-1">
              <StatusBadge status={step.whatsapp.status} />
              {step.whatsapp.status === "Envoyée" && (
                <div className="flex flex-col gap-0.5">
                  <MetricMini label="envoyés" value={step.whatsapp.sent?.toLocaleString("fr-FR")} />
                  <MetricMini label="lu" value={step.whatsapp.openRate} />
                </div>
              )}
            </div>

            {/* LinkedIn */}
            <div className="px-4 py-3.5 border-l border-border/60 flex flex-col gap-1">
              <StatusBadge status={step.linkedin.status} />
              {step.linkedin.status === "Envoyée" && (
                <div className="flex flex-col gap-0.5">
                  <MetricMini label="envoyés" value={step.linkedin.sent?.toLocaleString("fr-FR")} />
                  <MetricMini label="CTR" value={step.linkedin.ctr} />
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="px-4 py-3.5 border-l border-border/60 flex items-center gap-1">
              <button className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                {step.email.status === "Envoyée" ? (
                  <Pause className="h-3.5 w-3.5" />
                ) : (
                  <Play className="h-3.5 w-3.5" />
                )}
              </button>
              <button className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                <Edit3 className="h-3.5 w-3.5" />
              </button>
              <button className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                <Copy className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Channel performance summary */}
      <div className="grid gap-4 md:grid-cols-3">
        {(["email", "whatsapp", "linkedin"] as Channel[]).map((ch) => {
          const cfg = channelConfig[ch];
          const sentCount = steps.filter((s) => s[ch].status === "Envoyée").length;
          const pct = Math.round((sentCount / steps.length) * 100);
          return (
            <div key={ch} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-2 mb-3">
                <cfg.icon className={cn("h-4 w-4", cfg.color)} />
                <span className="text-sm font-semibold text-foreground">{cfg.label}</span>
                <span className={cn("ml-auto text-xs font-medium", cfg.color)}>
                  {sentCount}/{steps.length} étapes
                </span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden mb-2">
                <div
                  className="h-full rounded-full bg-gradient-primary"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="grid grid-cols-2 gap-2 mt-3">
                {ch === "email" && (
                  <>
                    <div className="text-center rounded-md bg-muted/40 p-2">
                      <p className="text-xs font-bold text-foreground">14,510</p>
                      <p className="text-[10px] text-muted-foreground">Envoyés</p>
                    </div>
                    <div className="text-center rounded-md bg-muted/40 p-2">
                      <p className="text-xs font-bold text-foreground">53.7%</p>
                      <p className="text-[10px] text-muted-foreground">Ouverture</p>
                    </div>
                  </>
                )}
                {ch === "whatsapp" && (
                  <>
                    <div className="text-center rounded-md bg-muted/40 p-2">
                      <p className="text-xs font-bold text-foreground">5,350</p>
                      <p className="text-[10px] text-muted-foreground">Envoyés</p>
                    </div>
                    <div className="text-center rounded-md bg-muted/40 p-2">
                      <p className="text-xs font-bold text-foreground">80.3%</p>
                      <p className="text-[10px] text-muted-foreground">Lu</p>
                    </div>
                  </>
                )}
                {ch === "linkedin" && (
                  <>
                    <div className="text-center rounded-md bg-muted/40 p-2">
                      <p className="text-xs font-bold text-foreground">5,230</p>
                      <p className="text-[10px] text-muted-foreground">Envoyés</p>
                    </div>
                    <div className="text-center rounded-md bg-muted/40 p-2">
                      <p className="text-xs font-bold text-foreground">4.2%</p>
                      <p className="text-[10px] text-muted-foreground">CTR</p>
                    </div>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
