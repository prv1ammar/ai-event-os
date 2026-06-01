import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import {
  CheckCircle2, XCircle, Camera, ScanLine, RefreshCw,
  User, Building2, BadgeCheck, Globe, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/api";
import { useEvent } from "@/lib/event-context";

export const Route = createFileRoute("/scanner")({
  component: ScannerPage,
  head: () => ({
    meta: [{ title: "Scanner QR — AI EVENT OS" }],
  }),
});

// ─── Types ────────────────────────────────────────────────────────────────────
interface ScanResult {
  status: "success" | "error";
  visitor?: {
    id: number;
    firstname?: string;
    lastname?: string;
    email?: string;
    company?: string;
    job_title?: string;
    country?: string;
    visitor_type?: string;
  };
  badge?: {
    badge_number?: string;
    badge_type?: string;
    status?: string;
  };
  badge_type?: string;
  badge_number?: string;
  errorMessage?: string;
}

// ─── Type colors ──────────────────────────────────────────────────────────────
const TYPE_CONFIG: Record<string, { label: string; bg: string; text: string; border: string }> = {
  vip:      { label: "VIP",         bg: "bg-purple-500/10", text: "text-purple-700", border: "border-purple-300" },
  press:    { label: "Presse",      bg: "bg-orange-500/10", text: "text-orange-700", border: "border-orange-300" },
  presse:   { label: "Presse",      bg: "bg-orange-500/10", text: "text-orange-700", border: "border-orange-300" },
  exhibitor:{ label: "Exposant",    bg: "bg-emerald-500/10",text: "text-emerald-700",border: "border-emerald-300" },
  staff:    { label: "Staff",       bg: "bg-red-500/10",    text: "text-red-700",    border: "border-red-300" },
  standard: { label: "Standard",    bg: "bg-sky-500/10",    text: "text-sky-700",    border: "border-sky-300" },
};
function getTypeConfig(type?: string) {
  return TYPE_CONFIG[(type ?? "standard").toLowerCase()] ?? TYPE_CONFIG.standard;
}

// ─── Result Card ──────────────────────────────────────────────────────────────
function ResultCard({ result, onReset }: { result: ScanResult; onReset: () => void }) {
  const isOk = result.status === "success";
  const v = result.visitor;
  const fullName = v ? `${v.firstname ?? ""} ${v.lastname ?? ""}`.trim() || `Visiteur #${v.id}` : "—";
  const initials = fullName.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");
  const typeConf = getTypeConfig(result.badge_type ?? v?.visitor_type);

  return (
    <div className={cn(
      "w-full max-w-sm mx-auto rounded-2xl border-2 overflow-hidden shadow-xl",
      isOk ? "border-emerald-400" : "border-red-400",
    )}>
      {/* Header */}
      <div className={cn("px-5 py-4 flex items-center gap-3", isOk ? "bg-emerald-50" : "bg-red-50")}>
        {isOk
          ? <CheckCircle2 className="h-8 w-8 text-emerald-500 shrink-0" />
          : <XCircle className="h-8 w-8 text-red-500 shrink-0" />}
        <div>
          <p className={cn("font-bold text-lg", isOk ? "text-emerald-700" : "text-red-700")}>
            {isOk ? "Accès autorisé" : "Accès refusé"}
          </p>
          <p className="text-sm text-muted-foreground">
            {isOk ? "Badge validé avec succès" : result.errorMessage ?? "QR code invalide"}
          </p>
        </div>
      </div>

      {isOk && v && (
        <div className="bg-white px-5 py-5 space-y-4">
          {/* Visitor info */}
          <div className="flex items-center gap-4">
            <div className={cn("h-14 w-14 rounded-full flex items-center justify-center text-lg font-bold shrink-0", typeConf.bg)}>
              <span className={typeConf.text}>{initials || "?"}</span>
            </div>
            <div>
              <p className="font-bold text-foreground text-base">{fullName}</p>
              {v.company && <p className="text-sm text-muted-foreground">{v.company}</p>}
              {v.job_title && <p className="text-xs text-muted-foreground">{v.job_title}</p>}
            </div>
          </div>

          {/* Details grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className={cn("rounded-xl border p-3", typeConf.border)}>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                <BadgeCheck className="h-3.5 w-3.5" /> Type de badge
              </div>
              <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold", typeConf.bg, typeConf.text)}>
                {typeConf.label}
              </span>
            </div>
            {result.badge_number && (
              <div className="rounded-xl border border-border p-3">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                  <ScanLine className="h-3.5 w-3.5" /> Numéro
                </div>
                <p className="font-mono text-sm font-semibold text-foreground">{result.badge_number}</p>
              </div>
            )}
            {v.email && (
              <div className="rounded-xl border border-border p-3 col-span-2">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                  <User className="h-3.5 w-3.5" /> Email
                </div>
                <p className="text-sm text-foreground truncate">{v.email}</p>
              </div>
            )}
            {v.country && (
              <div className="rounded-xl border border-border p-3">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                  <Globe className="h-3.5 w-3.5" /> Pays
                </div>
                <p className="text-sm text-foreground">{v.country}</p>
              </div>
            )}
          </div>
        </div>
      )}

      <div className={cn("px-5 py-4", isOk ? "bg-emerald-50/50" : "bg-red-50/50")}>
        <Button className="w-full" onClick={onReset}>
          <RefreshCw className="h-4 w-4" /> Scanner un autre badge
        </Button>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
function ScannerPage() {
  const { activeEvent } = useEvent();
  const eventId = activeEvent.id !== "0" ? activeEvent.id : null;
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [scanning, setScanning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [scanCount, setScanCount] = useState(0);

  async function startScanner() {
    setResult(null);
    setScanning(true);
    try {
      const qr = new Html5Qrcode("qr-reader");
      scannerRef.current = qr;
      await qr.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        onScanSuccess,
        () => {},
      );
    } catch {
      setScanning(false);
      setResult({ status: "error", errorMessage: "Impossible d'accéder à la caméra. Vérifiez les permissions." });
    }
  }

  async function stopScanner() {
    if (scannerRef.current) {
      try { await scannerRef.current.stop(); } catch {}
      scannerRef.current = null;
    }
    setScanning(false);
  }

  async function onScanSuccess(decodedText: string) {
    await stopScanner();
    setLoading(true);
    try {
      const res = await apiRequest<ScanResult>("/api/v1/scans/lookup", {
        method: "POST",
        body: JSON.stringify({
          qr_data: decodedText,
          event_id: eventId ? Number(eventId) : undefined,
        }),
      });
      setScanCount((c) => c + 1);
      setResult(res);
    } catch (e) {
      setResult({
        status: "error",
        errorMessage: e instanceof Error ? e.message : "QR code non reconnu",
      });
    } finally {
      setLoading(false);
    }
  }

  function handleReset() {
    setResult(null);
    setScanning(false);
  }

  useEffect(() => {
    return () => { stopScanner(); };
  }, []);

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-lg mx-auto space-y-6">
        {/* Header */}
        <div className="text-center">
          <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-primary/10 mb-3">
            <ScanLine className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Scanner QR</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {activeEvent.name} · {scanCount} scan{scanCount !== 1 ? "s" : ""} effectué{scanCount !== 1 ? "s" : ""}
          </p>
        </div>

        {/* Result */}
        {result && <ResultCard result={result} onReset={handleReset} />}

        {/* Loading */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Vérification en cours…</p>
          </div>
        )}

        {/* Camera viewfinder */}
        {!result && !loading && (
          <div className="space-y-4">
            <div className={cn(
              "relative rounded-2xl overflow-hidden border-2 bg-black aspect-square",
              scanning ? "border-primary shadow-glow-sm" : "border-border",
            )}>
              {/* QR reader container */}
              <div id="qr-reader" className="w-full h-full" />

              {/* Overlay when not scanning */}
              {!scanning && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-muted/80">
                  <Camera className="h-16 w-16 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground text-center px-4">
                    Appuyez sur le bouton ci-dessous pour activer la caméra
                  </p>
                </div>
              )}

              {/* Scanning overlay with corner marks */}
              {scanning && (
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                  <div className="relative w-48 h-48">
                    {/* Corner marks */}
                    {[
                      "top-0 left-0 border-t-4 border-l-4 rounded-tl-lg",
                      "top-0 right-0 border-t-4 border-r-4 rounded-tr-lg",
                      "bottom-0 left-0 border-b-4 border-l-4 rounded-bl-lg",
                      "bottom-0 right-0 border-b-4 border-r-4 rounded-br-lg",
                    ].map((cls, i) => (
                      <span key={i} className={cn("absolute w-8 h-8 border-primary", cls)} />
                    ))}
                    {/* Scan line animation */}
                    <div className="absolute inset-x-0 top-0 h-0.5 bg-primary animate-bounce" />
                  </div>
                </div>
              )}
            </div>

            {/* Action button */}
            {!scanning ? (
              <Button className="w-full h-12 text-base bg-gradient-primary text-primary-foreground shadow-glow-sm" onClick={startScanner}>
                <Camera className="h-5 w-5" /> Activer la caméra
              </Button>
            ) : (
              <Button variant="outline" className="w-full h-12 text-base" onClick={stopScanner}>
                <XCircle className="h-5 w-5" /> Arrêter le scan
              </Button>
            )}

            {/* Manual input fallback */}
            <div className="text-center">
              <p className="text-xs text-muted-foreground">
                Sur desktop, utilisez la caméra ou testez avec le format :<br />
                <code className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-mono">
                  AIEVENT|&#123;visitor_id&#125;|&#123;type&#125;|&#123;badge_num&#125;
                </code>
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
