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

const currentYear = new Date().getFullYear();

const schema = z.object({
  name: z.string().min(2, "Inserisci almeno 2 caratteri"),
  birthYear: z
    .number({ message: "Anno obbligatorio" })
    .int()
    .min(1900, "Anno non valido")
    .max(currentYear - 1, "Anno non valido"),
  assignToAllCaregivers: z.boolean(),
});


type FormValues = z.infer<typeof schema>;

interface AddPatientDialogProps {
  /** Optional: rendered as trigger. Defaults to a "+ Aggiungi paziente" button. */
  trigger?: React.ReactNode;
}

export function AddPatientDialog({ trigger }: AddPatientDialogProps) {
  const [open, setOpen] = useState(false);
  const { data, addPatient } = useFamilyMed();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      birthYear: undefined,
      assignToAllCaregivers: false,
    },
  });

  async function onSubmit(values: FormValues) {
    try {
      const id = `p_${Date.now()}`;
      const caregiverIds: string[] = data.currentCaregiverId
        ? [data.currentCaregiverId]
        : [];

      const patientData = {
        id,
        name: values.name.trim(),
        birthYear: values.birthYear,
        caregiverIds,
        // Il paziente creato dal caregiver NON ha un userId (nessun account paziente collegato).
        userId: undefined,
      };

      await addPatient(patientData);

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
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" id="add-patient-btn">
            <UserPlus className="mr-2 size-4" />
            Aggiungi paziente
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
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


            <div className="flex justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  form.reset();
                  setOpen(false);
                }}
              >
                Annulla
              </Button>
              <Button type="submit" id="save-patient-btn">
                Salva paziente
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
