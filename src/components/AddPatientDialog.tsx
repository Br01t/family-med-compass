import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useFamilyMed } from "@/lib/store";
import { getPlanLimits } from "@/lib/subscription";
import { UpgradeModal } from "@/components/UpgradeModal";
import { recordCaregiverAuthorization } from "@/lib/supabase-service";

const currentYear = new Date().getFullYear();

const schema = z.object({
  name: z.string().min(2, "Inserisci almeno 2 caratteri"),
  birthYear: z
    .number({ message: "Anno obbligatorio" })
    .int()
    .min(1900, "Anno non valido")
    .max(currentYear - 1, "Anno non valido"),
  assignToAllCaregivers: z.boolean(),
  authorizationDeclared: z.boolean().refine((v) => v === true, {
    message: "Devi confermare di avere titolo per inserire questi dati.",
  }),
});

type FormValues = z.infer<typeof schema>;

interface AddPatientDialogProps {
  /** Optional: rendered as trigger. Defaults to a "+ Aggiungi paziente" button. */
  trigger?: React.ReactNode;
}

export function AddPatientDialog({ trigger }: AddPatientDialogProps) {
  const [open, setOpen] = useState(false);
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
  const { data, addPatient, subscriptionPlan } = useFamilyMed();
  const limits = getPlanLimits(subscriptionPlan);

  const isLimitReached = data.patients.length >= limits.maxPatients;

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      birthYear: undefined,
      assignToAllCaregivers: false,
      authorizationDeclared: false,
    },
  });

  function handleTriggerClick(e: React.MouseEvent) {
    if (isLimitReached) {
      e.preventDefault();
      setUpgradeModalOpen(true);
    }
  }

  async function onSubmit(values: FormValues) {
    if (isLimitReached) {
      setOpen(false);
      setUpgradeModalOpen(true);
      return;
    }

    try {
      const id = `p_${crypto.randomUUID()}`;
      const caregiverIds: string[] = data.currentCaregiverId
        ? [data.currentCaregiverId]
        : [];

      const patientData = {
        id,
        name: values.name.trim(),
        birthYear: values.birthYear,
        caregiverIds,
        userId: undefined,
      };

      await addPatient(patientData);

      // Traccia la dichiarazione di autorizzazione (art. 7.1 GDPR — il
      // caregiver dichiara di avere titolo per trattare i dati sanitari
      // di questo specifico paziente). Non blocca il salvataggio del
      // paziente se fallisce: il paziente è già stato creato, l'utente
      // viene solo avvisato che la dichiarazione andrà registrata di nuovo.
      try {
        await recordCaregiverAuthorization(id);
      } catch (consentError) {
        console.error("[AddPatientDialog] Dichiarazione non registrata:", consentError);
        toast.warning("Paziente salvato, ma la dichiarazione non è stata registrata", {
          description: "Riprova dalle impostazioni del paziente, sezione Privacy.",
        });
      }

      toast.success("Paziente aggiunto", {
        description: `${values.name} è stato aggiunto ai tuoi pazienti.`,
      });
      form.reset();
      setOpen(false);
    } catch (error) {
      console.error("[AddPatientDialog] Errore durante il salvataggio:", error);
      toast.error("Impossibile salvare il paziente", {
        description:
          error instanceof Error ? error.message : "Riprova tra qualche secondo.",
      });
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => {
        if (v && isLimitReached) {
          setUpgradeModalOpen(true);
          return;
        }
        setOpen(v);
      }}>
        <DialogTrigger asChild onClick={handleTriggerClick}>
          {trigger ?? (
            <Button size="sm" id="add-patient-btn">
              <UserPlus className="mr-2 size-4" />
              Aggiungi paziente
            </Button>
          )}
        </DialogTrigger>

        <DialogContent className="w-full max-w-[calc(100vw-2rem)] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-black tracking-tight">
              Nuovo paziente
            </DialogTitle>
          </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="mt-2 space-y-5">
            {/* Nome */}
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome e cognome</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="es. Mario Rossi"
                      id="patient-name-input"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Anno di nascita */}
            <FormField
              control={form.control}
              name="birthYear"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Anno di nascita</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      placeholder={`es. ${currentYear - 75}`}
                      id="patient-birth-year-input"
                      {...field}
                      onChange={(e) =>
                        field.onChange(e.target.value ? Number(e.target.value) : undefined)
                      }
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="rounded-xl border border-border/60 bg-surface-muted p-3 text-xs text-muted-foreground">
              Il nuovo paziente verrà collegato al tuo account. Potrai gestirne
              terapie e scorte anche senza un account paziente separato.
            </div>

            {/* Dichiarazione di autorizzazione (art. 7.1 GDPR) — obbligatoria
                perché il caregiver sta per inserire dati sanitari (art. 9
                GDPR) di una persona diversa da sé stesso. */}
            <FormField
              control={form.control}
              name="authorizationDeclared"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start gap-3 rounded-xl border border-border/60 p-3">
                  <FormControl>
                    <Checkbox
                      id="patient-authorization-checkbox"
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <div className="space-y-1 leading-snug">
                    <FormLabel htmlFor="patient-authorization-checkbox" className="text-xs font-normal text-foreground">
                      Dichiaro di essere autorizzato — in quanto genitore, tutore
                      legale o su indicazione diretta dell'interessato — a
                      inserire e gestire in questa app i dati relativi alla
                      salute di <strong>{form.watch("name") || "questa persona"}</strong>.
                    </FormLabel>
                    <FormMessage />
                  </div>
                </FormItem>
              )}
            />

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                className="w-full sm:w-auto"
                onClick={() => {
                  form.reset();
                  setOpen(false);
                }}
              >
                Annulla
              </Button>
              <Button type="submit" id="save-patient-btn" className="w-full sm:w-auto">
                Salva paziente
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>

    <UpgradeModal
      open={upgradeModalOpen}
      onOpenChange={setUpgradeModalOpen}
      requiredPlan="pro"
      featureTitle="Limite Pazienti Raggiunto"
      featureDescription={`Il tuo piano attuale (${limits.name}) ti permette di gestire fino a ${limits.maxPatients} ${limits.maxPatients === 1 ? 'paziente' : 'pazienti'}. Passa a Pro o Max per gestirne di più.`}
    />
    </>
  );
}