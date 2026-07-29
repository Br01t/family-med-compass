import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Loader2,
  Pencil,
  Phone,
  Plus,
  ShieldAlert,
  Stethoscope,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import {
  deleteMedicalProfile,
  fetchMedicalProfile,
  saveMedicalProfile,
  type EmergencyContact,
  type MedicalProfile,
} from "@/lib/supabase-service";

/* ============================================================
   CONSTANTS
============================================================ */

const BLOOD_TYPES = ["A+", "A-", "B+", "B-", "AB+", "AB-", "0+", "0-"] as const;

/* ============================================================
   HELPERS / SUB-COMPONENTS
============================================================ */

function SectionLabel({ icon: Icon, label, className }: {
  icon: React.ElementType;
  label: string;
  className?: string;
}) {
  return (
    <div className={cn("mb-2 flex items-center gap-2", className)}>
      <Icon className="size-4 shrink-0 opacity-70" />
      <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <p className="text-sm italic text-muted-foreground">{text}</p>
  );
}

/* ============================================================
   READ-ONLY VIEW
============================================================ */

function ProfileReadView({
  profile,
  isPrimary,
  onEdit,
  onDelete,
}: {
  profile: MedicalProfile;
  isPrimary: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const hasAllergies = profile.allergies.length > 0;
  const hasDiagnoses = !!(profile.diagnoses?.trim());
  const hasContacts = profile.emergencyContacts.length > 0;
  const hasNotes = !!(profile.notes?.trim());

  return (
    <div className="space-y-5">
      {/* Header actions */}
      {isPrimary && (
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onEdit} id="medical-profile-edit-btn">
            <Pencil className="mr-1.5 size-3.5" />
            Modifica
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="border-destructive/40 text-destructive hover:bg-destructive/10"
            onClick={onDelete}
            id="medical-profile-delete-btn"
          >
            <Trash2 className="mr-1.5 size-3.5" />
            Elimina scheda
          </Button>
        </div>
      )}

      {/* Dati anagrafici & Gruppo Sanguigno */}
      <div>
        <SectionLabel icon={UserRound} label="Dati anagrafici" />
        <div className="flex items-center gap-3">
          {profile.bloodType ? (
            <span className="inline-flex items-center gap-1.5 rounded-xl bg-primary/10 px-3 py-1.5 text-sm font-black text-primary ring-1 ring-primary/20">
              🩸 Gruppo {profile.bloodType}
            </span>
          ) : (
            <EmptyState text="Gruppo sanguigno non registrato" />
          )}
        </div>
      </div>

      <div className="h-px bg-border/60" />

      {/* Allergie & Intolleranze */}
      <div>
        <SectionLabel
          icon={ShieldAlert}
          label="Allergie & Intolleranze Farmacologiche"
          className={hasAllergies ? "text-destructive" : undefined}
        />
        {hasAllergies ? (
          <div className="flex flex-wrap gap-2">
            {profile.allergies.map((a, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 rounded-lg bg-destructive/10 px-2.5 py-1 text-xs font-bold text-destructive ring-1 ring-destructive/30"
              >
                <AlertTriangle className="size-3 shrink-0" />
                {a}
              </span>
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-xl bg-success/10 px-3 py-2 text-sm font-medium text-success ring-1 ring-success/20">
            <CheckCircle2 className="size-4 shrink-0" />
            Nessuna allergia nota
          </div>
        )}
      </div>

      <div className="h-px bg-border/60" />

      {/* Contatti Emergenza */}
      <div>
        <SectionLabel icon={Phone} label="Contatti Emergenza" />
        {hasContacts ? (
          <ul className="space-y-2">
            {profile.emergencyContacts.map((c, i) => (
              <li
                key={i}
                className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-card px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold">{c.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{c.role}</p>
                </div>
                <a
                  href={`tel:${c.phone.replace(/\s/g, "")}`}
                  className="flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground transition-opacity hover:opacity-90 active:scale-95"
                  id={`call-btn-${i}`}
                  aria-label={`Chiama ${c.name}`}
                >
                  <Phone className="size-3.5" />
                  {c.phone}
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState text="Nessun contatto di emergenza registrato" />
        )}
      </div>

      <div className="h-px bg-border/60" />

      {/* Note diagnostiche / Patologie */}
      <div>
        <SectionLabel icon={Stethoscope} label="Note Diagnostiche / Patologie" />
        {hasDiagnoses ? (
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{profile.diagnoses}</p>
        ) : (
          <div className="flex items-center gap-2 rounded-xl bg-muted/60 px-3 py-2 text-sm text-muted-foreground ring-1 ring-border/60">
            <ClipboardList className="size-4 shrink-0" />
            Nessuna patologia registrata
          </div>
        )}
      </div>

      {/* Note aggiuntive */}
      {hasNotes && (
        <>
          <div className="h-px bg-border/60" />
          <div>
            <SectionLabel icon={ClipboardList} label="Note aggiuntive" />
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
              {profile.notes}
            </p>
          </div>
        </>
      )}

      {/* Ultima modifica */}
      {profile.updatedAt && (
        <p className="mt-1 text-right text-[11px] text-muted-foreground/60">
          Aggiornata il{" "}
          {new Date(profile.updatedAt).toLocaleDateString("it-IT", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        </p>
      )}
    </div>
  );
}

/* ============================================================
   EDIT FORM
============================================================ */

type FormState = {
  bloodType: string;
  allergyInput: string;
  allergies: string[];
  diagnoses: string;
  notes: string;
  emergencyContacts: EmergencyContact[];
};

function buildForm(profile: MedicalProfile | null): FormState {
  return {
    bloodType: profile?.bloodType ?? "",
    allergyInput: "",
    allergies: profile?.allergies ?? [],
    diagnoses: profile?.diagnoses ?? "",
    notes: profile?.notes ?? "",
    emergencyContacts:
      profile?.emergencyContacts.length
        ? profile.emergencyContacts
        : [{ name: "", role: "", phone: "" }],
  };
}

function ProfileEditForm({
  patientId,
  initial,
  onSaved,
  onCancel,
}: {
  patientId: string;
  initial: MedicalProfile | null;
  onSaved: (profile: MedicalProfile) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<FormState>(() => buildForm(initial));
  const [saving, setSaving] = useState(false);
  const allergyInputRef = useRef<HTMLInputElement>(null);

  /* ---- helpers ---- */
  const setField = <K extends keyof FormState>(key: K, val: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: val }));

  const addAllergy = () => {
    const val = form.allergyInput.trim();
    if (!val) return;
    if (form.allergies.includes(val)) {
      toast.warning("Allergia già presente");
      return;
    }
    setForm((f) => ({ ...f, allergies: [...f.allergies, val], allergyInput: "" }));
    allergyInputRef.current?.focus();
  };

  const removeAllergy = (idx: number) =>
    setForm((f) => ({ ...f, allergies: f.allergies.filter((_, i) => i !== idx) }));

  const updateContact = (idx: number, field: keyof EmergencyContact, val: string) =>
    setForm((f) => {
      const contacts = [...f.emergencyContacts];
      contacts[idx] = { ...contacts[idx], [field]: val };
      return { ...f, emergencyContacts: contacts };
    });

  const addContact = () =>
    setForm((f) => ({
      ...f,
      emergencyContacts: [...f.emergencyContacts, { name: "", role: "", phone: "" }],
    }));

  const removeContact = (idx: number) =>
    setForm((f) => ({
      ...f,
      emergencyContacts: f.emergencyContacts.filter((_, i) => i !== idx),
    }));

  /* ---- submit ---- */
  const handleSave = async () => {
    const cleanContacts = form.emergencyContacts.filter((c) => c.name.trim() || c.phone.trim());
    setSaving(true);
    const { error } = await saveMedicalProfile(patientId, {
      bloodType: form.bloodType || null,
      allergies: form.allergies,
      diagnoses: form.diagnoses.trim() || null,
      emergencyContacts: cleanContacts,
      notes: form.notes.trim() || null,
    });
    setSaving(false);
    if (error) {
      toast.error("Errore nel salvataggio", { description: error });
      return;
    }
    toast.success("Scheda medica salvata");
    // Ricostruisce l'oggetto locale per aggiornare l'UI senza un secondo fetch
    onSaved({
      patientId,
      bloodType: form.bloodType || null,
      allergies: form.allergies,
      diagnoses: form.diagnoses.trim() || null,
      emergencyContacts: cleanContacts,
      notes: form.notes.trim() || null,
      updatedAt: new Date().toISOString(),
      updatedBy: null,
    });
  };

  return (
    <div className="space-y-6">
      {/* Gruppo sanguigno */}
      <div>
        <label className="mb-2 block text-xs font-bold uppercase tracking-widest text-muted-foreground">
          Gruppo Sanguigno
        </label>
        <div className="flex flex-wrap gap-2">
          {BLOOD_TYPES.map((bt) => (
            <button
              key={bt}
              type="button"
              onClick={() => setField("bloodType", form.bloodType === bt ? "" : bt)}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-sm font-bold transition-colors",
                form.bloodType === bt
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background hover:border-primary/60",
              )}
            >
              {bt}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setField("bloodType", "")}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-sm transition-colors",
              !form.bloodType
                ? "border-muted-foreground bg-muted text-muted-foreground"
                : "border-border bg-background hover:border-muted-foreground/60",
            )}
          >
            Non noto
          </button>
        </div>
      </div>

      {/* Allergie */}
      <div>
        <label className="mb-2 block text-xs font-bold uppercase tracking-widest text-destructive">
          Allergie & Intolleranze Farmacologiche
        </label>
        <div className="flex gap-2">
          <Input
            ref={allergyInputRef}
            id="allergy-input"
            placeholder="es. Penicillina, Aspirina…"
            value={form.allergyInput}
            onChange={(e) => setField("allergyInput", e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addAllergy())}
            className="border-destructive/30 focus-visible:ring-destructive/40"
          />
          <Button type="button" variant="outline" size="sm" onClick={addAllergy} className="shrink-0">
            <Plus className="size-4" />
          </Button>
        </div>
        {form.allergies.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {form.allergies.map((a, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 rounded-lg bg-destructive/10 px-2.5 py-1 text-xs font-bold text-destructive ring-1 ring-destructive/30"
              >
                {a}
                <button
                  type="button"
                  onClick={() => removeAllergy(i)}
                  className="ml-0.5 rounded-full p-0.5 hover:bg-destructive/20"
                  aria-label={`Rimuovi ${a}`}
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
          </div>
        )}
        <p className="mt-1.5 text-xs text-muted-foreground">
          Lascia vuoto se il paziente non ha allergie note.
        </p>
      </div>

      {/* Contatti emergenza */}
      <div>
        <label className="mb-2 block text-xs font-bold uppercase tracking-widest text-muted-foreground">
          Contatti Emergenza
        </label>
        <div className="space-y-3">
          {form.emergencyContacts.map((c, i) => (
            <div
              key={i}
              className="relative rounded-xl border border-border/60 bg-muted/30 p-3"
            >
              {form.emergencyContacts.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeContact(i)}
                  className="absolute right-2 top-2 rounded-full p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  aria-label="Rimuovi contatto"
                >
                  <X className="size-3.5" />
                </button>
              )}
              <div className="grid gap-2 sm:grid-cols-3">
                <Input
                  placeholder="Nome"
                  value={c.name}
                  onChange={(e) => updateContact(i, "name", e.target.value)}
                  className="text-sm"
                />
                <Input
                  placeholder="Ruolo (es. Medico di Base)"
                  value={c.role}
                  onChange={(e) => updateContact(i, "role", e.target.value)}
                  className="text-sm"
                />
                <Input
                  placeholder="Telefono"
                  type="tel"
                  value={c.phone}
                  onChange={(e) => updateContact(i, "phone", e.target.value)}
                  className="text-sm"
                />
              </div>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addContact}
            className="w-full"
            id="add-contact-btn"
          >
            <Plus className="mr-1.5 size-3.5" />
            Aggiungi contatto
          </Button>
        </div>
      </div>

      {/* Note diagnostiche */}
      <div>
        <label
          htmlFor="diagnoses-textarea"
          className="mb-2 block text-xs font-bold uppercase tracking-widest text-muted-foreground"
        >
          Note Diagnostiche / Patologie
        </label>
        <textarea
          id="diagnoses-textarea"
          rows={4}
          placeholder="es. Ipertensione arteriosa, Diabete Tipo 2…&#10;Lascia vuoto se non ci sono patologie note."
          value={form.diagnoses}
          onChange={(e) => setField("diagnoses", e.target.value)}
          className="w-full resize-none rounded-xl border border-input bg-background px-3 py-2 text-sm leading-relaxed ring-offset-background placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      {/* Note aggiuntive */}
      <div>
        <label
          htmlFor="notes-textarea"
          className="mb-2 block text-xs font-bold uppercase tracking-widest text-muted-foreground"
        >
          Note aggiuntive (opzionale)
        </label>
        <textarea
          id="notes-textarea"
          rows={3}
          placeholder="Qualsiasi altra informazione utile in caso di necessità..."
          value={form.notes}
          onChange={(e) => setField("notes", e.target.value)}
          className="w-full resize-none rounded-xl border border-input bg-background px-3 py-2 text-sm leading-relaxed ring-offset-background placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2 border-t border-border/60 pt-4">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>
          Annulla
        </Button>
        <Button type="button" onClick={handleSave} disabled={saving} id="medical-profile-save-btn">
          {saving ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              Salvataggio…
            </>
          ) : (
            "Salva scheda"
          )}
        </Button>
      </div>
    </div>
  );
}

/* ============================================================
   MAIN EXPORTED COMPONENT
============================================================ */

export function MedicalProfileCard({
  patientId,
  isPrimary,
}: {
  patientId: string;
  isPrimary: boolean;
}) {
  const [profile, setProfile] = useState<MedicalProfile | null | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  /* ---- Fetch one-shot ---- */
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchMedicalProfile(patientId).then((p) => {
      if (!cancelled) {
        setProfile(p);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [patientId]);

  /* ---- Handlers ---- */
  const handleSaved = (updated: MedicalProfile) => {
    setProfile(updated);
    setEditing(false);
    setExpanded(true);
  };

  const handleDeleteConfirm = async () => {
    setDeleting(true);
    const { error } = await deleteMedicalProfile(patientId);
    setDeleting(false);
    setConfirmDelete(false);
    if (error) {
      toast.error("Errore durante l'eliminazione", { description: error });
      return;
    }
    setProfile(null);
    setEditing(false);
    toast.success("Scheda medica eliminata");
  };

  /* ---- Render ---- */
  const hasProfile = !!profile;
  const isEmptyAndReadOnly = !hasProfile && !isPrimary;

  return (
    <div
      id="emergency-medical-card"
      className="rounded-3xl border border-border/60 bg-card shadow-card"
    >
      {/* ---- Card header ---- */}
      <button
        type="button"
        onClick={() => !editing && setExpanded((v) => !v)}
        className="flex w-full items-center gap-4 p-6 text-left"
        aria-expanded={expanded}
        aria-controls="medical-profile-body"
      >
        <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-red-500/10 text-red-500">
          <ShieldAlert className="size-6" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-black tracking-tight">Scheda Medica e Contatti di Emergenza</h3>
          <p className="text-sm text-muted-foreground">
            {loading
              ? "Caricamento…"
              : hasProfile
              ? "Dati anagrafici, allergie, contatti e patologie"
              : isPrimary
              ? "Nessuna scheda compilata — clicca per compilare"
              : "Nessuna scheda compilata"}
          </p>
        </div>
        {!isEmptyAndReadOnly && (
          <div className="shrink-0 text-muted-foreground">
            {expanded ? <ChevronUp className="size-5" /> : <ChevronDown className="size-5" />}
          </div>
        )}
      </button>

      {/* ---- Card body ---- */}
      <div id="medical-profile-body" className={cn(!expanded && "hidden")}>
        <div className="border-t border-border/60 px-6 pb-6 pt-5">
          {/* Loading */}
          {loading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Caricamento scheda…
            </div>
          )}

          {/* Empty + primario → mostra subito il form */}
          {!loading && !hasProfile && isPrimary && !editing && (
            <div className="space-y-4">
              <div className="rounded-xl bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400 ring-1 ring-amber-500/20">
                <p className="font-semibold">Scheda non ancora compilata</p>
                <p className="mt-0.5 text-xs">
                  Compila la scheda con i dati clinici essenziali da tenere a portata di mano in caso di necessità.
                </p>
              </div>
              <Button
                onClick={() => setEditing(true)}
                id="create-medical-profile-btn"
                className="w-full"
              >
                <Plus className="mr-2 size-4" />
                Compila scheda di emergenza
              </Button>
            </div>
          )}

          {/* Empty + non primario */}
          {!loading && !hasProfile && !isPrimary && (
            <p className="text-sm text-muted-foreground">
              La scheda medica di emergenza non è ancora stata compilata dal caregiver primario.
            </p>
          )}

          {/* Read view */}
          {!loading && hasProfile && !editing && (
            <ProfileReadView
              profile={profile!}
              isPrimary={isPrimary}
              onEdit={() => setEditing(true)}
              onDelete={() => setConfirmDelete(true)}
            />
          )}

          {/* Edit form */}
          {!loading && editing && (
            <ProfileEditForm
              patientId={patientId}
              initial={profile ?? null}
              onSaved={handleSaved}
              onCancel={() => setEditing(false)}
            />
          )}
        </div>
      </div>

      {/* ---- Delete confirm dialog ---- */}
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Elimina scheda medica?</AlertDialogTitle>
            <AlertDialogDescription>
              Tutti i dati anagrafici, i contatti di emergenza, le allergie e le note diagnostiche
              verranno eliminati definitivamente. Questa operazione non può essere annullata.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              id="confirm-delete-medical-profile-btn"
            >
              {deleting ? (
                <><Loader2 className="mr-2 size-4 animate-spin" /> Eliminazione…</>
              ) : (
                "Sì, elimina"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
