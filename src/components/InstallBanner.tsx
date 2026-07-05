import { useEffect, useState } from "react";
import { Download, X, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";

const DISMISSED_KEY = "familymed:install-dismissed";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isInStandaloneMode() {
  return (
    "standalone" in window.navigator &&
    (window.navigator as { standalone?: boolean }).standalone === true
  );
}

export function InstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosGuide, setShowIosGuide] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Already dismissed or installed
    if (localStorage.getItem(DISMISSED_KEY) === "true") {
      setDismissed(true);
      return;
    }

    // Already installed as PWA
    if (isInStandaloneMode()) {
      setDismissed(true);
      return;
    }

    // iOS — show manual instructions
    if (isIos()) {
      setShowIosGuide(true);
      return;
    }

    // Android / Chrome — capture beforeinstallprompt
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleDismiss = () => {
    localStorage.setItem(DISMISSED_KEY, "true");
    setDismissed(true);
    setDeferredPrompt(null);
    setShowIosGuide(false);
  };

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const result = await deferredPrompt.userChoice;
    if (result.outcome === "accepted") {
      handleDismiss();
    }
    setDeferredPrompt(null);
  };

  if (dismissed) return null;

  // iOS guide banner
  if (showIosGuide) {
    return (
      <div className="fixed bottom-4 left-4 right-4 z-50 animate-in slide-in-from-bottom-4 duration-300 md:left-auto md:right-6 md:w-96">
        <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-lift ring-1 ring-primary/20">
          <div className="flex items-start gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
              <Smartphone className="size-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold">Installa FamilyMed su iPhone</p>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                Tocca{" "}
                <span className="inline-flex items-center gap-0.5 font-semibold text-foreground">
                  Condividi ↑
                </span>{" "}
                in Safari, poi scegli{" "}
                <span className="font-semibold text-foreground">
                  "Aggiungi alla schermata Home"
                </span>
                .
              </p>
            </div>
            <button
              onClick={handleDismiss}
              className="shrink-0 rounded-lg p-1 text-muted-foreground hover:bg-secondary hover:text-foreground transition"
              aria-label="Chiudi"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Android / Chrome native install prompt
  if (!deferredPrompt) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 animate-in slide-in-from-bottom-4 duration-300 md:left-auto md:right-6 md:w-96">
      <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-lift ring-1 ring-primary/20">
        <div className="flex items-start gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
            <Download className="size-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold">Installa FamilyMed</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Accesso rapido, funziona anche offline.
            </p>
          </div>
          <button
            onClick={handleDismiss}
            className="shrink-0 rounded-lg p-1 text-muted-foreground hover:bg-secondary hover:text-foreground transition"
            aria-label="Chiudi"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="mt-3 flex gap-2">
          <Button size="sm" className="flex-1 h-9 text-xs font-bold" onClick={handleInstall}>
            <Download className="mr-1.5 size-3.5" /> Aggiungi a Home
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-9 text-xs text-muted-foreground"
            onClick={handleDismiss}
          >
            Non ora
          </Button>
        </div>
      </div>
    </div>
  );
}
