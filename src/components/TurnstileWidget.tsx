import { useEffect, useId, useRef } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          "expired-callback"?: () => void;
          "error-callback"?: () => void;
          theme?: "light" | "dark" | "auto";
        },
      ) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId?: string) => void;
    };
  }
}

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js";
let scriptPromise: Promise<void> | null = null;

function loadTurnstileScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Impossibile caricare Cloudflare Turnstile"));
    document.head.appendChild(script);
  });
  return scriptPromise;
}

/**
 * Widget Cloudflare Turnstile ("sei un umano?" silenzioso, quasi sempre
 * invisibile). Richiesto da Supabase Auth quando "Enable Captcha
 * protection" è attivo su Attack Protection — senza questo componente,
 * signInWithPassword/signUp falliscono con "captcha verification process
 * failed" perché nessun token viene inviato.
 *
 * Richiede la variabile d'ambiente VITE_TURNSTILE_SITE_KEY (pubblica,
 * sicura da esporre nel bundle client — è la "site key", non il secret).
 */
export function TurnstileWidget({
  onVerify,
  onExpire,
}: {
  onVerify: (token: string) => void;
  onExpire?: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | undefined>(undefined);
  const id = useId();
  const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;

  useEffect(() => {
    if (!siteKey || !containerRef.current) return;
    let cancelled = false;

    loadTurnstileScript().then(() => {
      if (cancelled || !containerRef.current || !window.turnstile) return;
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        callback: onVerify,
        "expired-callback": onExpire,
        theme: "light",
      });
    });

    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteKey]);

  if (!siteKey) {
    // In sviluppo locale senza la env var, non blocchiamo il flusso: solo
    // un avviso in console. In produzione la variabile deve essere sempre
    // presente, altrimenti login/registrazione falliscono silenziosamente
    // lato Supabase.
    if (import.meta.env.DEV) {
      console.warn("[TurnstileWidget] VITE_TURNSTILE_SITE_KEY non impostata: captcha disattivato in dev.");
    }
    return null;
  }

  return <div ref={containerRef} id={`turnstile-${id}`} className="flex justify-center" />;
}