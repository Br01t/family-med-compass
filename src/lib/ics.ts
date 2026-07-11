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

// Blocco VTIMEZONE per "Europe/Rome" (CET/CEST), le uniche transizioni DST
// usate in tutto il file. Molti parser Android (incluso Google Calendar in
// import locale di file .ics) sono più severi di iOS/Apple Calendar: se un
// evento referenzia un TZID ma il VCALENDAR non definisce quel timezone,
// considerano l'intero file non valido e rifiutano l'import. Includere
// questo blocco risolve l'errore "file non valido" su Android, senza dover
// rinunciare all'orario locale corretto (che una conversione fissa in UTC
// romperebbe comunque durante i cambi ora legale/solare, dato che gli eventi
// sono ricorrenti).
const VTIMEZONE_EUROPE_ROME = [
  "BEGIN:VTIMEZONE",
  "TZID:Europe/Rome",
  "BEGIN:DAYLIGHT",
  "TZOFFSETFROM:+0100",
  "TZOFFSETTO:+0200",
  "TZNAME:CEST",
  "DTSTART:19700329T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
  "END:DAYLIGHT",
  "BEGIN:STANDARD",
  "TZOFFSETFROM:+0200",
  "TZOFFSETTO:+0100",
  "TZNAME:CET",
  "DTSTART:19701025T030000",
  "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
  "END:STANDARD",
  "END:VTIMEZONE",
].join("\r\n");

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

// Piega le righe a max 75 ottetti come richiesto da RFC 5545 §3.1: alcuni
// parser Android (oltre al VTIMEZONE mancante) sono severi anche su questo
// e rifiutano righe troppo lunghe (tipicamente SUMMARY/DESCRIPTION con link
// o note lunghe). Ogni riga di continuazione inizia con uno spazio.
function foldLine(line: string): string {
  const maxLen = 75;
  if (line.length <= maxLen) return line;
  let result = line.slice(0, maxLen);
  let rest = line.slice(maxLen);
  while (rest.length > 0) {
    const chunk = rest.slice(0, maxLen - 1);
    result += "\r\n " + chunk;
    rest = rest.slice(maxLen - 1);
  }
  return result;
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
      foldLine(`DESCRIPTION:${escape(description)}`),
      "END:VALARM",
    ].join("\r\n");

  const events = therapy.times.map((t, i) => {
    const [h, m] = t.split(":").map(Number);
    const start = localStamp(therapy.startDate, h, m);
    const endM = m + 15;
    const endH = h + Math.floor(endM / 60);
    const end = localStamp(therapy.startDate, endH % 24, endM % 60);
    const alarms = [
      ...preTriggers.map((minutes) =>
        alarm(
          `-PT${minutes}M`,
          `Tra ${minutes} minuti: ${therapy.name} ${therapy.dosage}`,
        ),
      ),
      alarm(
        "PT0M",
        `È ora di assumere ${therapy.name} ${therapy.dosage}`,
      ),
      alarm(
        `PT${postTrigger}M`,
        `Ricorda: ${therapy.name} ${therapy.dosage} non ancora confermata`,
      ),
    ];
    const parts = [
      "BEGIN:VEVENT",
      `UID:familymed-${therapy.id}-${i}@familymed.app`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART;TZID=Europe/Rome:${start}`,
      `DTEND;TZID=Europe/Rome:${end}`,
      foldLine(`SUMMARY:${summary}`),
      foldLine(`DESCRIPTION:${desc}`),
      foldLine(`URL:${deepLink}`),
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
    VTIMEZONE_EUROPE_ROME,
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

// --- Fallback Android: link "Aggiungi a Google Calendar" -----------------
//
// Su Android il download diretto di un .ics grezzo è inaffidabile: molti
// browser/telefoni non hanno un'app associata pronta a intercettare il file
// scaricato e mostrano "Impossibile aprire il file", indipendentemente da
// quanto il contenuto ICS sia corretto. La soluzione robusta e ampiamente
// usata in produzione è aprire invece l'URL "template" di Google Calendar:
// apre direttamente l'app (o il sito) già precompilata, l'utente tocca
// "Salva" e l'evento viene creato con certezza. Si perde qualche dettaglio
// (i promemoria multipli configurati come VALARM non sono supportati da
// questo URL, solo il promemoria di default di Google Calendar), ma la
// creazione dell'evento è garantita.
function isAndroidDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return /android/i.test(navigator.userAgent);
}

// Converte un orario "locale" (Europe/Rome) in UTC usando l'API Intl,
// gestendo automaticamente il cambio ora legale/solare senza bisogno di
// una libreria come date-fns-tz.
function zonedTimeToUtc(dateStr: string, hh: number, mm: number): Date {
  const naiveUtc = new Date(`${dateStr}T${pad(hh)}:${pad(mm)}:00.000Z`);
  const asRomeWallClock = new Date(
    naiveUtc.toLocaleString("en-US", { timeZone: "Europe/Rome" }),
  );
  const offset = naiveUtc.getTime() - asRomeWallClock.getTime();
  return new Date(naiveUtc.getTime() + offset);
}

function toGoogleUtcStamp(d: Date): string {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

function googleCalendarUrl(
  therapy: Therapy,
  patient: Patient,
  role: "paziente" | "caregiver",
  time: string,
): string {
  const [h, m] = time.split(":").map(Number);
  const start = zonedTimeToUtc(therapy.startDate, h, m);
  const end = new Date(start.getTime() + 15 * 60_000);
  const deepLink = appDeepLink(role, therapy.id, patient.id);

  const details = [
    `Farmaco: ${therapy.name} ${therapy.dosage}`,
    `Quantità: ${therapy.quantity} unità`,
    `Paziente: ${patient.name}`,
    therapy.notes ? `Note: ${therapy.notes}` : null,
    "",
    `Apri in FamilyMed: ${deepLink}`,
  ]
    .filter((v): v is string => v !== null)
    .join("\n");

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `💊 ${therapy.name} ${therapy.dosage} — ${patient.name}`,
    dates: `${toGoogleUtcStamp(start)}/${toGoogleUtcStamp(end)}`,
    details,
    recur: rrule(therapy),
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export type CalendarAddMethod = "google" | "ics";

/**
 * Punto d'ingresso unico per il pulsante "Aggiungi al calendario":
 * - su Android apre un link Google Calendar per ogni orario della terapia
 *   (metodo affidabile, l'evento viene sempre creato correttamente)
 * - altrove (iOS, desktop) scarica il file .ics come in precedenza
 *
 * Ritorna quale metodo è stato usato, così la UI può mostrare un toast
 * coerente.
 */
export function addTherapyToCalendar(
  therapy: Therapy,
  patient: Patient,
  role: "paziente" | "caregiver" = "paziente",
): CalendarAddMethod {
  if (isAndroidDevice()) {
    therapy.times.forEach((time) => {
      const url = googleCalendarUrl(therapy, patient, role, time);
      window.open(url, "_blank", "noopener,noreferrer");
    });
    return "google";
  }

  const ics = therapyToIcs(therapy, patient, role);
  downloadIcs(`${therapy.name.replace(/\s+/g, "_")}.ics`, ics);
  return "ics";
}