import { useCallback, useEffect, useState } from "react";
import { Users, Pencil, Check, X } from "lucide-react";
import {
  listCaregiversForPatient,
  updateCaregiverRelationship,
  type PatientCaregiver,
} from "@/lib/supabase-service";
import { useFamilyMed } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export function CaregiversCard({
  patientId,
  primaryCaregiverId,
}: {
  patientId: string;
  primaryCaregiverId?: string | null;
}) {
  const { user } = useFamilyMed();
  const [caregivers, setCaregivers] = useState<PatientCaregiver[]>([]);
  const [loading, setLoading] = useState(true);

  // Stati per l'editing in-line
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setCaregivers(await listCaregiversForPatient(patientId, primaryCaregiverId));
    } finally {
      setLoading(false);
    }
  }, [patientId, primaryCaregiverId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleStartEdit = (c: PatientCaregiver) => {
    setEditValue(c.relationship || "");
    setIsEditing(true);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditValue("");
  };

  const handleSave = async (caregiverId: string) => {
    if (!user) return;
    setSaving(true);
    try {
      await updateCaregiverRelationship(caregiverId, patientId, editValue);
      toast.success("Relazione aggiornata con successo");
      setIsEditing(false);
      // Ricarica la lista per mostrare la relazione aggiornata
      await refresh();
    } catch (err: any) {
      toast.error("Errore durante l'aggiornamento", { description: err.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-3xl border border-border/60 bg-card p-6 shadow-card">
      <div className="flex items-center gap-3">
        <div className="grid size-10 place-items-center rounded-xl bg-primary-soft text-primary">
          <Users className="size-5" />
        </div>
        <div>
          <h2 className="text-lg font-black tracking-tight">Caregiver attivi</h2>
          <p className="text-xs text-muted-foreground">
            Chi segue questo paziente insieme a te.
          </p>
        </div>
      </div>

      <div className="mt-4">
        {loading && caregivers.length === 0 ? (
          <p className="text-sm text-muted-foreground">Caricamento…</p>
        ) : caregivers.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nessun caregiver collegato.</p>
        ) : (
          <ul className="divide-y divide-border/60 overflow-hidden rounded-2xl border border-border/60">
            {caregivers.map((c) => {
              const isCurrentUser = user && c.id === user.id;

              return (
                <li 
                  key={c.id} 
                  className={cn(
                    "flex items-center gap-3 p-3 transition-colors",
                    isCurrentUser ? "bg-primary-soft/20 border-y border-primary/5 first:border-t-0 last:border-b-0" : ""
                  )}
                >
                  <div className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-full bg-primary-soft font-bold text-primary">
                    {c.photo ? (
                      <img src={c.photo} alt="" className="size-full object-cover" />
                    ) : (
                      c.name.slice(0, 1).toUpperCase()
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold flex items-center gap-1.5">
                      {c.name}
                      {isCurrentUser && (
                        <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-primary">
                          Tu
                        </span>
                      )}
                    </p>
                    {isCurrentUser && isEditing ? (
                      <div className="mt-1 flex items-center gap-1.5">
                        <Input
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          placeholder="Es. Figlio, Coniuge..."
                          className="h-7 w-full max-w-[140px] rounded-lg px-2 py-1 text-xs"
                          autoFocus
                          disabled={saving}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleSave(c.id);
                            if (e.key === "Escape") handleCancel();
                          }}
                        />
                        <button
                          onClick={() => handleSave(c.id)}
                          disabled={saving}
                          className="rounded-lg p-1 text-success hover:bg-success/15 transition-colors disabled:opacity-50"
                          title="Salva"
                        >
                          <Check className="size-4" />
                        </button>
                        <button
                          onClick={handleCancel}
                          disabled={saving}
                          className="rounded-lg p-1 text-destructive hover:bg-destructive/15 transition-colors disabled:opacity-50"
                          title="Annulla"
                        >
                          <X className="size-4" />
                        </button>
                      </div>
                    ) : (
                      <div 
                        onClick={() => isCurrentUser && handleStartEdit(c)}
                        className={cn(
                          "flex items-center gap-1.5 group",
                          isCurrentUser ? "cursor-pointer hover:text-primary transition-colors" : ""
                        )}
                        title={isCurrentUser ? "Clicca per modificare la relazione" : undefined}
                      >
                        <p className={cn(
                          "truncate text-xs",
                          isCurrentUser 
                            ? "text-primary/95 font-medium border-b border-dashed border-primary/40 group-hover:border-primary/80 pb-0.5" 
                            : "text-muted-foreground"
                        )}>
                          {c.relationship || c.relation || (isCurrentUser ? "Aggiungi relazione..." : "Familiare")}
                        </p>
                        {isCurrentUser && (
                          <Pencil className="size-3 text-primary/75 group-hover:text-primary transition-colors shrink-0" />
                        )}
                      </div>
                    )}
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest",
                      c.isPrimary
                        ? "bg-primary-soft text-primary"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {c.isPrimary ? "Primario" : "Secondario"}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}