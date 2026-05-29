import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  User,
  Building2,
  Bell,
  Shield,
  Palette,
  Plug,
  Save,
  Mail,
  Smartphone,
  Lock,
} from "lucide-react";
import { PageShell, Surface } from "@/components/PageShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/parametres")({
  component: Parametres,
  head: () => ({
    meta: [
      { title: "Paramètres — AI EVENT OS" },
      { name: "description", content: "Profil, équipe, notifications, sécurité et intégrations." },
    ],
  }),
});

const sections = [
  { id: "profil", label: "Profil", icon: User },
  { id: "organisation", label: "Organisation", icon: Building2 },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "securite", label: "Sécurité", icon: Shield },
  { id: "apparence", label: "Apparence", icon: Palette },
  { id: "integrations", label: "Intégrations", icon: Plug },
] as const;

type SectionId = (typeof sections)[number]["id"];

function Parametres() {
  const [active, setActive] = useState<SectionId>("profil");

  return (
    <PageShell
      eyebrow="Paramètres"
      title="Configuration de la plateforme"
      description="Profil, équipe, notifications, sécurité et intégrations tierces."
      actions={
        <Button size="sm" className="h-9 bg-gradient-primary text-primary-foreground shadow-glow-sm">
          <Save className="h-4 w-4" /> Enregistrer
        </Button>
      }
    >
      <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
        {/* Sidebar nav */}
        <Surface className="p-2 h-fit">
          <nav className="flex flex-col gap-0.5">
            {sections.map((s) => (
              <button
                key={s.id}
                onClick={() => setActive(s.id)}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all text-left",
                  active === s.id
                    ? "bg-gradient-primary text-primary-foreground shadow-glow-sm font-medium"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                )}
              >
                <s.icon className="h-4 w-4" />
                {s.label}
              </button>
            ))}
          </nav>
        </Surface>

        {/* Content */}
        <div className="space-y-6">
          {active === "profil" && <ProfileSection />}
          {active === "organisation" && <OrgSection />}
          {active === "notifications" && <NotificationsSection />}
          {active === "securite" && <SecuritySection />}
          {active === "apparence" && <AppearanceSection />}
          {active === "integrations" && <IntegrationsSection />}
        </div>
      </div>
    </PageShell>
  );
}

function ProfileSection() {
  return (
    <Surface className="p-6">
      <h2 className="font-display text-lg font-semibold text-foreground">Profil personnel</h2>
      <p className="text-sm text-muted-foreground mt-1 mb-6">
        Vos informations s'affichent dans l'application et les emails sortants.
      </p>

      <div className="flex items-center gap-4 mb-6">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-primary text-primary-foreground font-display text-xl font-bold shadow-glow-sm">
          YA
        </div>
        <div>
          <Button variant="outline" size="sm">Changer la photo</Button>
          <p className="text-xs text-muted-foreground mt-1">JPG, PNG · max 2MB</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="firstname">Prénom</Label>
          <Input id="firstname" defaultValue="Youssef" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lastname">Nom</Label>
          <Input id="lastname" defaultValue="Alaoui" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" defaultValue="youssef@aievent.ma" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="phone">Téléphone</Label>
          <Input id="phone" type="tel" defaultValue="+212 6 12 34 56 78" />
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor="role">Rôle</Label>
          <Input id="role" defaultValue="Administrateur" disabled />
        </div>
      </div>
    </Surface>
  );
}

function OrgSection() {
  return (
    <Surface className="p-6">
      <h2 className="font-display text-lg font-semibold text-foreground">Organisation</h2>
      <p className="text-sm text-muted-foreground mt-1 mb-6">
        Informations légales et identité visuelle de votre structure.
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5 md:col-span-2">
          <Label>Nom de l'organisation</Label>
          <Input defaultValue="AI Event SARL" />
        </div>
        <div className="space-y-1.5">
          <Label>SIRET / ICE</Label>
          <Input defaultValue="002345678000019" />
        </div>
        <div className="space-y-1.5">
          <Label>Pays</Label>
          <Input defaultValue="Maroc" />
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <Label>Adresse</Label>
          <Input defaultValue="123 Bd Mohammed V, Casablanca" />
        </div>
      </div>
    </Surface>
  );
}

const notifs = [
  { icon: Mail, title: "Nouveau lead qualifié", desc: "Email instantané à chaque lead chaud", on: true },
  { icon: Smartphone, title: "Alertes opérationnelles", desc: "SMS pour alertes critiques uniquement", on: true },
  { icon: Bell, title: "Récap quotidien", desc: "Synthèse à 18h tous les jours d'événement", on: false },
  { icon: Mail, title: "Newsletter produit", desc: "Nouveautés et conseils Tybot", on: false },
];

function NotificationsSection() {
  return (
    <Surface className="p-6">
      <h2 className="font-display text-lg font-semibold text-foreground">Notifications</h2>
      <p className="text-sm text-muted-foreground mt-1 mb-6">
        Choisissez les canaux et fréquences qui vous correspondent.
      </p>
      <ul className="divide-y divide-border/60">
        {notifs.map((n, i) => (
          <li key={i} className="flex items-center gap-4 py-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <n.icon className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">{n.title}</p>
              <p className="text-xs text-muted-foreground">{n.desc}</p>
            </div>
            <Switch defaultChecked={n.on} />
          </li>
        ))}
      </ul>
    </Surface>
  );
}

function SecuritySection() {
  return (
    <div className="space-y-6">
      <Surface className="p-6">
        <h2 className="font-display text-lg font-semibold text-foreground">Mot de passe</h2>
        <p className="text-sm text-muted-foreground mt-1 mb-6">
          Utilisez un mot de passe unique de 12+ caractères.
        </p>
        <div className="grid gap-4 md:max-w-md">
          <div className="space-y-1.5">
            <Label>Mot de passe actuel</Label>
            <Input type="password" placeholder="••••••••" />
          </div>
          <div className="space-y-1.5">
            <Label>Nouveau mot de passe</Label>
            <Input type="password" placeholder="••••••••" />
          </div>
          <Button className="w-fit">
            <Lock className="h-4 w-4" /> Mettre à jour
          </Button>
        </div>
      </Surface>

      <Surface className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-lg font-semibold text-foreground">
              Double authentification (2FA)
            </h2>
            <p className="text-sm text-muted-foreground mt-1 max-w-lg">
              Ajoutez une couche supplémentaire de sécurité avec une application
              d'authentification.
            </p>
          </div>
          <Switch />
        </div>
      </Surface>
    </div>
  );
}

const themes = [
  { id: "light", label: "Clair", swatch: ["oklch(0.985 0.005 285)", "oklch(0.55 0.24 280)"] },
  { id: "dark", label: "Sombre", swatch: ["oklch(0.14 0.035 275)", "oklch(0.72 0.22 290)"] },
  { id: "auto", label: "Auto", swatch: ["oklch(0.985 0.005 285)", "oklch(0.14 0.035 275)"] },
];

function AppearanceSection() {
  return (
    <Surface className="p-6">
      <h2 className="font-display text-lg font-semibold text-foreground">Apparence</h2>
      <p className="text-sm text-muted-foreground mt-1 mb-6">
        Thème de l'interface et densité d'affichage.
      </p>
      <div className="grid gap-4 md:grid-cols-3">
        {themes.map((t) => (
          <button
            key={t.id}
            className="group rounded-xl border-2 border-border/60 p-4 text-left transition-all hover:border-primary/40 hover-lift bg-card"
          >
            <div className="flex h-20 w-full overflow-hidden rounded-lg ring-1 ring-border/60">
              <div className="flex-1" style={{ background: t.swatch[0] }} />
              <div className="flex-1" style={{ background: t.swatch[1] }} />
            </div>
            <p className="mt-3 text-sm font-medium text-foreground">{t.label}</p>
          </button>
        ))}
      </div>
    </Surface>
  );
}

const integrations = [
  { name: "Google Analytics", desc: "Tracking trafic landing pages", connected: true },
  { name: "Meta Pixel", desc: "Conversion Facebook & Instagram", connected: true },
  { name: "LinkedIn Ads", desc: "Campagnes B2B et lead gen", connected: false },
  { name: "WhatsApp Business", desc: "Relances et notifications", connected: true },
  { name: "Mailchimp", desc: "Emailing visiteurs & exposants", connected: false },
  { name: "Stripe", desc: "Paiements et facturation", connected: true },
];

function IntegrationsSection() {
  return (
    <Surface className="p-6">
      <h2 className="font-display text-lg font-semibold text-foreground">Intégrations</h2>
      <p className="text-sm text-muted-foreground mt-1 mb-6">
        Connectez vos outils marketing, analytics et paiement.
      </p>
      <ul className="grid gap-3 md:grid-cols-2">
        {integrations.map((i) => (
          <li
            key={i.name}
            className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-card p-4 transition-colors hover:border-primary/30"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{i.name}</p>
              <p className="text-xs text-muted-foreground truncate">{i.desc}</p>
            </div>
            {i.connected ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-1 text-[11px] font-medium text-success ring-1 ring-inset ring-success/20">
                <span className="h-1.5 w-1.5 rounded-full bg-success" /> Connecté
              </span>
            ) : (
              <Button variant="outline" size="sm">
                Connecter
              </Button>
            )}
          </li>
        ))}
      </ul>
    </Surface>
  );
}
