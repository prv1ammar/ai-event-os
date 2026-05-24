import type { LucideIcon } from "lucide-react";
import { TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type KpiTone = "primary" | "blue" | "green" | "amber" | "rose" | "violet";

const toneStyles: Record<KpiTone, string> = {
  primary: "bg-primary/10 text-primary ring-primary/20",
  blue: "bg-info/10 text-info ring-info/20",
  green: "bg-success/10 text-success ring-success/20",
  amber: "bg-warning/10 text-warning ring-warning/20",
  rose: "bg-destructive/10 text-destructive ring-destructive/20",
  violet: "bg-accent text-accent-foreground ring-accent-foreground/10",
};

export interface KpiCardProps {
  label: string;
  value: string;
  delta?: string;
  sub?: string;
  icon: LucideIcon;
  tone?: KpiTone;
  trend?: "up" | "down";
}

export function KpiCard({
  label,
  value,
  delta,
  sub,
  icon: Icon,
  tone = "primary",
  trend = "up",
}: KpiCardProps) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-border/60 bg-card p-5 shadow-card hover-lift">
      <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-gradient-primary opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-20" />
      <div className="flex items-start justify-between">
        <div
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-xl ring-1 ring-inset",
            toneStyles[tone],
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
        {delta && (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
              trend === "up"
                ? "bg-success/10 text-success"
                : "bg-destructive/10 text-destructive",
            )}
          >
            {trend === "up" ? (
              <TrendingUp className="h-3 w-3" />
            ) : (
              <TrendingDown className="h-3 w-3" />
            )}
            {delta}
          </span>
        )}
      </div>
      <p className="mt-4 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 font-display text-2xl md:text-[1.7rem] font-bold text-foreground tabular-nums leading-tight">
        {value}
      </p>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}
