import { createFileRoute } from "@tanstack/react-router";

function makePlaceholder(title: string) {
  return function Placeholder() {
    return (
      <div className="p-6 md:p-8">
        <h1 className="text-2xl font-semibold text-foreground mb-2">{title}</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Cette section sera construite prochainement.
        </p>
        <div className="flex items-center justify-center min-h-[60vh] rounded-xl border border-dashed border-border bg-card">
          <p className="text-sm text-muted-foreground">Bientôt disponible</p>
        </div>
      </div>
    );
  };
}

export { makePlaceholder };
