import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { FamilyMedData, Patient } from "./mock-data";
import {
  doseDelayMinutes,
  formatTime,
  getDosesForPatientOnDate,
  recurrenceLabel,
  statusLabel,
  wasTakenLate,
  type ScheduledDose,
} from "./therapy";


const BRAND_RGB: [number, number, number] = [40, 116, 90];
const MARGIN_X = 40;
const PAGE_HEIGHT_LIMIT = 760;

/**
 * Genera e avvia il download di un PDF con l'elenco completo delle terapie
 * del paziente (attive e sospese).
 *
 * Pensato per essere richiamato dal pulsante "Resoconto PDF" nella pagina
 * Terapie (lato paziente), ma non dipende da nulla di UI-specifico: prende
 * solo lo store dati, il paziente e opzionalmente un `now` iniettabile per i
 * test.
 */
export function downloadTherapyReportPdf(
  data: FamilyMedData,
  patient: Patient,
  now: Date = new Date(),
) {
  const therapies = data.therapies.filter((t) => t.patientId === patient.id);

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  let cursorY = 50;

  // --- Intestazione -------------------------------------------------
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("Resoconto terapie", MARGIN_X, cursorY);

  cursorY += 22;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(90);
  doc.text(`Paziente: ${patient.name}`, MARGIN_X, cursorY);

  cursorY += 16;
  const generatedLabel = now.toLocaleDateString("it-IT", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  doc.text(`Generato il ${generatedLabel} alle ${formatTime(now)}`, MARGIN_X, cursorY);
  doc.setTextColor(0);
  cursorY += 28;

  // --- Sezione 1: elenco terapie --------------------------------------
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("Terapie", MARGIN_X, cursorY);
  cursorY += 10;

  if (therapies.length === 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(120);
    doc.text("Nessuna terapia registrata.", MARGIN_X, cursorY + 16);
    doc.setTextColor(0);
    cursorY += 30;
  } else {
    autoTable(doc, {
      startY: cursorY,
      margin: { left: MARGIN_X, right: MARGIN_X },
      head: [
        ["Terapia", "Dosaggio", "Orari", "Ricorrenza", "Categoria", "Scorta", "Stato"],
      ],
      body: therapies.map((t) => [
        t.name,
        `${t.dosage} · ${t.quantity} u.`,
        t.times.join(", "),
        recurrenceLabel(t.recurrence),
        t.category,
        `${t.pillsRemaining} compresse`,
        t.suspended ? "Sospesa" : "Attiva",
      ]),
      styles: { fontSize: 9, cellPadding: 5 },
      headStyles: { fillColor: BRAND_RGB, textColor: 255 },
      didParseCell: (hook) => {
        if (hook.section === "body" && hook.column.index === 6) {
          const isSuspended = hook.cell.raw === "Sospesa";
          hook.cell.styles.textColor = isSuspended ? [200, 80, 40] : [30, 140, 90];
          hook.cell.styles.fontStyle = "bold";
        }
      },
    });

    // @ts-expect-error -- lastAutoTable è iniettato a runtime dal plugin
    cursorY = doc.lastAutoTable.finalY + 24;
  }

  // Note per terapia, se presenti
  const withNotes = therapies.filter((t) => t.notes);
  if (withNotes.length > 0) {
    if (cursorY > PAGE_HEIGHT_LIMIT) {
      doc.addPage();
      cursorY = 50;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Note", MARGIN_X, cursorY);
    cursorY += 16;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(70);
    for (const t of withNotes) {
      const lines = doc.splitTextToSize(`${t.name}: ${t.notes}`, 515);
      if (cursorY + lines.length * 12 > PAGE_HEIGHT_LIMIT) {
        doc.addPage();
        cursorY = 50;
      }
      doc.text(lines, MARGIN_X, cursorY);
      cursorY += lines.length * 12 + 6;
    }
    doc.setTextColor(0);
    cursorY += 12;
  }

  // --- Footer con numero pagina ---------------------------------------
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(
      `FamilyMed · Resoconto terapie · pag. ${i}/${pageCount}`,
      MARGIN_X,
      812,
    );
  }

  const filename = `resoconto_${patient.name.replace(/\s+/g, "_")}_${now
    .toISOString()
    .slice(0, 10)}.pdf`;
  doc.save(filename);
}

/**
 * Genera il PDF dello storico assunzioni del paziente sugli ultimi
 * `days` giorni (7, 30 o 90). Include KPI di aderenza, breakdown per
 * terapia e dettaglio giornaliero di tutte le dosi programmate con stato,
 * conferma e ritardo.
 */
export function downloadHistoryReportPdf(
  data: FamilyMedData,
  patient: Patient,
  days: 7 | 30 | 90,
  now: Date = new Date(),
  statusFilter?: Set<"taken" | "late" | "missed" | "skipped">,
) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  let cursorY = 50;

  const matchesStatus = (dose: ScheduledDose): boolean => {
    if (!statusFilter || statusFilter.size === 0) return true;
    const takenLate = wasTakenLate(dose);
    if (statusFilter.has("taken") && dose.status === "taken" && !takenLate) return true;
    if (statusFilter.has("late") && (dose.status === "late" || takenLate)) return true;
    if (statusFilter.has("missed") && dose.status === "missed") return true;
    if (statusFilter.has("skipped") && dose.status === "skipped") return true;
    return false;
  };

  // --- Raccolta dati per il periodo ---------------------------------
  const daysList: { date: Date; doses: ScheduledDose[] }[] = [];
  let scheduled = 0;
  let taken = 0;
  let late = 0;
  let skipped = 0;
  let missed = 0;
  const delays: number[] = [];
  const perTherapy = new Map<
    string,
    { name: string; scheduled: number; taken: number; late: number; skipped: number; missed: number }
  >();

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const doses = getDosesForPatientOnDate(data, patient.id, d, now)
      .filter((dose) => dose.scheduledAt <= now)
      .filter(matchesStatus);
    daysList.push({ date: d, doses });

    for (const dose of doses) {
      scheduled++;
      const entry =
        perTherapy.get(dose.therapy.id) ??
        { name: dose.therapy.name, scheduled: 0, taken: 0, late: 0, skipped: 0, missed: 0 };
      entry.scheduled++;
      if (dose.status === "taken") {
        taken++;
        entry.taken++;
        const delay = doseDelayMinutes(dose);
        if (delay !== null && delay >= 0) delays.push(delay);
        if (wasTakenLate(dose)) {
          late++;
          entry.late++;
        }
      } else if (dose.status === "late") {
        late++;
        entry.late++;
      } else if (dose.status === "skipped") {
        skipped++;
        entry.skipped++;
      } else if (dose.status === "missed") {
        missed++;
        entry.missed++;
      }
      perTherapy.set(dose.therapy.id, entry);
    }
  }

  const adherence = scheduled === 0 ? 0 : Math.round((taken / scheduled) * 100);
  const avgDelay =
    delays.length === 0
      ? 0
      : Math.round(delays.reduce((a, b) => a + b, 0) / delays.length);

  // --- Intestazione -------------------------------------------------
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(`Storico assunzioni · ultimi ${days} giorni`, MARGIN_X, cursorY);
  cursorY += 22;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(90);
  doc.text(`Paziente: ${patient.name}`, MARGIN_X, cursorY);
  cursorY += 16;
  const fromDate = new Date(now);
  fromDate.setDate(fromDate.getDate() - (days - 1));
  doc.text(
    `Periodo: dal ${fromDate.toLocaleDateString("it-IT")} al ${now.toLocaleDateString("it-IT")}`,
    MARGIN_X,
    cursorY,
  );
  cursorY += 16;
  doc.text(
    `Generato il ${now.toLocaleDateString("it-IT")} alle ${formatTime(now)}`,
    MARGIN_X,
    cursorY,
  );
  doc.setTextColor(0);
  cursorY += 28;

  // --- KPI ----------------------------------------------------------
  autoTable(doc, {
    startY: cursorY,
    margin: { left: MARGIN_X, right: MARGIN_X },
    head: [["Aderenza", "Programmate", "Confermate", "In ritardo", "Saltate", "Dimenticate", "Ritardo medio"]],
    body: [[
      `${adherence}%`,
      String(scheduled),
      String(taken),
      String(late),
      String(skipped),
      String(missed),
      `${avgDelay} min`,
    ]],
    styles: { fontSize: 10, cellPadding: 6, halign: "center" },
    headStyles: { fillColor: BRAND_RGB, textColor: 255 },
  });
  // @ts-expect-error -- lastAutoTable è iniettato a runtime
  cursorY = doc.lastAutoTable.finalY + 24;

  // --- Breakdown per terapia ----------------------------------------
  if (perTherapy.size > 0) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("Dettaglio per terapia", MARGIN_X, cursorY);
    cursorY += 8;
    const rows = Array.from(perTherapy.values())
      .sort((a, b) => b.scheduled - a.scheduled)
      .map((t) => [
        t.name,
        String(t.scheduled),
        String(t.taken),
        String(t.late),
        String(t.skipped),
        String(t.missed),
        `${t.scheduled === 0 ? 0 : Math.round((t.taken / t.scheduled) * 100)}%`,
      ]);
    autoTable(doc, {
      startY: cursorY,
      margin: { left: MARGIN_X, right: MARGIN_X },
      head: [["Terapia", "Programmate", "Confermate", "In ritardo", "Saltate", "Dimenticate", "Aderenza"]],
      body: rows,
      styles: { fontSize: 9, cellPadding: 5 },
      headStyles: { fillColor: BRAND_RGB, textColor: 255 },
    });
    // @ts-expect-error
    cursorY = doc.lastAutoTable.finalY + 24;
  }

  // --- Dettaglio giornaliero ----------------------------------------
  if (cursorY > PAGE_HEIGHT_LIMIT - 40) {
    doc.addPage();
    cursorY = 50;
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("Dettaglio giornaliero", MARGIN_X, cursorY);
  cursorY += 8;

  const dayRows: (string | number)[][] = [];
  for (const day of daysList) {
    if (day.doses.length === 0) {
      dayRows.push([
        day.date.toLocaleDateString("it-IT", { weekday: "short", day: "2-digit", month: "2-digit" }),
        "—",
        "—",
        "Nessuna dose",
        "",
      ]);
      continue;
    }
    for (const dose of day.doses) {
      const delay = doseDelayMinutes(dose);
      const stato = wasTakenLate(dose) ? "In ritardo" : statusLabel[dose.status];
      const confermata = dose.event?.confirmedAt
        ? `${formatTime(new Date(dose.event.confirmedAt))}${
            delay !== null && delay > 0 ? ` (+${Math.round(delay)}m)` : ""
          }`
        : "—";
      dayRows.push([
        day.date.toLocaleDateString("it-IT", { weekday: "short", day: "2-digit", month: "2-digit" }),
        formatTime(dose.scheduledAt),
        dose.therapy.name,
        stato,
        confermata,
      ]);
    }
  }

  autoTable(doc, {
    startY: cursorY,
    margin: { left: MARGIN_X, right: MARGIN_X },
    head: [["Giorno", "Ora", "Terapia", "Stato", "Conferma"]],
    body: dayRows,
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: BRAND_RGB, textColor: 255 },
    didParseCell: (hook) => {
      if (hook.section === "body" && hook.column.index === 3) {
        const val = String(hook.cell.raw ?? "");
        if (val === "Confermata") hook.cell.styles.textColor = [30, 140, 90];
        else if (val === "Dimenticata" || val === "Saltata")
          hook.cell.styles.textColor = [200, 60, 60];
        else if (val === "In ritardo") hook.cell.styles.textColor = [200, 130, 40];
      }
    },
  });

  // --- Footer -------------------------------------------------------
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(
      `FamilyMed · Storico ${days}gg · ${patient.name} · pag. ${i}/${pageCount}`,
      MARGIN_X,
      812,
    );
  }

  const filename = `storico_${patient.name.replace(/\s+/g, "_")}_${days}gg_${now
    .toISOString()
    .slice(0, 10)}.pdf`;
  doc.save(filename);
}
