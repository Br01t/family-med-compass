import { useState } from "react";
import { Download, Trash2, AlertTriangle, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useFamilyMed } from "@/lib/store";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { logger } from "@/lib/logger";

/**
 * Card GDPR: esportazione dati (Data Portability) e cancellazione
 * definitiva dell'account (Diritto all'oblio).
 */
export function AccountDataCard() {
  const { data: storeData, logout, userProfile, user, resetDemoData } = useFamilyMed();
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [confirmChecked, setConfirmChecked] = useState(false);

  async function handleExport() {
    setExporting(true);
    try {
      let exportPayload: any = null;
      if (supabase && user) {
        const { data, error } = await supabase.rpc("export_my_data");
        if (!error && data) {
          exportPayload = data;
          supabase.rpc("log_gdpr_event", { _action: "data_exported" }).then(
            () => {},
            () => {},
          );
        }
      }

      // Fallback a dati locali se la RPC non restituisce o siamo in modalità locale
      if (!exportPayload) {
        exportPayload = {
          exported_at: new Date().toISOString(),
          profile: userProfile,
          patients: storeData.patients,
          therapies: storeData.therapies,
          events: storeData.events,
          notifications: storeData.notifications,
        };
      }

      const blob = new Blob([JSON.stringify(exportPayload, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const stamp = new Date().toISOString().slice(0, 10);
      a.download = `familymed-dati-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success("Esportazione completata", {
        description: "Il file JSON è stato scaricato.",
      });
    } catch (err: any) {
      toast.error("Esportazione fallita", { description: err?.message });
    } finally {
      setExporting(false);
    }
  }

  /**
   * Rimuove dal bucket Storage `therapy-photos` tutti i file delle terapie
   * dei pazienti di cui l'utente è owner, PRIMA di cancellare le righe DB
   * (che servono per sapere quali path cancellare, e perché la RLS del
   * bucket autorizza la remove() solo finché il collegamento paziente/
   * terapia esiste ancora). Senza questo passaggio, `delete_my_account()`
   * cancella solo la riga `therapies` in Postgres: il file fisico resta
   * nel bucket per sempre, occupando quota e restando valido per qualunque
   * Signed URL già emesso e non ancora scaduto (vedi
   * compliance/data-deletion-trace.md §3). Best-effort: un fallimento qui
   * non deve mai bloccare la cancellazione dell'account.
   */
  async function purgeOwnedTherapyPhotos(ownerUserId: string) {
    if (!supabase) return;
    try {
      const { data: patients, error: patientsError } = await supabase
        .from("patients")
        .select("id")
        .or(`user_id.eq.${ownerUserId},owner_user_id.eq.${ownerUserId}`);
      if (patientsError || !patients) return;

      for (const patient of patients) {
        const { data: therapies } = await supabase
          .from("therapies")
          .select("id")
          .eq("patient_id", patient.id);

        for (const therapy of therapies ?? []) {
          // Schema attuale: therapies/{patientId}/{therapyId}/...
          const { data: newSchemeFiles } = await supabase.storage
            .from("therapy-photos")
            .list(`therapies/${patient.id}/${therapy.id}`);
          if (newSchemeFiles && newSchemeFiles.length > 0) {
            const paths = newSchemeFiles.map(
              (f) => `therapies/${patient.id}/${therapy.id}/${f.name}`,
            );
            await supabase.storage.from("therapy-photos").remove(paths);
          }

          // Schema legacy (foto caricate prima del passaggio a bucket
          // privato): therapies/{therapyId}/... — ripulito per compatibilità.
          const { data: legacyFiles } = await supabase.storage
            .from("therapy-photos")
            .list(`therapies/${therapy.id}`);
          if (legacyFiles && legacyFiles.length > 0) {
            const paths = legacyFiles.map((f) => `therapies/${therapy.id}/${f.name}`);
            await supabase.storage.from("therapy-photos").remove(paths);
          }
        }
      }
    } catch (e) {
      logger.warn("[AccountDataCard] Pulizia foto Storage fallita (non bloccante)", e);
    }
  }

  /**
   * Rimuove dal bucket `caregiver-avatars` l'avatar dell'utente che sta
   * cancellando l'account — stesso motivo e stesso pattern di
   * purgeOwnedTherapyPhotos sopra: `delete_my_account()` cancella solo la
   * riga in `caregivers`, non il file fisico su Storage.
   */
  async function purgeOwnCaregiverAvatar(ownerUserId: string) {
    if (!supabase) return;
    try {
      const { data: files } = await supabase.storage
        .from("caregiver-avatars")
        .list(`caregivers/${ownerUserId}`);
      if (files && files.length > 0) {
        const paths = files.map((f) => `caregivers/${ownerUserId}/${f.name}`);
        await supabase.storage.from("caregiver-avatars").remove(paths);
      }
    } catch (e) {
      logger.warn("[AccountDataCard] Pulizia avatar caregiver fallita (non bloccante)", e);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      if (supabase && user) {
        try {
          await supabase.rpc("log_gdpr_event", { _action: "account_deleted" });
        } catch {
          // best-effort
        }
        await purgeOwnedTherapyPhotos(user.id);
        await purgeOwnCaregiverAvatar(user.id);
        const { error } = await supabase.rpc("delete_my_account");
        if (error) {
          logger.warn("Delete account RPC warning:", error);
        }
        try {
          await supabase.auth.signOut({ scope: "global" });
        } catch {
          // ignore
        }
      } else {
        resetDemoData();
      }

      toast.success("Account eliminato definitivamente.", {
        description: "Tutte le sessioni sono state revocate.",
      });
      await logout();
      if (typeof window !== "undefined") window.location.href = "/";
    } catch (err: any) {
      toast.error("Eliminazione fallita", { description: err?.message });
      setDeleting(false);
    }
  }

  const requiredWord = "ELIMINA";

  return (
    <section className="rounded-3xl border border-border/60 bg-card p-6 shadow-card">
      <div className="flex items-center gap-2">
        <ShieldCheck className="size-5 text-primary" />
        <h2 className="text-lg font-black tracking-tight">Gestione dati account (GDPR)</h2>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        Puoi scaricare una copia di tutti i dati collegati al tuo account, oppure richiedere
        l'eliminazione definitiva dell'account e dei dati correlati.
      </p>

      <div className="mt-4 space-y-3">
        <div className="rounded-2xl border border-border/50 p-4">
          <div className="flex items-start gap-3">
            <Download className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <div className="flex-1">
              <p className="text-sm font-bold">Esporta i miei dati</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Riceverai un file JSON con profilo, terapie, eventi, notifiche e link famiglia
                collegati al tuo account.
              </p>
            </div>
          </div>
          <Button
            className="mt-3 w-full"
            variant="outline"
            onClick={handleExport}
            disabled={exporting || deleting}
          >
            {exporting ? "Preparazione..." : "Scarica JSON"}
          </Button>
        </div>

        <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
            <div className="flex-1">
              <p className="text-sm font-bold text-destructive">
                Elimina definitivamente l'account
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Azione irreversibile.{" "}
                {userProfile?.role === "paziente"
                  ? "Verranno cancellati profilo, terapie, eventi, notifiche e collegamenti con i caregiver."
                  : "Verranno cancellati profilo, notifiche e collegamenti con i pazienti gestiti. I pazienti che gestivi in autonomia (senza account proprio) e non condivisi con altri caregiver verranno rimossi."}
              </p>
            </div>
          </div>
          <Button
            className="mt-3 w-full"
            variant="destructive"
            onClick={() => {
              setConfirmText("");
              setConfirmChecked(false);
              setConfirmOpen(true);
            }}
            disabled={deleting || exporting}
          >
            <Trash2 className="mr-2 size-4" />
            Elimina account
          </Button>
        </div>
      </div>

      <AlertDialog
        open={confirmOpen}
        onOpenChange={(open) => {
          if (deleting) return; // blocca chiusura durante l'operazione
          setConfirmOpen(open);
          if (!open) {
            setConfirmText("");
            setConfirmChecked(false);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confermi l'eliminazione?</AlertDialogTitle>
            <AlertDialogDescription>
              Questa azione è <b>irreversibile</b>. Tutti i tuoi dati verranno cancellati dal
              database e{" "}
              <b>tutte le sessioni attive su ogni dispositivo verranno revocate immediatamente</b>.
              <br />
              <br />
              Per confermare, completa entrambi i passaggi qui sotto.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="confirm-delete">
                1. Digita <b>{requiredWord}</b> per confermare
              </Label>
              <Input
                id="confirm-delete"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder={requiredWord}
                autoComplete="off"
                disabled={deleting}
              />
            </div>
            <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3">
              <Checkbox
                id="confirm-check"
                checked={confirmChecked}
                onCheckedChange={(v) => setConfirmChecked(v === true)}
                disabled={deleting}
                className="mt-0.5"
              />
              <Label
                htmlFor="confirm-check"
                className="text-xs font-normal leading-relaxed text-muted-foreground"
              >
                2. Ho compreso che questa operazione è <b>definitiva e irreversibile</b>: i miei
                dati saranno cancellati e verrò disconnesso da tutti i dispositivi.
              </Label>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Annulla</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting || confirmText.trim() !== requiredWord || !confirmChecked}
              onClick={(e) => {
                e.preventDefault();
                void handleDelete();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Eliminazione..." : "Elimina definitivamente"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}