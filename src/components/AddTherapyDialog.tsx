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
  endDate: z.string().min(1, "Inserisci la data fine della terapia"),
  reminderBeforeMinutes: z.number().min(1).max(1440),
  timeoutMinutes: z.number().min(5).max(480),
  pillsPerPack: z.number().min(1),
  packs: z.number().min(1),
  lowStockThreshold: z.number().min(1),
  notes: z.string().min(1, "Inserisci una descrizione o istruzione"),
});

type FormValues = z.infer<typeof schema>;

interface AddTherapyDialogProps {
  trigger?: React.ReactNode;
  initialPatientId?: string;
  /** If provided, opens in edit mode pre-filled with this therapy */
  editTherapy?: Therapy;
  onClose?: () => void;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function AddTherapyDialog({ trigger, initialPatientId, editTherapy, onClose }: AddTherapyDialogProps) {
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
        reminderBeforeMinutes: Math.abs(editTherapy.reminderIntervals?.[0] ?? 10),
        timeoutMinutes: editTherapy.timeoutMinutes,
        pillsPerPack: editTherapy.pillsPerPack,
        packs: editTherapy.packs,
        lowStockThreshold: editTherapy.lowStockThreshold,
        notes: editTherapy.notes ?? "",
      }
    : {
        patientId: initialPatientId ?? data.patients[0]?.id ?? "",
        name: "",
        dosage: "",
        quantity: 1,
        category: "Cardiologia",
        times: [{ value: "08:00" }],
        recurrenceKind: "daily",
        startDate: todayIso(),
        endDate: "",
        reminderBeforeMinutes: 10,
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

  async function onSubmit(values: FormValues) {
    if (data.patients.length === 0) {
      toast.error("Nessun paziente assegnato", {
        description: "Prima collega o crea un paziente, poi assegna la terapia.",
      });
      return;
    }

    if (!photoDrug || !photoPackage) {
      toast.error("Foto terapia mancanti", {
        description: "Carica la foto del farmaco e della confezione.",
      });
      return;
    }

    const pillsRemaining = values.pillsPerPack * values.packs;
    const recurrence =
      values.recurrenceKind === "every_x_days"
        ? { kind: "every_x_days" as const, x: values.everyXDays ?? 2 }
        : { kind: values.recurrenceKind as "daily" | "weekdays" | "weekend" };

    try {
      if (isEdit && editTherapy) {
        await updateTherapy(editTherapy.id, {
          patientId: values.patientId,
          name: values.name,
          dosage: values.dosage,
          quantity: values.quantity,
          category: values.category,
          times: values.times.map((t) => t.value),
          recurrence,
          startDate: values.startDate,
          endDate: values.endDate,
          timeoutMinutes: values.timeoutMinutes,
          pillsPerPack: values.pillsPerPack,
          packs: values.packs,
          pillsRemaining,
          lowStockThreshold: values.lowStockThreshold,
          notes: values.notes.trim(),
          reminderIntervals: [values.reminderBeforeMinutes],
          photoDrug,
          photoPackage,
        });
        toast.success("Terapia aggiornata", { description: values.name });
      } else {
        await addTherapy({
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
          endDate: values.endDate,
          timeoutMinutes: values.timeoutMinutes,
          pillsPerPack: values.pillsPerPack,
          packs: values.packs,
          pillsRemaining,
          lowStockThreshold: values.lowStockThreshold,
          notes: values.notes.trim(),
          reminderIntervals: [values.reminderBeforeMinutes],
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
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Errore sconosciuto";
      console.error("[AddTherapyDialog] salvataggio fallito:", err);
      toast.error("Impossibile salvare la terapia", {
        description: msg.includes("row-level security")
          ? "Permessi mancanti: non risulti collegato a questo paziente. Vai in Pazienti e clicca Segui."
          : msg,
      });
    }
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
              {data.patients.length === 0 && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  Non hai ancora pazienti assegnati: collega un paziente prima di creare una terapia.
                </div>
              )}
              <FormField
                control={form.control}
                name="patientId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Paziente</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value} disabled={data.patients.length === 0}>
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
                <p className="text-sm font-medium text-foreground">Orari di assunzione</p>
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
                      <FormLabel>Avviso post se non confermata dopo</FormLabel>
                      <FormControl>
                        <Input
                          id="therapy-timeout-input"
                          type="number"
                          min={5}
                          max={480}
                          placeholder="60"
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
                  name="reminderBeforeMinutes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Avviso prima della dose</FormLabel>
                      <Select
                        onValueChange={(value) => field.onChange(Number(value))}
                        value={String(field.value)}
                      >
                        <FormControl>
                          <SelectTrigger id="therapy-reminder-before-select">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="5">5 minuti prima</SelectItem>
                          <SelectItem value="10">10 minuti prima</SelectItem>
                          <SelectItem value="15">15 minuti prima</SelectItem>
                          <SelectItem value="30">30 minuti prima</SelectItem>
                          <SelectItem value="60">1 ora prima</SelectItem>
                        </SelectContent>
                      </Select>
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
                    <FormLabel>Data fine terapia</FormLabel>
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

              {/* Foto farmaco + confezione */}
              <PhotoField
                label="Foto del farmaco (pastiglia)"
                value={photoDrug}
                onChange={setPhotoDrug}
                inputId="therapy-photo-drug"
              />
              <PhotoField
                label="Foto della confezione"
                value={photoPackage}
                onChange={setPhotoPackage}
                inputId="therapy-photo-package"
              />

              {/* Notes */}
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Descrizione e istruzioni</FormLabel>
                    <FormControl>
                      <Textarea
                        id="therapy-notes-input"
                        placeholder="es. Assumere dopo i pasti, non con il caffè..."
                        className="resize-none"
                        rows={3}
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
          <Button type="submit" form="therapy-form" id="save-therapy-btn" disabled={data.patients.length === 0}>
            {isEdit ? "Salva modifiche" : "Aggiungi terapia"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PhotoField({
  label,
  value,
  onChange,
  inputId,
}: {
  label: string;
  value?: string;
  onChange: (v: string | undefined) => void;
  inputId: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function handleFile(f: File | undefined) {
    if (!f) return;
    setBusy(true);
    try {
      const dataUrl = await fileToCompressedDataUrl(f);
      onChange(dataUrl);
    } catch (e) {
      toast.error("Impossibile caricare l'immagine", {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setBusy(false);
      if (ref.current) ref.current.value = "";
    }
  }

  return (
    <div>
      <p className="mb-2 text-sm font-medium text-foreground">{label}</p>
      <div className="flex items-center gap-3">
        {value ? (
          <div className="relative">
            <img
              src={value}
              alt={label}
              className="size-20 rounded-xl border border-border/60 object-cover"
            />
            <button
              type="button"
              onClick={() => onChange(undefined)}
              className="absolute -right-2 -top-2 grid size-6 place-items-center rounded-full bg-destructive text-white shadow"
              aria-label="Rimuovi immagine"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ) : (
          <div className="grid size-20 place-items-center rounded-xl border border-dashed border-border bg-surface-muted text-muted-foreground">
            <Camera className="size-6" />
          </div>
        )}
        <div className="flex-1">
          <input
            ref={ref}
            id={inputId}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => ref.current?.click()}
          >
            <Camera className="mr-1.5 size-3.5" />
            {busy ? "Elaborazione…" : value ? "Sostituisci" : "Scatta / carica"}
          </Button>
          <p className="mt-1.5 text-xs text-muted-foreground">
            JPG/PNG, ridimensionata a 800px per stare nel dispositivo.
          </p>
        </div>
      </div>
    </div>
  );
}
