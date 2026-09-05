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
      <div className="landing-light fixed bottom-4 left-4 right-4 z-50 animate-in slide-in-from-bottom-4 duration-300 md:left-auto md:right-6 md:w-[26rem]">
        <div className="rounded-3xl border border-stone-200/80 bg-white/95 p-4.5 text-stone-800 shadow-lg backdrop-blur-md ring-1 ring-emerald-800/10">
          <div className="flex items-start gap-3">
            <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-emerald-800/10 text-emerald-800">
              <Smartphone className="size-5.5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-base font-bold text-stone-900 tracking-tight">Installa FamilyMed su iPhone</p>
              <p className="mt-1 text-xs sm:text-sm text-stone-600 leading-relaxed font-normal">
                Tocca{" "}
                <span className="inline-flex items-center gap-0.5 font-bold text-emerald-800">
                  Condividi ↑
                </span>{" "}
                in Safari, poi scegli{" "}
                <span className="font-bold text-stone-900">
                  "Aggiungi alla schermata Home"
                </span>
                .
              </p>
            </div>
            <button
              onClick={handleDismiss}
              className="shrink-0 rounded-xl p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700 transition"
              aria-label="Chiudi"
            >
              <X className="size-4.5" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Android / Chrome native install prompt
  if (!deferredPrompt) return null;

  return (
    <div className="landing-light fixed bottom-4 left-4 right-4 z-50 animate-in slide-in-from-bottom-4 duration-300 md:left-auto md:right-6 md:w-[26rem]">
      <div className="rounded-3xl border border-stone-200/80 bg-white/95 p-4.5 text-stone-800 shadow-lg backdrop-blur-md ring-1 ring-emerald-800/10">
        <div className="flex items-start gap-3">
          <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-emerald-800/10 text-emerald-800">
            <Download className="size-5.5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-base font-bold text-stone-900 tracking-tight">Installa FamilyMed</p>
            <p className="mt-0.5 text-xs sm:text-sm text-stone-600 font-normal">
              Accesso rapido con un tap, funziona anche offline.
            </p>
          </div>
          <button
            onClick={handleDismiss}
            className="shrink-0 rounded-xl p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700 transition"
            aria-label="Chiudi"
          >
            <X className="size-4.5" />
          </button>
        </div>
        <div className="mt-4 flex gap-2.5">
          <Button
            size="sm"
            className="flex-1 h-10 text-xs sm:text-sm font-extrabold bg-emerald-800 text-white hover:bg-emerald-900 rounded-xl shadow-sm transition-all"
            onClick={handleInstall}
          >
            <Download className="mr-1.5 size-4" /> Aggiungi a Home
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-10 text-xs sm:text-sm font-semibold text-stone-500 hover:text-stone-800 hover:bg-stone-100 rounded-xl"
            onClick={handleDismiss}
          >
            Non ora
          </Button>
        </div>
      </div>
    </div>
  );
}