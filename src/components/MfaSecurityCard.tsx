import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ShieldCheck, ShieldOff, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Factor = {
  id: string;
  friendly_name?: string | null;
  status: "verified" | "unverified";
};

/**
 * Attivazione/gestione autenticazione a due fattori (TOTP — Google
 * Authenticator, Authy, ecc.), opzionale per l'utente. Non obbligatoria:
 * chi non la attiva continua a usare solo email+password come oggi.
 *
 * Il secondo passo al login (richiesta del codice a 6 cifre dopo
 * email+password) è gestito in login.tsx.
 */
export function MfaSecurityCard() {
  const [factors, setFactors] = useState<Factor[]>([]);
  const [loading, setLoading] = useState(true);
  const [enrolling, setEnrolling] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [pendingFactorId, setPendingFactorId] = useState<string | null>(null);
  const [verifyCode, setVerifyCode] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const refreshFactors = async () => {
    if (!supabase) return;
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) {
      console.error("[MfaSecurityCard] Errore lettura fattori:", error);
      return;
    }
    setFactors((data?.totp ?? []) as Factor[]);
  };

  useEffect(() => {
    refreshFactors().finally(() => setLoading(false));
  }, []);

  const hasVerifiedFactor = factors.some((f) => f.status === "verified");

  const startEnroll = async () => {
    if (!supabase) return;
    setEnrolling(true);
    try {
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp" });
      if (error) throw error;
      setQrCode(data.totp.qr_code);
      setSecret(data.totp.secret);
      setPendingFactorId(data.id);
    } catch (error) {
      toast.error("Impossibile avviare l'attivazione", {
        description: error instanceof Error ? error.message : "Riprova tra poco.",
      });
      setEnrolling(false);
    }
  };

  const confirmEnroll = async () => {
    if (!supabase || !pendingFactorId) return;
    if (verifyCode.length !== 6) {
      toast.error("Inserisci il codice a 6 cifre dall'app di autenticazione.");
      return;
    }
    setSubmitting(true);
    try {
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId: pendingFactorId,
      });
      if (challengeError) throw challengeError;

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: pendingFactorId,
        challengeId: challenge.id,
        code: verifyCode,
      });
      if (verifyError) throw verifyError;

      toast.success("Autenticazione a due fattori attivata");
      setEnrolling(false);
      setQrCode(null);
      setSecret(null);
      setPendingFactorId(null);
      setVerifyCode("");
      await refreshFactors();
    } catch (error) {
      toast.error("Codice non valido", {
        description: "Controlla l'ora del telefono e riprova con il codice più recente.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const cancelEnroll = async () => {
    if (supabase && pendingFactorId) {
      await supabase.auth.mfa.unenroll({ factorId: pendingFactorId });
    }
    setEnrolling(false);
    setQrCode(null);
    setSecret(null);
    setPendingFactorId(null);
    setVerifyCode("");
  };

  const disableMfa = async (factorId: string) => {
    if (!supabase) return;
    if (!confirm("Disattivare l'autenticazione a due fattori? Il tuo account sarà protetto solo da password.")) {
      return;
    }
    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId });
      if (error) throw error;
      toast.success("Autenticazione a due fattori disattivata");
      await refreshFactors();
    } catch (error) {
      toast.error("Impossibile disattivare", {
        description: error instanceof Error ? error.message : "Riprova tra poco.",
      });
    }
  };

  if (loading) {
    return (
      <section className="rounded-3xl border border-border/60 bg-card p-4 shadow-card sm:p-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Caricamento sicurezza account…
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-3xl border border-border/60 bg-card p-4 shadow-card sm:p-6">
      <div className="flex items-center gap-2">
        {hasVerifiedFactor ? (
          <ShieldCheck className="size-5 text-primary" />
        ) : (
          <ShieldOff className="size-5 text-muted-foreground" />
        )}
        <h2 className="text-lg font-black tracking-tight">Autenticazione a due fattori</h2>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Aggiungi un secondo passaggio (codice da app tipo Google Authenticator) oltre alla
        password, per proteggere l'account anche se qualcuno scoprisse la tua password.
        Facoltativa — puoi disattivarla in ogni momento.
      </p>

      {hasVerifiedFactor && !enrolling && (
        <div className="mt-4 rounded-2xl border border-border/60 bg-surface-muted p-3">
          <p className="text-sm font-semibold text-foreground">Attiva su questo account</p>
          <Button
            variant="destructive"
            size="sm"
            className="mt-2"
            onClick={() => disableMfa(factors.find((f) => f.status === "verified")!.id)}
          >
            Disattiva
          </Button>
        </div>
      )}

      {!hasVerifiedFactor && !enrolling && (
        <Button className="mt-4" onClick={startEnroll}>
          Attiva autenticazione a due fattori
        </Button>
      )}

      {enrolling && qrCode && (
        <div className="mt-4 space-y-4 rounded-2xl border border-border/60 bg-surface-muted p-4">
          <div>
            <p className="text-sm font-semibold text-foreground">1. Inquadra il QR code</p>
            <p className="text-xs text-muted-foreground">
              Con un'app di autenticazione (Google Authenticator, Authy, ecc.)
            </p>
            {/* qr_code è già un'immagine SVG data-URI fornita da Supabase */}
            <img src={qrCode} alt="QR code per attivare l'autenticazione a due fattori" className="mt-2 h-40 w-40" />
            {secret && (
              <p className="mt-1 text-xs text-muted-foreground">
                Non riesci a inquadrarlo? Inserisci manualmente: <code className="font-mono">{secret}</code>
              </p>
            )}
          </div>
          <div>
            <Label htmlFor="mfa-code" className="text-sm font-semibold text-foreground">
              2. Inserisci il codice a 6 cifre
            </Label>
            <Input
              id="mfa-code"
              inputMode="numeric"
              maxLength={6}
              value={verifyCode}
              onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, ""))}
              placeholder="123456"
              className="mt-1"
            />
          </div>
          <div className="flex gap-2">
            <Button onClick={confirmEnroll} disabled={submitting || verifyCode.length !== 6}>
              {submitting ? "Verifica..." : "Conferma e attiva"}
            </Button>
            <Button variant="ghost" onClick={cancelEnroll}>
              Annulla
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}