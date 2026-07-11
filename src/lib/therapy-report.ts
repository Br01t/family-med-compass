import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { FamilyMedData, Patient } from "./mock-data";
import { formatTime, recurrenceLabel } from "./therapy";

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