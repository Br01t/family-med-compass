import { useCallback, useEffect, useState } from "react";
import { Copy, KeyRound, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  createFamilyInvite,
  listFamilyInvites,
  revokeFamilyInvite,
  type FamilyInvite,
} from "@/lib/supabase-service";

function formatExpiry(iso: string): string {
  const d = new Date(iso);
  const diffMs = d.getTime() - Date.now();
  if (diffMs <= 0) return "scaduto";
  const mins = Math.round(diffMs / 60000);
  if (mins < 60) return `scade fra ${mins} min`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `scade fra ${hrs} h`;
  return `scade il ${d.toLocaleDateString("it-IT")}`;
}

export function FamilyInviteCard({ patientId }: { patientId: string }) {
  const [invites, setInvites] = useState<FamilyInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setInvites(await listFamilyInvites(patientId));
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleCreate() {
    setCreating(true);
    try {
      const inv = await createFamilyInvite(patientId, 1440, 1);
      toast.success("Codice generato", { description: inv.code });
      await refresh();
    } catch (e) {
      toast.error("Impossibile generare il codice", {
        description: e instanceof Error ? e.message : "Riprova.",
      });
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(id: string) {
    try {
      await revokeFamilyInvite(id);
      toast.success("Codice revocato");
      await refresh();
    } catch (e) {
      toast.error("Impossibile revocare", {
        description: e instanceof Error ? e.message : "Riprova.",
      });
    }
  }

  const active = invites.filter((i) => i.uses < i.maxUses && new Date(i.expiresAt) > new Date());

  return (
    <section className="rounded-3xl border border-border/60 bg-card p-6 shadow-card">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-xl bg-primary-soft text-primary">
            <KeyRound className="size-5" />
          </div>
          <div>
            <h2 className="text-lg font-black tracking-tight">Codici invito famiglia</h2>
            <p className="text-xs text-muted-foreground">
              Genera un codice e condividilo con un familiare che vuole seguirti. Vale 24 ore, un solo utilizzo.
            </p>
          </div>
        </div>
        <Button size="sm" onClick={handleCreate} disabled={creating}>
          {creating ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
          Genera codice
        </Button>
      </div>

      <div className="mt-4">
        {loading ? (
          <p className="text-sm text-muted-foreground">Caricamento…</p>
        ) : active.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nessun codice attivo.</p>
        ) : (
          <ul className="divide-y divide-border/60 overflow-hidden rounded-2xl border border-border/60">
            {active.map((inv) => (
              <li key={inv.id} className="flex items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="font-mono text-lg font-black tracking-widest">{inv.code}</p>
                  <p className="text-xs text-muted-foreground">{formatExpiry(inv.expiresAt)}</p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      navigator.clipboard.writeText(inv.code).then(
                        () => toast.success("Codice copiato"),
                        () => toast.error("Impossibile copiare"),
                      );
                    }}
                  >
                    <Copy className="mr-1 size-4" /> Copia
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleRevoke(inv.id)}>
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
