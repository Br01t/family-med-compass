import type {
  DoseStatus,
  FamilyMedData,
  MedicationEvent,
  Recurrence,
  Therapy,
} from "./mock-data";

export type ScheduledDose = {
  id: string; // stable id (therapyId + iso)
  therapy: Therapy;
  scheduledAt: Date;
  event?: MedicationEvent;
  status: DoseStatus;
};

function scheduledOnDate(recurrence: Recurrence, date: Date, startIso: string): boolean {
  const start = new Date(startIso + "T00:00:00");
  if (date < start) return false;
  const dow = date.getDay();
  switch (recurrence.kind) {
    case "daily":
      return true;
    case "weekdays":
      return dow >= 1 && dow <= 5;
    case "weekend":
      return dow === 0 || dow === 6;
    case "every_x_days": {
      const diffDays = Math.floor(
        (date.getTime() - start.getTime()) / (1000 * 60 * 60 * 24),
      );
      return diffDays % recurrence.x === 0;
    }
    case "specific_days":
      return recurrence.days.includes(dow);
  }
}

function makeDoseId(therapyId: string, scheduledAt: Date) {
  return `${therapyId}@${scheduledAt.toISOString()}`;
}

function computeStatus(
  scheduledAt: Date,
  timeoutMinutes: number,
  reminderIntervals: number[],
  event: MedicationEvent | undefined,
  now: Date,
): DoseStatus {
  if (event?.status === "taken") return "taken";
  if (event?.status === "skipped") return "skipped";
  if (event?.status === "missed") return "missed";
  if (event?.status === "snoozed") return "snoozed";
  const minutesFromScheduled = (now.getTime() - scheduledAt.getTime()) / 60000;
  if (minutesFromScheduled < 0) {
    const minutesUntilScheduled = Math.abs(minutesFromScheduled);
    const reminderBefore = Math.abs(reminderIntervals?.[0] ?? 10);
    return minutesUntilScheduled <= reminderBefore ? "reminder" : "scheduled";
  }
  if (minutesFromScheduled >= timeoutMinutes) return "late";
  return "due";
}

export function getDosesForPatientOnDate(
  data: FamilyMedData,
  patientId: string,
  date: Date,
  now: Date = new Date(),
): ScheduledDose[] {
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);

  const doses: ScheduledDose[] = [];
  for (const therapy of data.therapies) {
    if (therapy.patientId !== patientId) continue;
    if (!therapy.active || therapy.suspended) continue;
    if (!scheduledOnDate(therapy.recurrence, dayStart, therapy.startDate)) continue;
    if (therapy.endDate && new Date(therapy.endDate) < dayStart) continue;

    for (const time of therapy.times) {
      const [h, m] = time.split(":").map(Number);
      const scheduledAt = new Date(dayStart);
      scheduledAt.setHours(h, m, 0, 0);

      const event = data.events.find(
        (e) =>
          e.therapyId === therapy.id &&
          Math.abs(new Date(e.scheduledAt).getTime() - scheduledAt.getTime()) < 60_000,
      );

      const status = computeStatus(
        scheduledAt,
        therapy.timeoutMinutes,
        therapy.reminderIntervals,
        event,
        now,
      );

      doses.push({
        id: makeDoseId(therapy.id, scheduledAt),
        therapy,
        scheduledAt,
        event,
        status,
      });
    }
  }
  return doses.sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
}

export function getAdherenceForPatient(
  data: FamilyMedData,
  patientId: string,
  days = 7,
): number {
  const now = new Date();
  let total = 0;
  let taken = 0;
  for (let i = 0; i < days; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const doses = getDosesForPatientOnDate(data, patientId, d, now);
    for (const dose of doses) {
      if (dose.scheduledAt > now) continue;
      total++;
      if (dose.status === "taken") taken++;
    }
  }
  if (total === 0) return 100;
  return Math.round((taken / total) * 100);
}

export function getTodayProgress(data: FamilyMedData, patientId: string) {
  const now = new Date();
  const doses = getDosesForPatientOnDate(data, patientId, now, now);
  const taken = doses.filter((d) => d.status === "taken").length;
  return { taken, total: doses.length, doses };
}

export function getNextDose(
  data: FamilyMedData,
  patientId: string,
): ScheduledDose | undefined {
  const now = new Date();
  // Look at today + tomorrow
  for (let i = 0; i < 2; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() + i);
    const doses = getDosesForPatientOnDate(data, patientId, d, now);
    const upcoming = doses.find(
      (dose) =>
        (dose.status === "scheduled" ||
          dose.status === "due" ||
          dose.status === "reminder") &&
        dose.scheduledAt >= now,
    );
    if (upcoming) return upcoming;
  }
  return undefined;
}

export const statusLabel: Record<DoseStatus, string> = {
  scheduled: "Programmata",
  due: "Da prendere",
  reminder: "Reminder inviato",
  late: "In ritardo",
  snoozed: "Rimandata",
  missed: "Dimenticata",
  taken: "Confermata",
  skipped: "Saltata",
};

export const statusTone: Record<DoseStatus, string> = {
  scheduled: "bg-secondary text-muted-foreground",
  due: "bg-primary-soft text-primary",
  reminder: "bg-warning/15 text-warning-foreground",
  late: "bg-accent-soft text-accent",
  snoozed: "bg-warning/15 text-warning-foreground",
  missed: "bg-destructive/10 text-destructive",
  taken: "bg-success/15 text-success",
  skipped: "bg-destructive/10 text-destructive",
};

export const statusDot: Record<DoseStatus, string> = {
  scheduled: "bg-muted-foreground/40",
  due: "bg-primary",
  reminder: "bg-warning",
  late: "bg-accent",
  snoozed: "bg-warning",
  missed: "bg-destructive",
  taken: "bg-success",
  skipped: "bg-destructive",
};

export function recurrenceLabel(r: Recurrence): string {
  switch (r.kind) {
    case "daily":
      return "Ogni giorno";
    case "weekdays":
      return "Lun–Ven";
    case "weekend":
      return "Sabato e domenica";
    case "every_x_days":
      return `Ogni ${r.x} giorni`;
    case "specific_days": {
      const names = ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"];
      return r.days.map((d) => names[d]).join(", ");
    }
  }
}

// Tag usato dal caregiver per marcare una dose "missed"/"skipped" come
// gestita (es. dopo aver chiamato il paziente) senza cambiarne lo stato né
// toccare le scorte. Condiviso tra la pagina "Dose da confermare" e i
// contatori di alert (dashboard caregiver) così restano sempre allineati:
// un evento "gestito" non deve più contare come alert attivo.
export const CAREGIVER_ACK_TAG = "caregiver_ack";

export function isDoseAcknowledged(e: MedicationEvent): boolean {
  return typeof e.note === "string" && e.note.includes(CAREGIVER_ACK_TAG);
}

export function formatTime(d: Date) {
  return d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
}

export function formatDateLong(d: Date) {
  return d.toLocaleDateString("it-IT", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}