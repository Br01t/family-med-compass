import { useEffect, useRef, useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Camera, Plus, Trash2, PillIcon, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { fileToCompressedDataUrl } from "@/lib/image-utils";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useFamilyMed } from "@/lib/store";
import type { Therapy } from "@/lib/mock-data";
import { ScrollArea } from "@/components/ui/scroll-area";

const CATEGORIES = [
  "Cardiologia",
  "Diabete",
  "Gastro",
  "Integratori",
  "Tiroide",
  "Neurologia",
  "Reumatologia",
  "Altro",
];

const RECURRENCE_OPTIONS = [
  { value: "daily", label: "Ogni giorno" },
  { value: "weekdays", label: "Giorni feriali (lun-ven)" },
  { value: "weekend", label: "Fine settimana (sab-dom)" },
  { value: "every_x_days", label: "Ogni X giorni" },
];

const schema = z.object({
  patientId: z.string().min(1, "Seleziona un paziente"),
  name: z.string().min(2, "Nome farmaco obbligatorio"),
  dosage: z.string().min(1, "Inserisci il dosaggio (es. 100mg)"),
  quantity: z.number({ invalid_type_error: "Quantità obbligatoria" }).min(1).max(20),
  category: z.string().min(1, "Seleziona una categoria"),
  times: z.array(z.object({ value: z.string().regex(/^\d{2}:\d{2}$/, "Formato HH:MM") })).min(1, "Aggiungi almeno un orario"),
  recurrenceKind: z.enum(["daily", "weekdays", "weekend", "every_x_days"]),
  everyXDays: z.number().optional(),
  startDate: z.string().min(1, "Data inizio obbligatoria"),
  endDate: z.string().optional(),
  timeoutMinutes: z.number().min(5).max(480),
  pillsPerPack: z.number().min(1),
  packs: z.number().min(1),
  lowStockThreshold: z.number().min(1),
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

interface AddTherapyDialogProps {
  trigger?: React.ReactNode;
  /** If provided, opens in edit mode pre-filled with this therapy */
  editTherapy?: Therapy;
  onClose?: () => void;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function AddTherapyDialog({ trigger, editTherapy, onClose }: AddTherapyDialogProps) {
  const [open, setOpen] = useState(false);
  const { data, addTherapy, updateTherapy } = useFamilyMed();
  const isEdit = Boolean(editTherapy);
  const [photoDrug, setPhotoDrug] = useState<string | undefined>(editTherapy?.photoDrug);
  const [photoPackage, setPhotoPackage] = useState<string | undefined>(editTherapy?.photoPackage);

  const defaultValues: FormValues = editTherapy
    ? {
        patientId: editTherapy.patientId,
        name: editTherapy.name,
        dosage: editTherapy.dosage,
        quantity: editTherapy.quantity,
        category: editTherapy.category,
        times: editTherapy.times.map((t) => ({ value: t })),
        recurrenceKind:
          editTherapy.recurrence.kind === "every_x_days" ||
          editTherapy.recurrence.kind === "specific_days"
            ? "every_x_days"
            : (editTherapy.recurrence.kind as "daily" | "weekdays" | "weekend"),
        everyXDays:
          editTherapy.recurrence.kind === "every_x_days"
            ? editTherapy.recurrence.x
            : undefined,
        startDate: editTherapy.startDate,
        endDate: editTherapy.endDate ?? "",
        timeoutMinutes: editTherapy.timeoutMinutes,
        pillsPerPack: editTherapy.pillsPerPack,
        packs: editTherapy.packs,
        lowStockThreshold: editTherapy.lowStockThreshold,
        notes: editTherapy.notes ?? "",
      }
    : {
        patientId: data.patients[0]?.id ?? "",
        name: "",
        dosage: "",
        quantity: 1,
        category: "Cardiologia",
        times: [{ value: "08:00" }],
        recurrenceKind: "daily",
        startDate: todayIso(),
        endDate: "",
        timeoutMinutes: 60,
        pillsPerPack: 30,
        packs: 1,
        lowStockThreshold: 10,
        notes: "",
      };

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues,
  });

  const { fields: timeFields, append: appendTime, remove: removeTime } = useFieldArray({
    control: form.control,
    name: "times",
  });

  const recurrenceKind = form.watch("recurrenceKind");

  // Reset form when editTherapy changes
  useEffect(() => {
    if (open) {
      form.reset(defaultValues);
      setPhotoDrug(editTherapy?.photoDrug);
      setPhotoPackage(editTherapy?.photoPackage);
    }
  }, [open]);

  function onSubmit(values: FormValues) {
    const pillsRemaining = values.pillsPerPack * values.packs;
    const recurrence =
      values.recurrenceKind === "every_x_days"
        ? { kind: "every_x_days" as const, x: values.everyXDays ?? 2 }
        : { kind: values.recurrenceKind as "daily" | "weekdays" | "weekend" };

    if (isEdit && editTherapy) {
      updateTherapy(editTherapy.id, {
        patientId: values.patientId,
        name: values.name,
        dosage: values.dosage,
        quantity: values.quantity,
        category: values.category,
        times: values.times.map((t) => t.value),
        recurrence,
        startDate: values.startDate,
        endDate: values.endDate || undefined,
        timeoutMinutes: values.timeoutMinutes,
        pillsPerPack: values.pillsPerPack,
        packs: values.packs,
        pillsRemaining,
        lowStockThreshold: values.lowStockThreshold,
        notes: values.notes || undefined,
        reminderIntervals: [15, 30],
        photoDrug,
        photoPackage,
      });
      toast.success("Terapia aggiornata", { description: values.name });
    } else {
      addTherapy({
        id: `t_${Date.now()}`,
        patientId: values.patientId,
        name: values.name,
        dosage: values.dosage,
        quantity: values.quantity,
        category: values.category,
        color: "primary",
        icon: "pill",
        times: values.times.map((t) => t.value),
        recurrence,
        startDate: values.startDate,
        endDate: values.endDate || undefined,
        timeoutMinutes: values.timeoutMinutes,
        pillsPerPack: values.pillsPerPack,
        packs: values.packs,
        pillsRemaining,
        lowStockThreshold: values.lowStockThreshold,
        notes: values.notes || undefined,
        reminderIntervals: [15, 30],
        active: true,
        suspended: false,
        photoDrug,
        photoPackage,
      });
      toast.success("Terapia aggiunta", { description: values.name });
    }

    form.reset();
    setOpen(false);
    onClose?.();
  }

  const handleOpenChange = (v: boolean) => {
    setOpen(v);
    if (!v) onClose?.();
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" id="add-therapy-btn">
            <PillIcon className="mr-2 size-4" />
            {isEdit ? "Modifica terapia" : "Nuova terapia"}
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="flex flex-col sm:max-w-2xl max-h-[90vh]">
        <DialogHeader className="shrink-0">
          <DialogTitle className="text-xl font-black tracking-tight">
            {isEdit ? `Modifica: ${editTherapy?.name}` : "Nuova terapia"}
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 overflow-auto pr-3">
          <Form {...form}>
            <form
              id="therapy-form"
              onSubmit={form.handleSubmit(onSubmit)}
              className="mt-2 space-y-5 pb-4"
            >
              {/* Patient */}
              <FormField
                control={form.control}
                name="patientId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Paziente</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger id="therapy-patient-select">
                          <SelectValue placeholder="Seleziona paziente" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {data.patients.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Name + Dosage */}
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nome farmaco</FormLabel>
                      <FormControl>
                        <Input id="therapy-name-input" placeholder="es. Cardioaspirina" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="dosage"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Dosaggio</FormLabel>
                      <FormControl>
                        <Input id="therapy-dosage-input" placeholder="es. 100mg" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Category + Quantity */}
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Categoria</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger id="therapy-category-select">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {CATEGORIES.map((c) => (
                            <SelectItem key={c} value={c}>
                              {c}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="quantity"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Unità per dose</FormLabel>
                      <FormControl>
                        <Input
                          id="therapy-quantity-input"
                          type="number"
                          min={1}
                          max={20}
                          {...field}
                          onChange={(e) => field.onChange(Number(e.target.value))}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Times */}
              <FormItem>
                <FormLabel>Orari di assunzione</FormLabel>
                <div className="space-y-2">
                  {timeFields.map((timeField, index) => (
                    <div key={timeField.id} className="flex items-center gap-2">
                      <FormField
                        control={form.control}
                        name={`times.${index}.value`}
                        render={({ field }) => (
                          <FormItem className="flex-1">
                            <FormControl>
                              <Input
                                id={`therapy-time-${index}`}
                                type="time"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      {timeFields.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="shrink-0 text-muted-foreground hover:text-destructive"
                          onClick={() => removeTime(index)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => appendTime({ value: "12:00" })}
                    id="add-time-btn"
                  >
                    <Plus className="mr-1.5 size-3.5" /> Aggiungi orario
                  </Button>
                </div>
              </FormItem>

              {/* Recurrence */}
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="recurrenceKind"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Ricorrenza</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger id="therapy-recurrence-select">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {RECURRENCE_OPTIONS.map((r) => (
                            <SelectItem key={r.value} value={r.value}>
                              {r.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {recurrenceKind === "every_x_days" && (
                  <FormField
                    control={form.control}
                    name="everyXDays"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Ogni quanti giorni</FormLabel>
                        <FormControl>
                          <Input
                            id="therapy-every-x-days-input"
                            type="number"
                            min={2}
                            max={365}
                            placeholder="2"
                            {...field}
                            onChange={(e) => field.onChange(Number(e.target.value))}
                            value={field.value ?? ""}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                <FormField
                  control={form.control}
                  name="timeoutMinutes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Timeout (minuti)</FormLabel>
                      <FormControl>
                        <Input
                          id="therapy-timeout-input"
                          type="number"
                          min={5}
                          max={480}
                          {...field}
                          onChange={(e) => field.onChange(Number(e.target.value))}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="startDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Data inizio</FormLabel>
                      <FormControl>
                        <Input id="therapy-start-date-input" type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="endDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Data fine (opzionale)</FormLabel>
                      <FormControl>
                        <Input id="therapy-end-date-input" type="date" {...field} value={field.value ?? ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Stock */}
              <div className="rounded-xl border border-border/60 bg-surface-muted p-4">
                <p className="mb-3 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Scorte
                </p>
                <div className="grid grid-cols-3 gap-3">
                  <FormField
                    control={form.control}
                    name="pillsPerPack"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Pillole/confezione</FormLabel>
                        <FormControl>
                          <Input
                            id="therapy-pills-per-pack-input"
                            type="number"
                            min={1}
                            {...field}
                            onChange={(e) => field.onChange(Number(e.target.value))}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="packs"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>N° confezioni</FormLabel>
                        <FormControl>
                          <Input
                            id="therapy-packs-input"
                            type="number"
                            min={1}
                            {...field}
                            onChange={(e) => field.onChange(Number(e.target.value))}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="lowStockThreshold"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Soglia allerta</FormLabel>
                        <FormControl>
                          <Input
                            id="therapy-low-stock-input"
                            type="number"
                            min={1}
                            {...field}
                            onChange={(e) => field.onChange(Number(e.target.value))}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              {/* Notes */}
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Note (opzionale)</FormLabel>
                    <FormControl>
                      <Textarea
                        id="therapy-notes-input"
                        placeholder="es. Assumere dopo i pasti, non con il caffè..."
                        className="resize-none"
                        rows={2}
                        {...field}
                        value={field.value ?? ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </form>
          </Form>
        </ScrollArea>

        {/* Footer actions outside scroll */}
        <div className="mt-4 flex shrink-0 justify-end gap-3 border-t border-border/60 pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
          >
            Annulla
          </Button>
          <Button type="submit" form="therapy-form" id="save-therapy-btn">
            {isEdit ? "Salva modifiche" : "Aggiungi terapia"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
