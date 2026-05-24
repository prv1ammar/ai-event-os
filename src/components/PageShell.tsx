import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PageShellProps {
  title: string;
  description?: string;
  eyebrow?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** Consistent page header + content shell used across the app. */
export function PageShell({
  title,
  description,
  eyebrow,
  actions,
  children,
  className,
}: PageShellProps) {
  return (
    <div className={cn("p-6 md:p-8 space-y-6 animate-fade-up", className)}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          {eyebrow && (
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary mb-1.5">
              {eyebrow}
            </p>
          )}
          <h1 className="font-display text-2xl md:text-3xl font-semibold text-foreground tracking-tight">
            {title}
          </h1>
          {description && (
            <p className="mt-1.5 text-sm text-muted-foreground max-w-2xl">
              {description}
            </p>
          )}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  );
}

interface SurfaceProps {
  children: ReactNode;
  className?: string;
  variant?: "card" | "glass" | "subtle";
  interactive?: boolean;
}

/** Reusable surface — replaces ad-hoc rounded-xl border bg-card patterns. */
export function Surface({
  children,
  className,
  variant = "card",
  interactive,
}: SurfaceProps) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border/60 p-5 transition-colors",
        variant === "card" && "bg-card shadow-card",
        variant === "glass" && "glass",
        variant === "subtle" && "bg-gradient-subtle",
        interactive && "hover-lift cursor-pointer hover:border-primary/30",
        className,
      )}
    >
      {children}
    </div>
  );
}
