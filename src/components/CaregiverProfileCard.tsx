import { useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, X, Loader2 } from "lucide-react";
import { useFamilyMed } from "@/lib/store";
import { fileToCompressedDataUrl } from "@/lib/image-utils";
import { ensureCaregiverAvatarPath, deleteCaregiverAvatarObject } from "@/lib/supabase-service";
import { PrivatePhotoImg } from "@/components/PrivatePhotoImg";
import { extractCaregiverAvatarPath } from "@/lib/caregiver-avatar-url";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { logger } from "@/lib/logger";

/**
 * Card "Il mio profilo" per i caregiver in Impostazioni: permette di
 * modificare nome, relazione con il paziente e foto — dati oggi visibili
 * agli altri caregiver collegati e al paziente stesso, ma senza alcun modo
 * di modificarli dopo la registrazione (gap trovato durante l'audit del
 * codice: la funzione supabase-service.saveCaregiverDoc esisteva già ma non
 * era collegata a nessuna UI).
 *
 * Sicurezza: la scrittura passa da store.updateCaregiverProfile, che scrive
 * solo sulla riga con id = auth.uid() (RLS "caregivers: self update" e
 * "profiles: self update", già in vigore) — un caregiver non può mai
 * modificare il profilo di qualcun altro, a prescindere da cosa fa questo
 * componente lato client.
 * Foto: caricata su bucket privato caregiver-avatars (Signed URL, RLS
 * dedicata — vedi supabase/migrations/20260919000000_caregiver_avatars_bucket.sql),
 * mai su URL pubblico.
 * Performance: singola scrittura per salvataggio (nome+relazione+foto in
 * un'unica chiamata a saveCaregiverDoc), foto compressa client-side prima
 * dell'upload (max 256px, JPEG ~q0.82 → tipicamente poche decine di KB),
 * vecchia foto ripulita dal bucket dopo la sostituzione (nessun file
 * orfano, stesso pattern già usato per le foto terapia).
 */
export function CaregiverProfileCard() {
  const { user, userProfile, data, updateCaregiverProfile } = useFamilyMed();
  const myCaregiver = data.caregivers.find((c) => c.id === user?.id);

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(userProfile?.name ?? "");
  const [relation, setRelation] = useState(myCaregiver?.relation ?? "");
  const [photo, setPhoto] = useState<string | undefined>(myCaregiver?.photo);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!user || !userProfile) return null;

  function startEditing() {
    setName(userProfile!.name ?? "");
    setRelation(myCaregiver?.relation ?? "");
    setPhoto(myCaregiver?.photo);
    setEditing(true);
  }

  async function handlePhotoPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // permette di riselezionare lo stesso file
    if (!file) return;
    try {
      const dataUrl = await fileToCompressedDataUrl(file, 256, 0.82);
      setPhoto(dataUrl);
    } catch (err) {
      logger.warn("[CaregiverProfileCard] compressione foto fallita", err);
      toast.error("Non è stato possibile leggere questa immagine");
    }
  }

  async function handleSave() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast.error("Il nome non può essere vuoto");
      return;
    }
    setSaving(true);
    const previousPhoto = myCaregiver?.photo;
    try {
      const resolvedPhoto = await ensureCaregiverAvatarPath(user!.id, photo);
      await updateCaregiverProfile({
        name: trimmedName,
        relation: relation.trim(),
        photo: resolvedPhoto ?? null,
      });
      // Pulizia della vecchia foto SOLO dopo che il salvataggio è andato a
      // buon fine: se qualcosa fosse fallito prima, la foto precedente
      // resta valida e collegata al profilo.
      if (previousPhoto && previousPhoto !== resolvedPhoto) {
        void deleteCaregiverAvatarObject(previousPhoto);
      }
      toast.success("Profilo aggiornato");
      setEditing(false);
    } catch (err) {
      logger.error("[CaregiverProfileCard] salvataggio profilo fallito", err);
      toast.error("Non è stato possibile salvare. Riprova tra poco.");
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <section className="rounded-3xl border border-border/60 bg-card p-4 shadow-card sm:p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-black tracking-tight">Il mio profilo</h2>
          <Button variant="outline" size="sm" onClick={startEditing}>
            Modifica
          </Button>
        </div>
        <div className="mt-4 flex items-center gap-4">
          <Avatar photo={myCaregiver?.photo} name={userProfile.name} />
          <div>
            <p className="font-bold">{userProfile.name}</p>
            {myCaregiver?.relation && (
              <p className="text-sm text-muted-foreground">{myCaregiver.relation}</p>
            )}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-3xl border border-border/60 bg-card p-4 shadow-card sm:p-6">
      <h2 className="text-lg font-black tracking-tight">Il mio profilo</h2>
      <div className="mt-4 space-y-4">
        <div className="flex justify-center">
          <div className="relative">
            <Avatar photo={photo} name={name || userProfile.name} size="lg" />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="absolute -bottom-1 -right-1 grid size-8 place-items-center rounded-full bg-primary text-primary-foreground shadow"
              aria-label="Cambia foto"
            >
              <Camera className="size-4" />
            </button>
            {photo && (
              <button
                type="button"
                onClick={() => setPhoto(undefined)}
                className="absolute -top-1 -right-1 grid size-6 place-items-center rounded-full bg-muted text-muted-foreground shadow"
                aria-label="Rimuovi foto"
              >
                <X className="size-3.5" />
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handlePhotoPick}
            />
          </div>
        </div>

        <div>
          <Label htmlFor="cg-name">Nome</Label>
          <Input
            id="cg-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1"
            maxLength={80}
          />
        </div>
        <div>
          <Label htmlFor="cg-relation">Relazione con il paziente</Label>
          <Input
            id="cg-relation"
            value={relation}
            onChange={(e) => setRelation(e.target.value)}
            placeholder="Es. Figlio/a, Coniuge, Amico/a…"
            className="mt-1"
            maxLength={60}
          />
        </div>

        <div className="flex gap-2 pt-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => setEditing(false)}
            disabled={saving}
          >
            Annulla
          </Button>
          <Button className="flex-1" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : "Salva"}
          </Button>
        </div>
      </div>
    </section>
  );
}

function Avatar({
  photo,
  name,
  size = "md",
}: {
  photo: string | undefined;
  name: string;
  size?: "md" | "lg";
}) {
  const dimension = size === "lg" ? "size-20" : "size-14";
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

  // Una foto appena scelta (non ancora caricata) è un dataURL: si mostra
  // direttamente. Una foto già salvata è un path del bucket privato: va
  // risolta in un Signed URL — PrivatePhotoImg se ne occupa da sé.
  if (photo?.startsWith("data:")) {
    return (
      <img
        src={photo}
        alt=""
        className={`${dimension} shrink-0 rounded-full border border-border/60 object-cover`}
      />
    );
  }
  const path = extractCaregiverAvatarPath(photo);
  if (path) {
    return (
      <PrivatePhotoImg
        bucket="caregiver-avatars"
        path={path}
        alt=""
        className={`${dimension} shrink-0 rounded-full border border-border/60 object-cover`}
      />
    );
  }
  return (
    <div
      className={`${dimension} grid shrink-0 place-items-center rounded-full bg-primary-soft text-sm font-bold text-primary`}
    >
      {initials || "?"}
    </div>
  );
}