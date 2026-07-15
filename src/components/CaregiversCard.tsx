import { useCallback, useEffect, useState } from "react";
import { Users } from "lucide-react";
import {
  listCaregiversForPatient,
  type PatientCaregiver,
} from "@/lib/supabase-service";
import { cn } from "@/lib/utils";

function formatLinkedSince(iso: string): string {
  const d = new Date(iso);
  return `dal ${d.toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" })}`;
}

export function CaregiversCard({
  patientId,
  primaryCaregiverId,
}: {
  patientId: string;
  primaryCaregiverId?: string | null;
}) {
  const [caregivers, setCaregivers] = useState<PatientCaregiver[]>([]);
  const [loading, setLoading] = useState(true);

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
        {loading ? (
          <p className="text-sm text-muted-foreground">Caricamento…</p>
        ) : caregivers.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nessun caregiver collegato.</p>
        ) : (
          <ul className="divide-y divide-border/60 overflow-hidden rounded-2xl border border-border/60">
            {caregivers.map((c) => (
              <li key={c.id} className="flex items-center gap-3 p-3">
                <div className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-full bg-primary-soft font-bold text-primary">
                  {c.photo ? (
                    <img src={c.photo} alt="" className="size-full object-cover" />
                  ) : (
                    c.name.slice(0, 1).toUpperCase()
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{c.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {c.relation || c.relationship || "Familiare"} · {formatLinkedSince(c.linkedAt)}
                  </p>
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
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}