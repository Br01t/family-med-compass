import { Info } from "lucide-react";

type Context = "terapie" | "scorte";

export function SecondaryCaregiverNotice({ context }: { context: Context }) {
  const isTerapie = context === "terapie";
  return (
    <div className="rounded-2xl border border-primary/20 bg-primary-soft/60 p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          <Info className="size-4" />
        </div>
        <div className="min-w-0 text-sm">
          <p className="font-bold text-primary">Sei un caregiver secondario</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Puoi <b>visualizzare</b>
            {isTerapie
              ? " le terapie, gli orari e lo storico delle dosi, e puoi confermare o rimandare le assunzioni al posto del paziente."
              : " le scorte e l'autonomia residua di ogni farmaco, e ricevere gli avvisi di scorta bassa."}
          </p>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            <b>Non puoi</b>{" "}
            {isTerapie
              ? "aggiungere, modificare, sospendere o eliminare terapie: queste azioni sono riservate al caregiver primario (chi ha creato il profilo del paziente o il primo che si è collegato tramite codice invito)."
              : "aggiungere confezioni o modificare manualmente le scorte: solo il caregiver primario può gestire l'inventario. Le scorte si aggiornano comunque automaticamente ad ogni dose confermata."}
          </p>
        </div>
      </div>
    </div>
  );
}
