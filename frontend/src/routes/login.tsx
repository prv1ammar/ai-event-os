import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Eye, EyeOff, LogIn, AlertCircle, FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginRequest } from "@/lib/api";
import { setToken, setUser, isAuthenticated } from "@/lib/auth";
import { cn } from "@/lib/utils";

const DEMO_ACCOUNTS = [
  { label: "Administrateur", email: "admin@aievent.ma",      password: "Admin1234!",    color: "bg-red-500/15 text-red-400 border-red-500/30" },
  { label: "Président",      email: "president@aievent.ma",  password: "President1234!", color: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  { label: "Exposant",       email: "exposant@aievent.ma",   password: "Exposant1234!", color: "bg-violet-500/15 text-violet-400 border-violet-500/30" },
  { label: "Personnel",      email: "staff@aievent.ma",      password: "Staff1234!",    color: "bg-sky-500/15 text-sky-400 border-sky-500/30" },
  { label: "Partenaire",     email: "partenaire@aievent.ma", password: "Partner1234!",  color: "bg-orange-500/15 text-orange-400 border-orange-500/30" },
  { label: "Presse",         email: "presse@aievent.ma",     password: "Press1234!",    color: "bg-slate-500/15 text-slate-400 border-slate-500/30" },
] as const;

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

function GridLogo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <rect x="2" y="2" width="8" height="8" rx="2" fill="rgba(255,255,255,0.15)" />
      <rect x="12" y="2" width="8" height="8" rx="2" fill="#58a6ff" />
      <rect x="22" y="2" width="8" height="8" rx="2" fill="rgba(255,255,255,0.12)" />
      <rect x="2" y="12" width="8" height="8" rx="2" fill="#58a6ff" opacity="0.55" />
      <rect x="12" y="12" width="8" height="8" rx="2" fill="#bc8cff" opacity="0.85" />
      <rect x="22" y="12" width="8" height="8" rx="2" fill="rgba(255,255,255,0.12)" />
      <rect x="2" y="22" width="8" height="8" rx="2" fill="rgba(255,255,255,0.08)" />
      <rect x="12" y="22" width="8" height="8" rx="2" fill="rgba(255,255,255,0.08)" />
      <rect x="22" y="22" width="8" height="8" rx="2" fill="#58a6ff" opacity="0.4" />
    </svg>
  );
}

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
        role: data.userData.role,
        is_active: data.userData.is_active,
      });
      navigate({ to: "/" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur s'est produite.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen w-full" style={{ background: "#0d1117", fontFamily: "'Inter', sans-serif" }}>
      {/* ── Left panel: form ── */}
      <div className="relative flex flex-1 flex-col justify-center items-center px-10 overflow-hidden">
        {/* bg radial blobs */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute top-0 left-0 h-[500px] w-[500px] -translate-x-1/4 -translate-y-1/4 rounded-full"
            style={{ background: "radial-gradient(circle, rgba(88,166,255,0.06) 0%, transparent 60%)" }} />
          <div className="absolute bottom-0 right-0 h-[400px] w-[400px] translate-x-1/4 translate-y-1/4 rounded-full"
            style={{ background: "radial-gradient(circle, rgba(188,140,255,0.04) 0%, transparent 60%)" }} />
        </div>

        {/* top-left logo */}
        <div className="absolute top-7 left-8 flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg"
            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(88,166,255,0.15)" }}>
            <GridLogo size={18} />
          </div>
          <div>
            <div className="text-[12px] font-bold tracking-[0.04em]" style={{ color: "#e6edf3" }}>AI EVENT OS</div>
            <div className="text-[8px] uppercase tracking-[0.14em]" style={{ color: "#656d76" }}>Powered by Tybot</div>
          </div>
        </div>

        {/* Form */}
        <div className="relative z-10 w-full max-w-[380px] space-y-5">
          <div>
            <h1 className="text-2xl font-bold tracking-[-0.02em]" style={{ color: "#e6edf3" }}>Connexion</h1>
            <p className="mt-1.5 text-[13px]" style={{ color: "#7d8590" }}>Gérez vos événements avec l'IA</p>
          </div>

          {/* Google SSO */}
          <button
            type="button"
            className="flex w-full items-center justify-center gap-2 rounded-md transition-opacity hover:opacity-80"
            style={{ padding: "10px", border: "1px solid #30363d", background: "#161b22", color: "#e6edf3" }}
            title="Bientôt disponible"
            tabIndex={-1}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            <span className="text-[13px] font-medium">Continuer avec Google</span>
          </button>

          {/* divider */}
          <div className="flex items-center gap-2.5">
            <div className="flex-1 h-px" style={{ background: "#30363d" }} />
            <span className="text-[11px]" style={{ color: "#656d76" }}>ou</span>
            <div className="flex-1 h-px" style={{ background: "#30363d" }} />
          </div>

          {/* Email */}
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-[5px]">
              <Label htmlFor="email" className="text-[11.5px] font-medium" style={{ color: "#7d8590" }}>
                Adresse e-mail
              </Label>
              <div className="flex items-center gap-2 rounded-md px-3 py-[9px]"
                style={{ border: "1px solid #30363d", background: "#161b22" }}>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <rect x="1.5" y="3" width="13" height="10" rx="2" stroke="#7d8590" strokeWidth="1.4"/>
                  <path d="M1.5 5.5l6.5 4 6.5-4" stroke="#7d8590" strokeWidth="1.4" strokeLinecap="round"/>
                </svg>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="nom@entreprise.ma"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={loading}
                  className="h-auto border-0 bg-transparent p-0 text-[13px] shadow-none focus-visible:ring-0 placeholder:text-muted-foreground"
                  style={{ color: "#e6edf3" }}
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-[5px]">
              <Label htmlFor="password" className="text-[11.5px] font-medium" style={{ color: "#7d8590" }}>
                Mot de passe
              </Label>
              <div className="flex items-center gap-2 rounded-md px-3 py-[9px]"
                style={{ border: "1px solid #58a6ff", background: "#161b22", boxShadow: "0 0 0 3px rgba(88,166,255,0.10)" }}>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <rect x="3" y="7" width="10" height="8" rx="2" stroke="#7d8590" strokeWidth="1.4"/>
                  <path d="M5 7V5a3 3 0 016 0v2" stroke="#7d8590" strokeWidth="1.4" strokeLinecap="round"/>
                  <circle cx="8" cy="11" r="1.2" fill="#7d8590"/>
                </svg>
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={loading}
                  className="h-auto flex-1 border-0 bg-transparent p-0 text-[13px] shadow-none focus-visible:ring-0 placeholder:text-muted-foreground"
                  style={{ color: "#e6edf3" }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((p) => !p)}
                  tabIndex={-1}
                  className="shrink-0 transition-opacity hover:opacity-70"
                  style={{ color: "#7d8590" }}
                >
                  {showPassword ? <EyeOff className="h-[14px] w-[14px]" /> : <Eye className="h-[14px] w-[14px]" />}
                </button>
              </div>
            </div>

            <div className="flex justify-end">
              <span className="cursor-pointer text-[11.5px]" style={{ color: "#58a6ff" }}>
                Mot de passe oublié ?
              </span>
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-md px-3 py-2.5"
                style={{ border: "1px solid rgba(248,81,73,0.3)", background: "rgba(248,81,73,0.08)" }}>
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" style={{ color: "#f85149" }} />
                <p className="text-sm" style={{ color: "#f85149" }}>{error}</p>
              </div>
            )}

            <Button
              type="submit"
              disabled={loading || !email || !password}
              className="w-full h-10 text-[14px] font-semibold"
              style={{ background: "#58a6ff", color: "#0d1117", border: "none" }}
            >
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <span className="h-4 w-4 rounded-full border-2 border-[#0d1117]/30 border-t-[#0d1117] animate-spin" />
                  Connexion…
                </span>
              ) : (
                <span className="inline-flex items-center gap-2">
                  <LogIn className="h-4 w-4" />
                  Se connecter
                </span>
              )}
            </Button>
          </form>

          <p className="text-center text-[12px]" style={{ color: "#7d8590" }}>
            Pas encore de compte ?{" "}
            <span className="cursor-pointer" style={{ color: "#58a6ff" }}>Contacter l'équipe →</span>
          </p>

          {/* Demo accounts */}
          <div className="rounded-md space-y-2.5" style={{ border: "1px solid #30363d", background: "rgba(255,255,255,0.02)", padding: "12px" }}>
            <div className="flex items-center gap-1.5 text-[11px]" style={{ color: "#7d8590" }}>
              <FlaskConical className="h-3.5 w-3.5" />
              Comptes de démonstration
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {DEMO_ACCOUNTS.map((account) => (
                <button
                  key={account.email}
                  type="button"
                  onClick={() => { setEmail(account.email); setPassword(account.password); }}
                  className={cn(
                    "rounded border px-2.5 py-1.5 text-left text-[11.5px] font-medium transition-opacity hover:opacity-80",
                    account.color,
                  )}
                >
                  {account.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Right panel: stats + testimonial ── */}
      <div
        className="hidden lg:flex w-[480px] flex-col justify-center shrink-0 relative overflow-hidden"
        style={{ borderLeft: "1px solid #30363d" }}
      >
        <div className="pointer-events-none absolute inset-0"
          style={{ background: "linear-gradient(160deg, rgba(88,166,255,0.04) 0%, rgba(188,140,255,0.03) 100%)" }} />

        <div className="relative z-10 px-11 py-12">
          <h2 className="text-[18px] font-bold mb-1.5 tracking-[-0.01em]" style={{ color: "#e6edf3" }}>
            Gérez vos salons avec l'IA
          </h2>
          <p className="text-[12.5px] leading-relaxed mb-8" style={{ color: "#7d8590" }}>
            Inscriptions, exposants, badges, finance — tout centralisé.
          </p>

          {/* Stats grid */}
          <div className="grid grid-cols-2 gap-3 mb-8">
            {[
              { value: "12,847", label: "Visiteurs inscrits", color: "#58a6ff" },
              { value: "324",    label: "Exposants",          color: "#3fb950" },
              { value: "2.4M",   label: "MAD encaissés",      color: "#d29922" },
              { value: "89",     label: "Sessions",           color: "#bc8cff" },
            ].map((s) => (
              <div key={s.label} className="rounded-lg p-3.5"
                style={{ background: "#161b22", border: "1px solid #30363d" }}>
                <div className="text-[22px] font-bold leading-none font-mono" style={{ color: s.color, fontFamily: "'JetBrains Mono', monospace" }}>
                  {s.value}
                </div>
                <div className="mt-1 text-[10px] uppercase tracking-[0.08em]" style={{ color: "#7d8590" }}>
                  {s.label}
                </div>
              </div>
            ))}
          </div>

          {/* Testimonial */}
          <div className="rounded-lg p-4" style={{ background: "#161b22", border: "1px solid #30363d" }}>
            <p className="text-[12px] leading-relaxed italic mb-2.5" style={{ color: "#e6edf3" }}>
              "AI Event OS a transformé notre façon de gérer le SIAM. Tout est automatisé."
            </p>
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[9px] font-bold"
                style={{ background: "linear-gradient(140deg, rgba(88,166,255,0.3), rgba(188,140,255,0.2))", color: "#58a6ff" }}>
                MA
              </div>
              <div>
                <div className="text-[11px] font-medium" style={{ color: "#e6edf3" }}>Mohammed Alaoui</div>
                <div className="text-[10px]" style={{ color: "#7d8590" }}>Directeur SIAM 2026</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
