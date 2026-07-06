// Generatore ICS (RFC 5545) per esportare terapie come eventi ricorrenti
// da aggiungere al calendario nativo di iOS / Android / Google.
import type { Therapy, Patient } from "./mock-data";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

// Costruisce una data locale (senza Z) YYYYMMDDTHHmmss per l'orario H:M
// a partire dallo startDate della terapia.
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

export function therapyToIcs(therapy: Therapy, patient: Patient): string {
  const dtstamp = nowStamp();
  const summary = escape(`💊 ${therapy.name} ${therapy.dosage} — ${patient.name}`);
  const desc = escape(
    [
      `Farmaco: ${therapy.name} ${therapy.dosage}`,
      `Quantità: ${therapy.quantity} unità`,
      `Paziente: ${patient.name}`,
      therapy.notes ? `Note: ${therapy.notes}` : null,
    ]
      .filter(Boolean)
      .join("\n"),
  );

  const events = therapy.times.map((t, i) => {
    const [h, m] = t.split(":").map(Number);
    const start = localStamp(therapy.startDate, h, m);
    // durata evento: 15 minuti
    const endM = m + 15;
    const endH = h + Math.floor(endM / 60);
    const end = localStamp(therapy.startDate, endH % 24, endM % 60);
    return [
      "BEGIN:VEVENT",
      `UID:familymed-${therapy.id}-${i}@familymed.app`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART;TZID=Europe/Rome:${start}`,
      `DTEND;TZID=Europe/Rome:${end}`,
      `SUMMARY:${summary}`,
      `DESCRIPTION:${desc}`,
      `CATEGORIES:${escape(therapy.category)}`,
      rrule(therapy),
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      `DESCRIPTION:${summary}`,
      "TRIGGER:-PT0M",
      "END:VALARM",
      "END:VEVENT",
    ].join("\r\n");
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
