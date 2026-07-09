// Generatore ICS (RFC 5545) per esportare terapie come eventi RICORRENTI
// (un solo VEVENT per orario, con RRULE) da aggiungere al calendario nativo
// di iOS / Android / Google. Il calendario del sistema gestisce da solo
// promemoria e ricorrenze; nessuna foto viene allegata. La descrizione
// include un link "Apri in FamilyMed" per riaprire l'app.
import type { Therapy, Patient } from "./mock-data";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function localStamp(startIso: string, hh: number, mm: number) {
  const d = new Date(startIso + "T00:00:00");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(hh)}${pad(mm)}00`;
}

function nowStamp() {
  const d = new Date();
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

function rrule(therapy: Therapy): string {
  const r = therapy.recurrence;
  const until = therapy.endDate
    ? `;UNTIL=${therapy.endDate.replace(/-/g, "")}T235959Z`
    : "";
  switch (r.kind) {
    case "daily":
      return `RRULE:FREQ=DAILY${until}`;
    case "weekdays":
      return `RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR${until}`;
    case "weekend":
      return `RRULE:FREQ=WEEKLY;BYDAY=SA,SU${until}`;
    case "every_x_days":
      return `RRULE:FREQ=DAILY;INTERVAL=${r.x}${until}`;
    case "specific_days": {
      const map = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
      return `RRULE:FREQ=WEEKLY;BYDAY=${r.days.map((d) => map[d]).join(",")}${until}`;
    }
  }
}

function escape(text: string) {
  return text.replace(/\\/g, "\\\\").replace(/,/g, "\\,").replace(/;/g, "\\;").replace(/\n/g, "\\n");
}

function appDeepLink(role: "paziente" | "caregiver", therapyId: string, patientId?: string): string {
  const origin =
    typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : "https://familymed.app";
  if (role === "caregiver" && patientId) {
    return `${origin}/pazienti/${patientId}?therapy=${encodeURIComponent(therapyId)}`;
  }
  return `${origin}/paziente?therapy=${encodeURIComponent(therapyId)}`;
}

export function therapyToIcs(
  therapy: Therapy,
  patient: Patient,
  role: "paziente" | "caregiver" = "paziente",
): string {
  const dtstamp = nowStamp();
  const summary = escape(`💊 ${therapy.name} ${therapy.dosage} — ${patient.name}`);
  const deepLink = appDeepLink(role, therapy.id, patient.id);

  const descLines = [
    `Farmaco: ${therapy.name} ${therapy.dosage}`,
    `Quantità: ${therapy.quantity} unità`,
    `Paziente: ${patient.name}`,
    therapy.notes ? `Note: ${therapy.notes}` : null,
    "",
    `Apri in FamilyMed: ${deepLink}`,
  ].filter((v): v is string => v !== null);
  const desc = escape(descLines.join("\n"));

  // Promemoria calendario che simulano le notifiche in-app:
  // - uno per ogni "reminderIntervals" prima dell'orario (es. -10 min)
  // - uno all'orario esatto (TRIGGER:PT0M)
  // - uno dopo "timeoutMinutes" (o snoozeMinutes) come richiamo finale
  const preTriggers = (therapy.reminderIntervals ?? [])
    .map((n) => Math.abs(Number(n)))
    .filter((n) => Number.isFinite(n) && n > 0);
  const postTrigger = Math.max(
    1,
    Number(therapy.snoozeMinutes ?? therapy.timeoutMinutes ?? 10),
  );

  const alarm = (trigger: string, description: string) =>
    [
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      `TRIGGER:${trigger}`,
      `DESCRIPTION:${escape(description)}`,
      "END:VALARM",
    ].join("\r\n");

  const events = therapy.times.map((t, i) => {
    const [h, m] = t.split(":").map(Number);
    const start = localStamp(therapy.startDate, h, m);
    const endM = m + 15;
    const endH = h + Math.floor(endM / 60);
    const end = localStamp(therapy.startDate, endH % 24, endM % 60);
    const alarms = [
      ...preTriggers.map((n) =>
        alarm(`-PT${n}M`, `Tra ${n} min: ${therapy.name} ${therapy.dosage}`),
      ),
      alarm("PT0M", `È ora di ${therapy.name} ${therapy.dosage}`),
      alarm(
        `PT${postTrigger}M`,
        `Promemoria: hai preso ${therapy.name}?`,
      ),
    ];
    const parts = [
      "BEGIN:VEVENT",
      `UID:familymed-${therapy.id}-${i}@familymed.app`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART;TZID=Europe/Rome:${start}`,
      `DTEND;TZID=Europe/Rome:${end}`,
      `SUMMARY:${summary}`,
      `DESCRIPTION:${desc}`,
      `URL:${deepLink}`,
      `CATEGORIES:${escape(therapy.category)}`,
      rrule(therapy),
      ...alarms,
      "END:VEVENT",
    ];
    return parts.join("\r\n");
  });

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//FamilyMed//IT",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    ...events,
    "END:VCALENDAR",
  ].join("\r\n");
}

export function downloadIcs(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".ics") ? filename : `${filename}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
