import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

/**
 * Aggiunge gli header di sicurezza HTTP a qualsiasi Response.
 * Bilanciati per permettere il funzionamento dell'app (Supabase, Google Fonts,
 * manifest PWA, Service Worker) senza aprire vettori di attacco.
 */
function applySecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);

  // Content-Security-Policy
  // - default-src 'self': tutto da stesso dominio per default
  // - script-src 'unsafe-inline': necessario per TanStack Start (inline hydration script)
  // - style-src: permette Google Fonts e inline styles (Tailwind)
  // - font-src: Google Fonts CDN
  // - connect-src: Supabase API REST + WebSocket realtime
  // - img-src: 'self' + blob (foto upload) + data (icone base64) + https (avatar remoti)
  // - frame-ancestors 'none': impedisce embedding in iframe (anti-clickjacking)
  const supabaseSrc = "https://*.supabase.co wss://*.supabase.co";
  headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      `connect-src 'self' ${supabaseSrc} https://api.lovable.dev`,
      "img-src 'self' blob: data: https:",
      "media-src 'self' blob:",
      "worker-src 'self'",
      "manifest-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  );

  // Impedisce il caricamento in iframe (doppia protezione con frame-ancestors in CSP)
  headers.set("X-Frame-Options", "DENY");

  // Impedisce MIME-type sniffing
  headers.set("X-Content-Type-Options", "nosniff");

  // Limita le informazioni nell'header Referer per proteggere gli URL delle pagine
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  // Disabilita feature browser non usate dall'app medica
  headers.set(
    "Permissions-Policy",
    "geolocation=(), microphone=(), camera=(), payment=(), usb=(), interest-cohort=()",
  );

  // HSTS: forza HTTPS per 1 anno (Cloudflare Workers gira sempre su HTTPS)
  headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      const normalized = await normalizeCatastrophicSsrResponse(response);
      return applySecurityHeaders(normalized);
    } catch (error) {
      console.error(error);
      return applySecurityHeaders(
        new Response(renderErrorPage(), {
          status: 500,
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
      );
    }
  },
};
