import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Globe, LayoutTemplate, BarChart3, Mail, Megaphone, Tag, Radar,
  Plus, Eye, Edit3, Copy, ExternalLink, CheckCircle2, TrendingUp,
  Users, MousePointerClick, Trash2, Loader2, X, AlertCircle,
  Search, Pencil, Building2, CalendarDays, Palette,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/api";

export const Route = createFileRoute("/landing-page")({
  component: LandingPageModule,
  head: () => ({ meta: [{ title: "Landing Pages — AI EVENT OS" }] }),
});

// ── Types ──────────────────────────────────────────────────────────────────────

type PageType = "visitor" | "exhibitor";

interface LandingPage {
  id: string;
  name: string;
  slug: string;
  status: "published" | "draft";
  page_type: PageType;
  event_id: string;
  cta_text: string;
  hero_title: string;
  hero_subtitle: string;
  description: string;
  // Style
  primary_color: string;
  bg_dark: string;
  // Stats
  stat1_value: string; stat1_label: string;
  stat2_value: string; stat2_label: string;
  stat3_value: string; stat3_label: string;
  // Sections
  show_programme: boolean;
  // SEO & tracking
  seo_title: string;
  seo_description: string;
  ga_id: string;
  meta_pixel: string;
  // Analytics
  visits: number;
  conversions: number;
  created_at: string;
  updated_at: string;
}

interface EventOption {
  id: number; name: string;
  start_date?: string; end_date?: string;
  city?: string; venue_name?: string; country?: string;
}

interface SessionRecord {
  title?: string; type?: string;
  start_time?: string; end_time?: string;
  room?: string; event_id?: number;
}

const tabs = [
  { key: "pages",     label: "Pages",       icon: LayoutTemplate },
  { key: "seo",       label: "SEO",         icon: Globe },
  { key: "analytics", label: "Analytics",   icon: BarChart3 },
  { key: "forms",     label: "Formulaires", icon: Mail },
  { key: "cta",       label: "CTA",         icon: Megaphone },
  { key: "tracking",  label: "Tracking",    icon: Radar },
] as const;
type Tab = (typeof tabs)[number]["key"];

// ── Storage ────────────────────────────────────────────────────────────────────

const STORAGE_KEY = "aievent_landing_pages";
function loadPages(): LandingPage[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]"); } catch { return []; }
}
function savePages(pages: LandingPage[]) { localStorage.setItem(STORAGE_KEY, JSON.stringify(pages)); }
function newId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function slugify(name: string) {
  return "/" + name.toLowerCase().trim()
    .replace(/[àâä]/g,"a").replace(/[éèêë]/g,"e").replace(/[îï]/g,"i")
    .replace(/[ôö]/g,"o").replace(/[ùûü]/g,"u").replace(/ç/g,"c")
    .replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
}
function fmtDate(iso?: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtTime(iso?: string) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

// ── API ────────────────────────────────────────────────────────────────────────

async function fetchEvents(): Promise<EventOption[]> {
  const raw = await apiRequest<EventOption[] | { list: EventOption[] }>("/api/v1/events?limit=100");
  return Array.isArray(raw) ? raw : (raw.list ?? []);
}
async function fetchSessions(eventId?: number): Promise<SessionRecord[]> {
  const qs = eventId ? `?event_id=${eventId}` : "";
  const raw = await apiRequest<SessionRecord[]>(`/api/v1/public/sessions${qs}`);
  return Array.isArray(raw) ? raw : [];
}

// ── Defaults ───────────────────────────────────────────────────────────────────

const PAGE_DEFAULTS: Omit<LandingPage, "id"|"created_at"|"updated_at"|"visits"|"conversions"> = {
  name: "", slug: "", status: "draft", page_type: "visitor", event_id: "",
  cta_text: "S'inscrire gratuitement", hero_title: "", hero_subtitle: "", description: "",
  primary_color: "#7c3aed", bg_dark: "#1a1040",
  stat1_value: "240+", stat1_label: "Exposants",
  stat2_value: "12 000", stat2_label: "Visiteurs attendus",
  stat3_value: "30+", stat3_label: "Pays représentés",
  show_programme: false,
  seo_title: "", seo_description: "", ga_id: "", meta_pixel: "",
};

const EXHIBITOR_DEFAULTS: Partial<typeof PAGE_DEFAULTS> = {
  page_type: "exhibitor",
  cta_text: "Devenir exposant",
  stat1_label: "Exposants actuels",
  stat2_label: "Visiteurs attendus",
  stat3_label: "Pays participants",
};

// ── Open full HTML preview ─────────────────────────────────────────────────────

function openFullPreview(page: LandingPage, event?: EventOption, sessions: SessionRecord[] = []) {
  const heroTitle    = page.hero_title    || event?.name    || "Votre événement";
  const heroSubtitle = page.hero_subtitle || [event?.venue_name, event?.city].filter(Boolean).join(", ") || "";
  const ctaText      = page.cta_text      || (page.page_type === "exhibitor" ? "Devenir exposant" : "S'inscrire gratuitement");
  const dateStr      = event?.start_date  ? fmtDate(event.start_date) : "";
  const endDateStr   = event?.end_date    ? ` → ${fmtDate(event.end_date)}` : "";
  const eventShort   = event?.name?.split(" ").slice(0, 2).join(" ").toUpperCase() ?? "AI EVENT";
  const isExhibitor  = page.page_type === "exhibitor";
  const eventId      = page.event_id ? Number(page.event_id) : null;
  const primary      = page.primary_color || "#7c3aed";
  const bgDark       = page.bg_dark || "#1a1040";

  // Hex to RGB for gradient variation
  const hex2rgb = (hex: string) => {
    const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
    return `${r},${g},${b}`;
  };

  // Programme section HTML
  const eventSessions = sessions.filter(s => !eventId || s.event_id === eventId);
  const programmeHtml = (page.show_programme && eventSessions.length > 0) ? `
  <section class="programme-section">
    <div class="section-inner">
      <h2 class="section-title">Programme</h2>
      <p class="section-sub">${eventSessions.length} session${eventSessions.length > 1 ? "s" : ""} au programme</p>
      <div class="sessions-grid">
        ${eventSessions.map(s => `
          <div class="session-card">
            <div class="session-date">${s.start_time ? fmtDate(s.start_time) : ""}</div>
            <div class="session-time">${fmtTime(s.start_time)}${s.end_time ? ` – ${fmtTime(s.end_time)}` : ""}</div>
            <div class="session-title">${s.title ?? "Session"}</div>
            <div class="session-meta">
              ${s.type ? `<span class="session-type ${s.type}">${s.type}</span>` : ""}
              ${s.room ? `<span class="session-room">📍 ${s.room}</span>` : ""}
            </div>
          </div>`).join("")}
      </div>
    </div>
  </section>` : "";

  // Form fields based on type
  const formHtml = isExhibitor ? `
    <div class="form-group"><label>Nom de la société *</label><input type="text" placeholder="Ex: Atlas Exports SARL" id="f_company"></div>
    <div class="form-row">
      <div class="form-group"><label>Contact *</label><input type="text" placeholder="Prénom Nom" id="f_contact"></div>
      <div class="form-group"><label>Email *</label><input type="email" placeholder="contact@societe.ma" id="f_email"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Téléphone</label><input type="text" placeholder="+212 6xx xxx xxx" id="f_phone"></div>
      <div class="form-group"><label>Secteur</label>
        <select id="f_sector"><option value="">Sélectionner…</option>
          <option>Agroalimentaire</option><option>Agriculture</option><option>Industrie</option>
          <option>Tech & Innovation</option><option>Logistique</option><option>Autre</option>
        </select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Pays</label><input type="text" placeholder="Maroc" id="f_country"></div>
      <div class="form-group"><label>Ville</label><input type="text" placeholder="Casablanca" id="f_city"></div>
    </div>
    <div class="form-group"><label>Préférence de stand</label>
      <select id="f_booth"><option value="">Sélectionner…</option>
        <option value="standard">Standard (9m²)</option>
        <option value="premium">Premium (18m²)</option>
        <option value="island">Îlot (36m²)</option>
      </select>
    </div>
    <div class="form-group"><label>Description courte de l'activité</label>
      <textarea placeholder="Décrivez votre activité en quelques lignes…" id="f_desc" rows="3"></textarea>
    </div>` : `
    <div class="form-row">
      <div class="form-group"><label>Prénom *</label><input type="text" placeholder="Votre prénom" id="f_firstname"></div>
      <div class="form-group"><label>Nom *</label><input type="text" placeholder="Votre nom" id="f_lastname"></div>
    </div>
    <div class="form-group"><label>Email professionnel *</label><input type="email" placeholder="nom@entreprise.com" id="f_email"></div>
    <div class="form-group"><label>Société</label><input type="text" placeholder="Nom de votre entreprise" id="f_company"></div>
    <div class="form-group"><label>Secteur d'activité</label>
      <select id="f_sector"><option value="">Sélectionner…</option>
        <option>Agroalimentaire</option><option>Agriculture</option><option>Technologie</option>
        <option>Logistique</option><option>Autre</option>
      </select>
    </div>`;

  const submitEndpoint = isExhibitor
    ? "http://localhost:8001/api/v1/public/register-exhibitor"
    : "http://localhost:8001/api/v1/public/register";

  const submitJs = isExhibitor ? `
    const company  = document.getElementById('f_company')?.value || '';
    const contact  = document.getElementById('f_contact')?.value || '';
    const email    = document.getElementById('f_email')?.value || '';
    const phone    = document.getElementById('f_phone')?.value || '';
    const sector   = document.getElementById('f_sector')?.value || '';
    const country  = document.getElementById('f_country')?.value || '';
    const city     = document.getElementById('f_city')?.value || '';
    const booth    = document.getElementById('f_booth')?.value || '';
    const desc     = document.getElementById('f_desc')?.value || '';
    const body = { company_name: company, contact_name: contact, email, phone: phone||undefined,
      sector: sector||undefined, country: country||undefined, city: city||undefined,
      booth_preference: booth||undefined, description: desc||undefined, event_id: ${eventId}, export_experience: 'regional' };
    requiredIds = ['f_company','f_contact','f_email'];` : `
    const firstname = document.getElementById('f_firstname')?.value || '';
    const lastname  = document.getElementById('f_lastname')?.value || '';
    const email     = document.getElementById('f_email')?.value || '';
    const company   = document.getElementById('f_company')?.value || '';
    const sector    = document.getElementById('f_sector')?.value || '';
    const body = { firstname, lastname, email, company: company||undefined, sector: sector||undefined, event_id: ${eventId}, visitor_type: 'standard', source: 'landing_page' };
    requiredIds = ['f_firstname','f_lastname','f_email'];`;

  const gaScript = page.ga_id
    ? `<script async src="https://www.googletagmanager.com/gtag/js?id=${page.ga_id}"></script>
       <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${page.ga_id}');</script>`
    : "";

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${page.seo_title || heroTitle}</title>
  <meta name="description" content="${page.seo_description || ""}">
  ${gaScript}
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111;background:#fff}
    :root{--primary:${primary};--bg-dark:${bgDark}}
    nav{display:flex;align-items:center;justify-content:space-between;padding:14px 40px;background:var(--bg-dark);color:#fff;position:sticky;top:0;z-index:100}
    .nav-brand{font-weight:800;font-size:15px;letter-spacing:.08em}
    .nav-links{display:flex;gap:28px;font-size:13px;color:rgba(255,255,255,.65)}
    .nav-links span{cursor:pointer;transition:color .2s}.nav-links span:hover{color:#fff}
    .btn-primary{background:var(--primary);color:#fff;border:none;padding:10px 24px;border-radius:999px;font-weight:600;font-size:13px;cursor:pointer;transition:opacity .2s}
    .btn-primary:hover{opacity:.85}
    .btn-outline{background:transparent;color:rgba(255,255,255,.85);border:1px solid rgba(255,255,255,.3);padding:10px 24px;border-radius:999px;font-weight:500;font-size:13px;cursor:pointer;transition:all .2s}
    .btn-outline:hover{background:rgba(255,255,255,.1)}
    .hero{background:linear-gradient(135deg,var(--bg-dark) 0%, color-mix(in srgb, var(--primary) 60%, var(--bg-dark)) 50%, color-mix(in srgb, var(--primary) 40%, #000) 100%);padding:80px 40px;text-align:center;color:#fff}
    .hero-eyebrow{font-size:11px;font-weight:600;letter-spacing:.22em;text-transform:uppercase;color:rgba(255,255,255,.45);margin-bottom:16px}
    .hero h1{font-size:clamp(30px,5vw,56px);font-weight:800;line-height:1.1;margin-bottom:12px}
    .hero-sub{font-size:15px;color:rgba(255,255,255,.6);margin-bottom:36px}
    .hero-badge{display:inline-block;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.2);color:rgba(255,255,255,.9);border-radius:999px;padding:6px 16px;font-size:12px;font-weight:600;letter-spacing:.04em;margin-bottom:20px}
    .hero-btns{display:flex;gap:12px;justify-content:center;flex-wrap:wrap}
    .stats{display:grid;grid-template-columns:repeat(3,1fr);border-bottom:1px solid #e5e7eb}
    .stat{padding:20px;text-align:center;border-right:1px solid #e5e7eb}.stat:last-child{border-right:none}
    .stat-value{font-size:30px;font-weight:800;color:var(--primary)}
    .stat-label{font-size:12px;color:#6b7280;margin-top:4px}
    .section-inner{max-width:900px;margin:0 auto}
    .section-title{font-size:26px;font-weight:800;margin-bottom:8px;text-align:center}
    .section-sub{font-size:14px;color:#6b7280;text-align:center;margin-bottom:28px}
    .features-section{padding:50px 40px;background:#f9fafb}
    .features{display:grid;grid-template-columns:repeat(2,1fr);gap:14px;max-width:600px;margin:0 auto}
    .feature{display:flex;align-items:center;gap:10px;font-size:14px;color:#111}
    .check{width:20px;height:20px;background:var(--primary);border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0}
    .check::after{content:'✓';color:#fff;font-size:11px;font-weight:700}
    /* Programme */
    .programme-section{padding:50px 40px;background:#fff}
    .sessions-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px;margin-top:8px}
    .session-card{background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:16px;transition:border-color .2s}
    .session-card:hover{border-color:var(--primary)}
    .session-date{font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:#9ca3af;margin-bottom:2px}
    .session-time{font-size:13px;font-weight:700;color:var(--primary);margin-bottom:6px}
    .session-title{font-size:14px;font-weight:700;color:#111;margin-bottom:8px;line-height:1.3}
    .session-meta{display:flex;flex-wrap:wrap;gap:8px}
    .session-type{font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;background:color-mix(in srgb,var(--primary) 12%,transparent);color:var(--primary);padding:2px 8px;border-radius:999px}
    .session-room{font-size:11px;color:#6b7280}
    /* Registration */
    .reg-section{padding:60px 40px;text-align:center;background:${isExhibitor ? "#f0fdf4" : "#faf5ff"}}
    .reg-section h2{font-size:28px;font-weight:700;margin-bottom:8px}
    .reg-section>p{color:#6b7280;margin-bottom:32px;font-size:15px}
    .form-card{max-width:520px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:16px;padding:32px;text-align:left}
    .form-group{margin-bottom:16px}
    .form-group label{display:block;font-size:13px;font-weight:600;color:#374151;margin-bottom:6px}
    .form-group input,.form-group select,.form-group textarea{width:100%;padding:10px 14px;border:1.5px solid #e5e7eb;border-radius:8px;font-size:14px;background:#fff;outline:none;font-family:inherit}
    .form-group textarea{resize:vertical;min-height:80px}
    .form-group input:focus,.form-group select:focus,.form-group textarea:focus{border-color:var(--primary);box-shadow:0 0 0 3px color-mix(in srgb,var(--primary) 15%,transparent)}
    .form-row{display:grid;grid-template-columns:1fr 1fr;gap:12px}
    .submit-btn{width:100%;padding:14px;background:var(--primary);color:#fff;border:none;border-radius:10px;font-size:15px;font-weight:700;cursor:pointer;margin-top:8px;transition:opacity .2s}
    .submit-btn:hover{opacity:.88}
    footer{background:var(--bg-dark);color:rgba(255,255,255,.4);text-align:center;padding:24px;font-size:12px}
    @media(max-width:640px){nav{padding:12px 20px}.nav-links{display:none}.hero{padding:60px 20px}.stats{grid-template-columns:1fr}.features{grid-template-columns:1fr}.form-row{grid-template-columns:1fr}.sessions-grid{grid-template-columns:1fr}}
  </style>
</head>
<body>
  <nav>
    <span class="nav-brand">${eventShort}</span>
    <div class="nav-links">
      ${page.show_programme ? "<span>Programme</span>" : ""}
      <span>${isExhibitor ? "Exposants" : "Infos pratiques"}</span>
      <span>Contact</span>
    </div>
    <button class="btn-primary">${ctaText}</button>
  </nav>

  <section class="hero">
    ${isExhibitor ? `<div class="hero-badge">🏢 Espace Exposants</div>` : ""}
    ${dateStr ? `<p class="hero-eyebrow">${dateStr}${endDateStr}</p>` : ""}
    <h1>${heroTitle}</h1>
    ${heroSubtitle ? `<p class="hero-sub">${heroSubtitle}</p>` : ""}
    <div class="hero-btns">
      <button class="btn-primary" style="padding:14px 36px;font-size:16px">${ctaText}</button>
      ${page.show_programme ? `<button class="btn-outline" style="padding:14px 36px;font-size:16px">Voir le programme</button>` : `<button class="btn-outline" style="padding:14px 36px;font-size:16px">En savoir plus</button>`}
    </div>
  </section>

  ${page.description ? `<div style="padding:16px 40px;background:#fff;text-align:center;color:#6b7280;font-size:14px;border-bottom:1px solid #e5e7eb">${page.description}</div>` : ""}

  <div class="stats">
    <div class="stat"><div class="stat-value">${page.stat1_value}</div><div class="stat-label">${page.stat1_label}</div></div>
    <div class="stat"><div class="stat-value">${page.stat2_value}</div><div class="stat-label">${page.stat2_label}</div></div>
    <div class="stat"><div class="stat-value">${page.stat3_value}</div><div class="stat-label">${page.stat3_label}</div></div>
  </div>

  <div class="features-section">
    <div class="section-inner">
      <h2 class="section-title">Pourquoi ${isExhibitor ? "exposer" : "participer"} ?</h2>
      <div class="features">
        ${(isExhibitor
          ? ["Visibilité internationale", "Rencontres B2B qualifiées", "Matchmaking IA", "Surface d'exposition flexible", "Accès aux acheteurs mondiaux", "Support logistique complet"]
          : ["Networking B2B", "Conférences & Ateliers", "Démonstrations live", "Matchmaking IA", "Accès aux exposants internationaux", "Programme enrichi J1-J4"]
        ).map(f => `<div class="feature"><div class="check"></div>${f}</div>`).join("")}
      </div>
    </div>
  </div>

  ${programmeHtml}

  <section class="reg-section" id="inscription">
    <div class="section-inner">
      <h2>${isExhibitor ? "Réservez votre espace" : "Inscrivez-vous maintenant"}</h2>
      <p>${isExhibitor ? "Rejoignez les exposants de cette édition" : "Accès gratuit pour les visiteurs professionnels"}</p>
      <div class="form-card" id="form-card">
        ${formHtml}
        <button class="submit-btn" id="submit-btn">${ctaText}</button>
      </div>
    </div>
  </section>

  <footer>© 2026 ${event?.name ?? "AI Event OS"} — Powered by AI EVENT OS</footer>

  <script>
    const primary = '${primary}';

    // All CTA / hero buttons → scroll to form
    document.querySelectorAll('.btn-primary:not(#submit-btn), nav .btn-primary').forEach(btn => {
      btn.addEventListener('click', () => {
        document.getElementById('inscription').scrollIntoView({ behavior: 'smooth' });
        setTimeout(() => {
          const first = document.querySelector('#form-card input, #form-card select');
          if (first) first.focus();
        }, 600);
      });
    });

    // "Voir le programme" / "En savoir plus"
    document.querySelectorAll('.btn-outline').forEach(btn => {
      btn.addEventListener('click', () => {
        const target = document.querySelector('.programme-section') || document.querySelector('.features-section');
        if (target) target.scrollIntoView({ behavior: 'smooth' });
      });
    });

    // Nav links
    document.querySelectorAll('.nav-links span').forEach((link, i) => {
      link.addEventListener('click', () => {
        const sections = ['.programme-section', '.features-section', '#inscription'];
        const el = document.querySelector(sections[i] || '#inscription');
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      });
    });

    // Form submit
    document.getElementById('submit-btn')?.addEventListener('click', async () => {
      let requiredIds = [];
      ${submitJs}

      // Validate
      let valid = true;
      requiredIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) { el.style.border = '1.5px solid #e5e7eb'; if (!el.value.trim()) { el.style.border = '1.5px solid #ef4444'; valid = false; } }
      });
      if (!valid) return;

      const btn = document.getElementById('submit-btn');
      btn.textContent = 'En cours…';
      btn.disabled = true;

      try {
        await fetch('${submitEndpoint}', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      } catch(_) {}

      document.getElementById('form-card').innerHTML = \`
        <div style="text-align:center;padding:40px 20px">
          <div style="width:64px;height:64px;background:\${primary};border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 20px">
            <span style="color:#fff;font-size:28px;font-weight:700">✓</span>
          </div>
          <h3 style="font-size:22px;font-weight:800;margin-bottom:10px;color:#111">${isExhibitor ? "Demande reçue !" : "Inscription confirmée !"}</h3>
          <p style="color:#6b7280;font-size:15px">${isExhibitor ? "Notre équipe vous contactera dans les 48h pour finaliser votre participation." : "Vous recevrez un email de confirmation dans quelques instants."}</p>
        </div>
      \`;
    });
  </script>
</body>
</html>`;

  const blob = new Blob([html], { type: "text/html" });
  const url  = URL.createObjectURL(blob);
  window.open(url, "_blank");
  setTimeout(() => URL.revokeObjectURL(url), 15000);
}

// ── Live preview (mini) ────────────────────────────────────────────────────────

function LivePreview({ page, event }: { page: LandingPage; event?: EventOption }) {
  const heroTitle    = page.hero_title    || event?.name    || "Votre événement";
  const heroSubtitle = page.hero_subtitle || [event?.venue_name, event?.city].filter(Boolean).join(", ") || "";
  const ctaText      = page.cta_text      || (page.page_type === "exhibitor" ? "Devenir exposant" : "S'inscrire gratuitement");
  const dateStr      = event?.start_date  ? fmtDate(event.start_date) : "";
  const eventShort   = event?.name?.split(" ").slice(0, 2).join(" ").toUpperCase() ?? "AI EVENT";
  const primary      = page.primary_color || "#7c3aed";
  const bgDark       = page.bg_dark || "#1a1040";
  const isExhibitor  = page.page_type === "exhibitor";

  return (
    <div className="flex flex-col h-full">
      {/* Browser chrome */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted/30 shrink-0">
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            <span className="h-2.5 w-2.5 rounded-full bg-destructive/60" />
            <span className="h-2.5 w-2.5 rounded-full bg-warning/60" />
            <span className="h-2.5 w-2.5 rounded-full bg-success/60" />
          </div>
          <div className="flex items-center rounded-md bg-card border border-border px-3 py-1 text-xs text-muted-foreground font-mono">
            aievent.ma{page.slug}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold",
            isExhibitor ? "bg-emerald-500/10 text-emerald-600" : "bg-primary/10 text-primary"
          )}>
            {isExhibitor ? <Building2 className="h-2.5 w-2.5" /> : <Users className="h-2.5 w-2.5" />}
            {isExhibitor ? "Exposants" : "Visiteurs"}
          </span>
          <button
            className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => {/* sessions fetched in parent */}}
          >
            <ExternalLink className="h-3 w-3" /> Ouvrir
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        <div className="rounded-xl border border-border overflow-hidden shadow-elevated bg-white text-sm">
          {/* Nav */}
          <div className="flex items-center justify-between px-5 py-3 text-white" style={{ background: bgDark }}>
            <span className="font-bold text-sm tracking-wide">{eventShort}</span>
            <div className="hidden sm:flex items-center gap-4 text-[11px] text-white/60">
              {page.show_programme && <span>Programme</span>}
              <span>{isExhibitor ? "Exposants" : "Infos"}</span>
            </div>
            <span className="text-[11px] rounded-full px-3 py-1 font-semibold text-white" style={{ background: primary }}>{ctaText}</span>
          </div>

          {/* Hero */}
          <div className="relative px-6 py-12 text-white text-center"
            style={{ background: `linear-gradient(135deg, ${bgDark} 0%, ${primary}99 60%, ${primary}66 100%)` }}>
            {isExhibitor && (
              <div className="inline-block rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[10px] font-semibold text-white/80 mb-3">
                🏢 Espace Exposants
              </div>
            )}
            {dateStr && <p className="text-[10px] font-semibold tracking-[0.2em] uppercase text-white/40 mb-2">{dateStr}</p>}
            <h1 className="font-display text-xl font-bold leading-tight mb-1">{heroTitle}</h1>
            {heroSubtitle && <p className="text-xs text-white/50 mb-4">{heroSubtitle}</p>}
            <div className="flex items-center justify-center gap-2 mt-4 flex-wrap">
              <span className="rounded-full px-4 py-1.5 text-xs font-semibold text-white shadow-glow-sm" style={{ background: primary }}>{ctaText}</span>
              <span className="rounded-full border border-white/25 px-4 py-1.5 text-xs text-white/75">
                {page.show_programme ? "Programme" : "En savoir plus"}
              </span>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 divide-x divide-border bg-card">
            {[
              { v: page.stat1_value, l: page.stat1_label },
              { v: page.stat2_value, l: page.stat2_label },
              { v: page.stat3_value, l: page.stat3_label },
            ].map((s) => (
              <div key={s.l} className="px-3 py-3 text-center">
                <p className="font-display text-base font-bold" style={{ color: primary }}>{s.v}</p>
                <p className="text-[10px] text-muted-foreground">{s.l}</p>
              </div>
            ))}
          </div>

          {/* Features */}
          <div className="px-5 py-4 bg-muted/10">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Pourquoi {isExhibitor ? "exposer" : "participer"} ?
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              {(isExhibitor
                ? ["Visibilité internationale", "Rencontres B2B", "Matchmaking IA", "Acheteurs mondiaux"]
                : ["Networking B2B", "Conférences", "Démonstrations live", "Matchmaking IA"]
              ).map((f) => (
                <div key={f} className="flex items-center gap-1.5 text-[11px] text-foreground">
                  <CheckCircle2 className="h-3 w-3 shrink-0" style={{ color: primary }} />{f}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Tab panels ─────────────────────────────────────────────────────────────────

function SeoPanel({ page, onUpdate }: { page: LandingPage; onUpdate: (p: Partial<LandingPage>) => void }) {
  const [title, setTitle] = useState(page.seo_title);
  const [desc, setDesc]   = useState(page.seo_description);
  const [saved, setSaved] = useState(false);
  function save() { onUpdate({ seo_title: title, seo_description: desc }); setSaved(true); setTimeout(() => setSaved(false), 2000); }
  return (
    <div className="p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-sm font-semibold">SEO</h3>
        <Button size="sm" className="h-7 text-xs bg-gradient-primary text-primary-foreground" onClick={save}>
          {saved ? <><CheckCircle2 className="h-3 w-3 mr-1" />Enregistré</> : "Sauvegarder"}
        </Button>
      </div>
      <div className="grid gap-1.5">
        <Label className="text-xs">Title tag <span className="text-muted-foreground">({title.length}/60)</span></Label>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} className={cn("text-xs", title.length > 55 ? "border-warning" : "")} />
      </div>
      <div className="grid gap-1.5">
        <Label className="text-xs">Meta description <span className="text-muted-foreground">({desc.length}/160)</span></Label>
        <Textarea rows={3} value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={160} className={cn("resize-none text-xs", desc.length > 150 ? "border-warning" : "")} />
      </div>
      {[
        { label: "Canonical URL", value: `https://aievent.ma${page.slug}`, ok: !!page.slug },
        { label: "Sitemap", value: "Généré automatiquement", ok: true },
      ].map((s) => (
        <div key={s.label} className="flex items-center gap-3 rounded-lg border border-border bg-card p-2.5">
          <CheckCircle2 className={cn("h-3.5 w-3.5 shrink-0", s.ok ? "text-success" : "text-warning")} />
          <div><p className="text-[10px] font-semibold text-muted-foreground uppercase">{s.label}</p><p className="text-xs text-foreground truncate">{s.value}</p></div>
        </div>
      ))}
    </div>
  );
}

function AnalyticsPanel({ page }: { page: LandingPage }) {
  const cr = page.visits > 0 ? ((page.conversions / page.visits) * 100).toFixed(1) : "—";
  return (
    <div className="p-5 space-y-4">
      <h3 className="font-display text-sm font-semibold">Analytics</h3>
      <div className="grid grid-cols-2 gap-2">
        {[
          { label: "Vues", value: page.visits.toLocaleString("fr-FR"), icon: Eye },
          { label: "Inscriptions", value: page.conversions.toLocaleString("fr-FR"), icon: MousePointerClick },
          { label: "Taux conv.", value: `${cr}%`, icon: TrendingUp },
          { label: "Visiteurs", value: Math.round(page.visits * 0.74).toLocaleString("fr-FR"), icon: Users },
        ].map((k) => (
          <div key={k.label} className="rounded-xl border border-border bg-card p-3">
            <div className="flex items-center gap-1.5 mb-1"><k.icon className="h-3.5 w-3.5 text-primary" /><span className="text-[10px] text-muted-foreground">{k.label}</span></div>
            <p className="text-lg font-bold tabular-nums">{k.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function FormsPanel({ page }: { page: LandingPage }) {
  const isExhibitor = page.page_type === "exhibitor";
  const visitorFields = ["Prénom *", "Nom *", "Email *", "Société", "Secteur"];
  const exhibitorFields = ["Nom société *", "Contact *", "Email *", "Téléphone", "Secteur", "Pays", "Ville", "Préférence stand", "Description"];
  const fields = isExhibitor ? exhibitorFields : visitorFields;
  return (
    <div className="p-5 space-y-3">
      <h3 className="font-display text-sm font-semibold">Formulaire — {isExhibitor ? "Exposant" : "Visiteur"}</h3>
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="bg-muted/40 px-3 py-2 border-b border-border">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase">Champs actifs</p>
        </div>
        <div className="divide-y divide-border/60">
          {fields.map((f) => (
            <div key={f} className="flex items-center justify-between px-3 py-2">
              <div className="flex items-center gap-2"><div className="h-1.5 w-1.5 rounded-full bg-primary" /><span className="text-xs text-foreground">{f.replace(" *","")}</span></div>
              {f.includes("*") && <span className="rounded-full bg-destructive/10 text-destructive text-[9px] font-semibold px-1.5 py-0.5">Requis</span>}
            </div>
          ))}
        </div>
      </div>
      <p className="text-[10px] text-muted-foreground">Les champs sont définis automatiquement selon le type de page ({isExhibitor ? "Exposant" : "Visiteur"}).</p>
    </div>
  );
}

function CtaPanel({ page, onUpdate }: { page: LandingPage; onUpdate: (p: Partial<LandingPage>) => void }) {
  const [cta, setCta] = useState(page.cta_text);
  const [saved, setSaved] = useState(false);
  function save() { onUpdate({ cta_text: cta }); setSaved(true); setTimeout(() => setSaved(false), 2000); }
  const presets = page.page_type === "exhibitor"
    ? ["Devenir exposant", "Réserver mon stand", "Soumettre ma candidature", "Nous contacter"]
    : ["S'inscrire gratuitement", "Réserver ma place", "Accéder au programme", "Je participe"];
  return (
    <div className="p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-sm font-semibold">CTA principal</h3>
        <Button size="sm" className="h-7 text-xs bg-gradient-primary text-primary-foreground" onClick={save}>
          {saved ? <><CheckCircle2 className="h-3 w-3 mr-1" />Enregistré</> : "Sauvegarder"}
        </Button>
      </div>
      <Input value={cta} onChange={(e) => setCta(e.target.value)} placeholder="Texte du bouton" />
      <div className="rounded-lg border border-border bg-card px-4 py-3 text-center">
        <span className="rounded-full px-5 py-2 text-sm font-semibold text-white" style={{ background: page.primary_color || "#7c3aed" }}>{cta || "Aperçu CTA"}</span>
      </div>
      <div className="space-y-1.5">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Suggestions</p>
        {presets.map((p) => (
          <button key={p} onClick={() => setCta(p)} className="w-full text-left rounded-lg border border-border/60 bg-card px-3 py-2 text-xs hover:border-primary/40 hover:bg-primary/5 transition-colors">{p}</button>
        ))}
      </div>
    </div>
  );
}

function TrackingPanel({ page, onUpdate }: { page: LandingPage; onUpdate: (p: Partial<LandingPage>) => void }) {
  const [ga, setGa]   = useState(page.ga_id);
  const [px, setPx]   = useState(page.meta_pixel);
  const [saved, setSaved] = useState(false);
  function save() { onUpdate({ ga_id: ga, meta_pixel: px }); setSaved(true); setTimeout(() => setSaved(false), 2000); }
  return (
    <div className="p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-sm font-semibold">Tracking</h3>
        <Button size="sm" className="h-7 text-xs bg-gradient-primary text-primary-foreground" onClick={save}>
          {saved ? <><CheckCircle2 className="h-3 w-3 mr-1" />Enregistré</> : "Sauvegarder"}
        </Button>
      </div>
      {[{ label: "Google Analytics 4", ph: "G-XXXXXXXXXX", v: ga, fn: setGa }, { label: "Meta Pixel ID", ph: "1234567890123", v: px, fn: setPx }].map((t) => (
        <div key={t.label} className="grid gap-1.5">
          <Label className="text-xs">{t.label}</Label>
          <Input placeholder={t.ph} value={t.v} onChange={(e) => t.fn(e.target.value)} className="font-mono text-xs h-9" />
          <p className={cn("text-[10px] flex items-center gap-1", t.v ? "text-success" : "text-muted-foreground")}>
            <span className={cn("h-1.5 w-1.5 rounded-full", t.v ? "bg-success" : "bg-muted-foreground")} />{t.v ? "Actif" : "Non configuré"}
          </p>
        </div>
      ))}
    </div>
  );
}

// ── Page form ──────────────────────────────────────────────────────────────────

interface PageFormProps {
  initial?: Partial<LandingPage>;
  events: EventOption[];
  onSubmit: (d: Partial<LandingPage>) => void;
  onCancel: () => void;
}

function PageForm({ initial = {}, events, onSubmit, onCancel }: PageFormProps) {
  const [form, setForm] = useState({ ...PAGE_DEFAULTS, ...initial });
  const [slugManual, setSlugManual] = useState(!!initial.slug);

  function set(k: keyof typeof PAGE_DEFAULTS, v: string | boolean) {
    setForm((p) => ({ ...p, [k]: v }));
  }
  function handleNameChange(name: string) {
    set("name", name);
    if (!slugManual) set("slug", slugify(name));
  }
  function handleTypeChange(type: string) {
    set("page_type", type);
    if (type === "exhibitor") {
      if (!form.cta_text || form.cta_text === PAGE_DEFAULTS.cta_text) set("cta_text", EXHIBITOR_DEFAULTS.cta_text!);
    } else {
      if (!form.cta_text || form.cta_text === EXHIBITOR_DEFAULTS.cta_text) set("cta_text", PAGE_DEFAULTS.cta_text);
    }
  }
  function handleSubmit(e: React.FormEvent) { e.preventDefault(); onSubmit(form); }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 py-2">
      {/* Type */}
      <div className="grid gap-1.5">
        <Label>Type de page *</Label>
        <div className="grid grid-cols-2 gap-2">
          {([["visitor","Inscription visiteur",Users],["exhibitor","Inscription exposant",Building2]] as const).map(([v,label,Icon]) => (
            <button key={v} type="button"
              onClick={() => handleTypeChange(v)}
              className={cn("flex items-center gap-2 rounded-lg border p-3 text-sm font-medium transition-colors",
                form.page_type === v ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground hover:border-primary/30")}>
              <Icon className="h-4 w-4" />{label}
            </button>
          ))}
        </div>
      </div>

      {/* Event */}
      <div className="grid gap-1.5">
        <Label>Événement *</Label>
        <Select required value={form.event_id} onValueChange={(v) => set("event_id", v)}>
          <SelectTrigger><SelectValue placeholder="Sélectionner un événement" /></SelectTrigger>
          <SelectContent>{events.map((e) => <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      {/* Name + slug */}
      <div className="grid gap-1.5">
        <Label>Nom *</Label>
        <Input required placeholder="Ex: Page exposants SIAM 2027" value={form.name} onChange={(e) => handleNameChange(e.target.value)} />
      </div>
      <div className="grid gap-1.5">
        <Label>Slug (URL) *</Label>
        <Input required placeholder="/nom-de-la-page" value={form.slug} onChange={(e) => { setSlugManual(true); set("slug", e.target.value); }} />
      </div>

      {/* Status */}
      <div className="grid gap-1.5">
        <Label>Statut</Label>
        <Select value={form.status} onValueChange={(v) => set("status", v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="draft">Brouillon</SelectItem><SelectItem value="published">Publié</SelectItem></SelectContent>
        </Select>
      </div>

      {/* Hero */}
      <div className="grid gap-1.5">
        <Label>Titre hero</Label>
        <Input placeholder="Ex: Rejoignez SIAM 2027" value={form.hero_title} onChange={(e) => set("hero_title", e.target.value)} />
      </div>
      <div className="grid gap-1.5">
        <Label>Sous-titre / lieu</Label>
        <Input placeholder="Foire de Casablanca, Maroc" value={form.hero_subtitle} onChange={(e) => set("hero_subtitle", e.target.value)} />
      </div>
      <div className="grid gap-1.5">
        <Label>Bouton CTA</Label>
        <Input placeholder="S'inscrire gratuitement" value={form.cta_text} onChange={(e) => set("cta_text", e.target.value)} />
      </div>
      <div className="grid gap-1.5">
        <Label>Description courte</Label>
        <Textarea rows={2} className="resize-none" value={form.description} onChange={(e) => set("description", e.target.value)} />
      </div>

      {/* Colors */}
      <div className="rounded-lg bg-muted/30 p-3 space-y-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
          <Palette className="h-3.5 w-3.5" /> Couleurs
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label className="text-xs">Couleur principale</Label>
            <div className="flex items-center gap-2">
              <input type="color" value={form.primary_color} onChange={(e) => set("primary_color", e.target.value)}
                className="h-9 w-10 rounded-md border border-border cursor-pointer" />
              <Input value={form.primary_color} onChange={(e) => set("primary_color", e.target.value)}
                className="font-mono text-xs h-9 flex-1" maxLength={7} />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">Fond sombre (nav/hero)</Label>
            <div className="flex items-center gap-2">
              <input type="color" value={form.bg_dark} onChange={(e) => set("bg_dark", e.target.value)}
                className="h-9 w-10 rounded-md border border-border cursor-pointer" />
              <Input value={form.bg_dark} onChange={(e) => set("bg_dark", e.target.value)}
                className="font-mono text-xs h-9 flex-1" maxLength={7} />
            </div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="rounded-lg bg-muted/30 p-3 space-y-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Statistiques</p>
        {([
          ["stat1_value","stat1_label","Stat 1"],
          ["stat2_value","stat2_label","Stat 2"],
          ["stat3_value","stat3_label","Stat 3"],
        ] as const).map(([vk,lk,placeholder]) => (
          <div key={vk} className="grid grid-cols-2 gap-2">
            <Input placeholder="240+" value={(form as unknown as Record<string,string>)[vk]} onChange={(e) => set(vk, e.target.value)} className="h-8 text-xs" />
            <Input placeholder={placeholder === "Stat 1" ? "Exposants" : placeholder === "Stat 2" ? "Visiteurs" : "Pays"} value={(form as unknown as Record<string,string>)[lk]} onChange={(e) => set(lk, e.target.value)} className="h-8 text-xs" />
          </div>
        ))}
      </div>

      {/* Programme */}
      <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5">
        <CalendarDays className="h-4 w-4 text-muted-foreground shrink-0" />
        <div className="flex-1">
          <p className="text-xs font-medium text-foreground">Afficher le programme</p>
          <p className="text-[10px] text-muted-foreground">Sessions de l'événement sur la page</p>
        </div>
        <button type="button" onClick={() => set("show_programme", !form.show_programme)}
          className={cn("relative h-5 w-9 rounded-full transition-colors shrink-0", form.show_programme ? "bg-primary" : "bg-muted-foreground/30")}>
          <span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform", form.show_programme ? "translate-x-4" : "translate-x-0.5")} />
        </button>
      </div>

      {/* SEO */}
      <div className="rounded-lg bg-muted/30 p-3 space-y-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">SEO</p>
        <Input placeholder="Title tag (60 car.)" value={form.seo_title} onChange={(e) => set("seo_title", e.target.value)} className="h-8 text-xs" maxLength={60} />
        <Textarea rows={2} className="resize-none text-xs" placeholder="Meta description (160 car.)" value={form.seo_description} onChange={(e) => set("seo_description", e.target.value)} maxLength={160} />
      </div>

      {/* Tracking */}
      <div className="rounded-lg bg-muted/30 p-3 space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Tracking</p>
        <div className="grid grid-cols-2 gap-2">
          <Input placeholder="G-XXXXXXXXXX" value={form.ga_id} onChange={(e) => set("ga_id", e.target.value)} className="h-8 text-xs font-mono" />
          <Input placeholder="Meta Pixel ID" value={form.meta_pixel} onChange={(e) => set("meta_pixel", e.target.value)} className="h-8 text-xs font-mono" />
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2 border-t border-border">
        <Button type="button" variant="outline" onClick={onCancel}>Annuler</Button>
        <Button type="submit" className="bg-gradient-primary text-primary-foreground shadow-glow-sm">
          {"id" in initial ? "Enregistrer" : "Créer la page"}
        </Button>
      </div>
    </form>
  );
}

// ── Main module ────────────────────────────────────────────────────────────────

function LandingPageModule() {
  const [pages, setPages]           = useState<LandingPage[]>(loadPages);
  const [activeTab, setActiveTab]   = useState<Tab>("pages");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch]         = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<LandingPage | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LandingPage | null>(null);

  const { data: events = [] } = useQuery({ queryKey: ["events-options"], queryFn: fetchEvents, staleTime: 5 * 60 * 1000 });
  const eventMap = Object.fromEntries(events.map((e) => [String(e.id), e]));

  useEffect(() => { savePages(pages); }, [pages]);
  const selectedPage = pages.find((p) => p.id === selectedId) ?? pages[0] ?? null;
  useEffect(() => { if (!selectedId && pages.length > 0) setSelectedId(pages[0].id); }, [pages, selectedId]);

  const selectedEvent = selectedPage ? eventMap[selectedPage.event_id] : undefined;

  // Fetch sessions for the selected event (for programme + openFullPreview)
  const { data: sessions = [] } = useQuery({
    queryKey: ["public-sessions", selectedEvent?.id],
    queryFn: () => fetchSessions(selectedEvent?.id),
    enabled: !!(selectedPage?.show_programme && selectedEvent?.id),
    staleTime: 2 * 60 * 1000,
  });

  const filtered = pages.filter((p) => !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.slug.includes(search.toLowerCase()));

  function createPage(data: Partial<LandingPage>) {
    const now = new Date().toISOString();
    const page: LandingPage = { ...PAGE_DEFAULTS, id: newId(), visits: 0, conversions: 0, created_at: now, updated_at: now, ...data };
    setPages((p) => [page, ...p]);
    setSelectedId(page.id);
    setShowCreate(false);
  }
  function updatePage(id: string, data: Partial<LandingPage>) {
    setPages((p) => p.map((pg) => pg.id === id ? { ...pg, ...data, updated_at: new Date().toISOString() } : pg));
    setEditTarget(null);
  }
  function deletePage(id: string) {
    setPages((p) => p.filter((pg) => pg.id !== id));
    if (selectedId === id) setSelectedId(pages.find((p) => p.id !== id)?.id ?? null);
    setDeleteTarget(null);
  }
  function duplicatePage(page: LandingPage) {
    const now = new Date().toISOString();
    const copy: LandingPage = { ...page, id: newId(), name: `${page.name} (copie)`, slug: `${page.slug}-copie`, status: "draft", visits: 0, conversions: 0, created_at: now, updated_at: now };
    setPages((p) => [copy, ...p]); setSelectedId(copy.id);
  }
  function toggleStatus(page: LandingPage) { updatePage(page.id, { status: page.status === "published" ? "draft" : "published" }); }

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-card/50 shrink-0">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Landing Pages</p>
          <h1 className="font-display text-xl font-semibold text-foreground mt-0.5">Générateur de landing pages</h1>
        </div>
        <Button size="sm" className="h-8 bg-gradient-primary text-primary-foreground shadow-glow-sm text-xs" onClick={() => setShowCreate(true)}>
          <Plus className="h-3.5 w-3.5" /> Nouvelle page
        </Button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left panel */}
        <aside className="w-72 shrink-0 border-r border-border flex flex-col bg-card overflow-hidden">
          <div className="p-2.5 border-b border-border shrink-0">
            <div className="grid grid-cols-3 gap-1">
              {tabs.map((t) => (
                <button key={t.key} onClick={() => setActiveTab(t.key)}
                  className={cn("flex flex-col items-center gap-1 rounded-lg px-1.5 py-2 text-[10px] font-medium transition-colors",
                    activeTab === t.key ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted/50")}>
                  <t.icon className="h-3.5 w-3.5" />{t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="px-3 pt-3 pb-2 shrink-0">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher…" className="pl-8 h-8 text-xs bg-muted/40 border-transparent" />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-2.5 pb-3 space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground px-1 mb-1.5">{filtered.length} page{filtered.length !== 1 ? "s" : ""}</p>
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <AlertCircle className="h-6 w-6 text-muted-foreground/40" />
                <p className="text-xs text-muted-foreground">Aucune page</p>
                <button onClick={() => setShowCreate(true)} className="text-xs text-primary hover:underline">Créer une page</button>
              </div>
            ) : filtered.map((p) => {
              const ev = eventMap[p.event_id];
              const cr = p.visits > 0 ? ((p.conversions / p.visits) * 100).toFixed(1) : "—";
              return (
                <button key={p.id} onClick={() => setSelectedId(p.id)}
                  className={cn("w-full rounded-lg px-3 py-2.5 text-left transition-colors",
                    selectedId === p.id ? "bg-primary/10 ring-1 ring-primary/30" : "hover:bg-muted/50")}>
                  <div className="flex items-start justify-between gap-2">
                    <span className={cn("text-xs font-medium truncate", selectedId === p.id ? "text-primary" : "text-foreground")}>{p.name}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      {p.page_type === "exhibitor"
                        ? <Building2 className="h-2.5 w-2.5 text-emerald-600" />
                        : <Users className="h-2.5 w-2.5 text-sky-500" />}
                      <span className={cn("rounded-full text-[9px] font-semibold px-1.5 py-0.5",
                        p.status === "published" ? "bg-success/10 text-success" : "bg-muted text-muted-foreground")}>
                        {p.status === "published" ? "Publiée" : "Brouillon"}
                      </span>
                    </div>
                  </div>
                  {ev && <p className="text-[10px] text-primary/70 mt-0.5 truncate">{ev.name}</p>}
                  <p className="text-[10px] text-muted-foreground font-mono mt-0.5 truncate">{p.slug}</p>
                  <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
                    <span>{p.visits.toLocaleString("fr-FR")} vues</span><span>·</span><span>{cr}% CR</span>
                  </div>
                </button>
              );
            })}
          </div>

          {selectedPage && (
            <div className="border-t border-border p-2.5 space-y-0.5 shrink-0">
              {[
                { label: "Modifier", icon: Edit3, action: () => setEditTarget(selectedPage) },
                { label: "Dupliquer", icon: Copy, action: () => duplicatePage(selectedPage) },
                { label: selectedPage.status === "published" ? "Dépublier" : "Publier", icon: Globe, action: () => toggleStatus(selectedPage) },
              ].map((a) => (
                <button key={a.label} onClick={a.action}
                  className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                  <a.icon className="h-3.5 w-3.5" />{a.label}
                </button>
              ))}
              <button onClick={() => setDeleteTarget(selectedPage)}
                className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs text-destructive/70 hover:bg-destructive/5 hover:text-destructive transition-colors">
                <Trash2 className="h-3.5 w-3.5" /> Supprimer
              </button>
            </div>
          )}
        </aside>

        {/* Right panel */}
        <div className="flex-1 flex flex-col overflow-hidden bg-muted/20">
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-card/50 shrink-0">
            <Tag className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold text-foreground">
              {activeTab === "pages" ? "Aperçu" : activeTab === "seo" ? "SEO" : activeTab === "analytics" ? "Analytics" : activeTab === "forms" ? "Formulaire" : activeTab === "cta" ? "CTA" : "Tracking"}
            </span>
            {selectedPage && <span className="ml-auto text-xs text-muted-foreground truncate max-w-[200px]">{selectedPage.name}</span>}
            {selectedPage && (
              <button onClick={() => setEditTarget(selectedPage)}
                className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-xs text-muted-foreground hover:text-foreground ml-2">
                <Pencil className="h-3 w-3" /> Modifier
              </button>
            )}
            {selectedPage && activeTab === "pages" && (
              <button onClick={() => openFullPreview(selectedPage, selectedEvent, sessions)}
                className="inline-flex h-7 items-center gap-1.5 rounded-md border border-primary/30 bg-primary/5 px-2.5 text-xs text-primary hover:bg-primary/10">
                <ExternalLink className="h-3 w-3" /> Ouvrir
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto">
            {!selectedPage ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-center p-8">
                <LayoutTemplate className="h-10 w-10 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">Aucune page sélectionnée</p>
                <Button size="sm" onClick={() => setShowCreate(true)} className="bg-gradient-primary text-primary-foreground"><Plus className="h-4 w-4" /> Créer une page</Button>
              </div>
            ) : activeTab === "pages"     ? <LivePreview page={selectedPage} event={selectedEvent} />
              : activeTab === "seo"       ? <SeoPanel page={selectedPage} onUpdate={(d) => updatePage(selectedPage.id, d)} />
              : activeTab === "analytics" ? <AnalyticsPanel page={selectedPage} />
              : activeTab === "forms"     ? <FormsPanel page={selectedPage} />
              : activeTab === "cta"       ? <CtaPanel page={selectedPage} onUpdate={(d) => updatePage(selectedPage.id, d)} />
              :                             <TrackingPanel page={selectedPage} onUpdate={(d) => updatePage(selectedPage.id, d)} />
            }
          </div>
        </div>
      </div>

      <Sheet open={showCreate} onOpenChange={setShowCreate}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader className="mb-4"><SheetTitle>Nouvelle landing page</SheetTitle><SheetDescription>Créez une page de destination pour votre événement.</SheetDescription></SheetHeader>
          <PageForm events={events} onCancel={() => setShowCreate(false)} onSubmit={createPage} />
        </SheetContent>
      </Sheet>

      <Sheet open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader className="mb-4"><SheetTitle>Modifier la page</SheetTitle><SheetDescription>Mettez à jour les paramètres de cette landing page.</SheetDescription></SheetHeader>
          {editTarget && <PageForm events={events} initial={editTarget} onCancel={() => setEditTarget(null)} onSubmit={(d) => updatePage(editTarget.id, d)} />}
        </SheetContent>
      </Sheet>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cette page ?</AlertDialogTitle>
            <AlertDialogDescription><span className="font-semibold text-foreground">"{deleteTarget?.name}"</span> sera supprimée définitivement.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => deleteTarget && deletePage(deleteTarget.id)}>Supprimer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
