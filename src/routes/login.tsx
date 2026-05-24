import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Sparkles, Eye, EyeOff, LogIn, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginRequest } from "@/lib/api";
import { setToken, setUser, isAuthenticated } from "@/lib/auth";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/login")({
  component: LoginPage,
  beforeLoad: () => {
    if (isAuthenticated()) {
      throw { redirect: { to: "/" } };
    }
  },
  head: () => ({
    meta: [{ title: "Connexion — AI EVENT OS" }],
  }),
});

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const data = await loginRequest(email, password);
      setToken(data.access_token);
      setUser({
        email: data.userData.email,
        first_name: data.userData.first_name,
        last_name: data.userData.last_name,
        username: data.userData.username,
        id: data.userData.id,
        schema: data.schema,
        schema_id: data.schema_id,
        role: data.role,
        domains: data.domains,
      });
      navigate({ to: "/" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur s'est produite.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen w-full bg-background flex items-center justify-center px-4">
      {/* Background glow blobs */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 -left-40 h-[600px] w-[600px] rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute -bottom-40 -right-40 h-[600px] w-[600px] rounded-full bg-primary-glow/5 blur-3xl" />
      </div>

      <div className="relative w-full max-w-sm space-y-8">
        {/* Logo */}
        <div className="flex flex-col items-center gap-3">
          <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-primary shadow-glow">
            <Sparkles className="h-7 w-7 text-primary-foreground" />
            <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-success ring-2 ring-background animate-pulse-glow" />
          </div>
          <div className="text-center">
            <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
              AI EVENT OS
            </h1>
            <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground mt-0.5">
              Powered by Tybot
            </p>
          </div>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-border/60 bg-card shadow-card p-8 space-y-6">
          <div>
            <h2 className="font-display text-lg font-semibold text-foreground">Connexion</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Accédez à votre espace de gestion événementielle
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Adresse email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="vous@exemple.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
                className="h-10"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password">Mot de passe</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={loading}
                  className="h-10 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((p) => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2.5 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5">
                <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}

            <Button
              type="submit"
              disabled={loading || !email || !password}
              className={cn(
                "w-full h-10 bg-gradient-primary text-primary-foreground shadow-glow-sm font-medium",
                "hover:shadow-glow transition-shadow",
              )}
            >
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <span className="h-4 w-4 rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground animate-spin" />
                  Connexion en cours…
                </span>
              ) : (
                <span className="inline-flex items-center gap-2">
                  <LogIn className="h-4 w-4" />
                  Se connecter
                </span>
              )}
            </Button>
          </form>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          Plateforme réservée aux organisateurs autorisés.
        </p>
      </div>
    </div>
  );
}
