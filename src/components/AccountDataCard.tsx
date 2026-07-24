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

/**
 * Card GDPR: esportazione dati (Data Portability) e cancellazione
 * definitiva dell'account (Diritto all'oblio).
 */
export function AccountDataCard() {
  const { logout, userProfile } = useFamilyMed();
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  async function handleExport() {
    if (!supabase) return;
    setExporting(true);
    try {
      const { data, error } = await supabase.rpc("export_my_data");
      if (error) throw error;
      const blob = new Blob([JSON.stringify(data, null, 2)], {
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

  async function handleDelete() {
    if (!supabase) return;
    setDeleting(true);
    try {
      const { error } = await supabase.rpc("delete_my_account");
      if (error) throw error;
      toast.success("Account eliminato definitivamente.");
      await logout();
      // Ricarico la pagina per pulire ogni stato residuo
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
        <h2 className="text-lg font-black tracking-tight">I tuoi dati (GDPR)</h2>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        Puoi scaricare una copia di tutti i dati collegati al tuo account, oppure
        richiedere l'eliminazione definitiva dell'account e dei dati correlati.
      </p>

      <div className="mt-4 space-y-3">
        <div className="rounded-2xl border border-border/50 p-4">
          <div className="flex items-start gap-3">
            <Download className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <div className="flex-1">
              <p className="text-sm font-bold">Esporta i miei dati</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Riceverai un file JSON con profilo, terapie, eventi, notifiche
                e link famiglia collegati al tuo account.
              </p>
            </div>
          </div>
          <Button
            className="mt-3 w-full"
            variant="outline"
            onClick={handleExport}
            disabled={exporting}
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
              setConfirmOpen(true);
            }}
            disabled={deleting}
          >
            <Trash2 className="mr-2 size-4" />
            Elimina account
          </Button>
        </div>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confermi l'eliminazione?</AlertDialogTitle>
            <AlertDialogDescription>
              Questa azione è <b>irreversibile</b>. Tutti i tuoi dati verranno
              cancellati dal database e non potranno essere recuperati.
              <br />
              <br />
              Per confermare, digita <b>{requiredWord}</b> qui sotto.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor="confirm-delete">Conferma</Label>
            <Input
              id="confirm-delete"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={requiredWord}
              autoComplete="off"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Annulla</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting || confirmText.trim() !== requiredWord}
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
