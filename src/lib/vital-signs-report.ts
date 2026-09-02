import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { Patient } from "./mock-data";

export type VitalKind = "blood_pressure" | "glycemia" | "weight" | "saturation";

export type VitalRow = {
  id: string;
  patient_id: string;
  kind: VitalKind;
  value_primary: number;
  value_secondary: number | null;
  pulse: number | null;
  unit: string | null;
  measured_at: string;
  notes: string | null;
  created_by: string | null;
};

export const VITAL_LABELS: Record<VitalKind, string> = {
  blood_pressure: "Pressione arteriosa",
  glycemia: "Glicemia",
  weight: "Peso",
  saturation: "Saturazione (SpO2)",
};

export const VITAL_UNITS: Record<VitalKind, string> = {
  blood_pressure: "mmHg",
  glycemia: "mg/dL",
  weight: "kg",
  saturation: "%",
};

const BRAND: [number, number, number] = [40, 116, 90];
const MARGIN_X = 40;

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function stats(values: number[]) {
  if (!values.length) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  return { min, max, avg };
}

function fmtNum(n: number, digits = 1) {
  return Number.isFinite(n) ? n.toFixed(digits) : "—";
}

/**
 * Media mobile semplice su `window` campioni consecutivi.
 * Ritorna un array della stessa lunghezza; posizioni con meno di `window`
 * valori disponibili contengono `null`.
 */
export function movingAverage(values: (number | null | undefined)[], window: number): (number | null)[] {
  const out: (number | null)[] = [];
  for (let i = 0; i < values.length; i++) {
    if (i + 1 < window) {
      out.push(null);
      continue;
    }
    let sum = 0;
    let count = 0;
    for (let j = i - window + 1; j <= i; j++) {
      const v = values[j];
      if (typeof v === "number" && Number.isFinite(v)) {
        sum += v;
        count++;
      }
    }
    out.push(count === window ? sum / window : null);
  }
  return out;
}

export function downloadVitalSignsPdf(
  patient: Patient,
  rows: VitalRow[],
  opts: {
    from: Date;
    to: Date;
    kinds: VitalKind[];
    now?: Date;
  },
) {
  const now = opts.now ?? new Date();
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  let y = 50;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(...BRAND);
  doc.text("Parametri vitali", MARGIN_X, y);
  doc.setTextColor(0);

  y += 22;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(90);
  doc.text(`Paziente: ${patient.name}`, MARGIN_X, y);
  y += 15;
  doc.text(
    `Periodo: ${opts.from.toLocaleDateString("it-IT")} — ${opts.to.toLocaleDateString("it-IT")}`,
    MARGIN_X,
    y,
  );
  y += 15;
  doc.text(
    `Generato il ${now.toLocaleDateString("it-IT")} alle ${now.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}`,
    MARGIN_X,
    y,
  );
  y += 13;
  doc.setFontSize(8);
  doc.setTextColor(140);
  doc.text(
    "Dati auto-riportati dal paziente o dal caregiver tramite l'app. Non sostituisce la valutazione di un professionista sanitario.",
    MARGIN_X,
    y,
  );
  doc.setTextColor(0);
  y += 22;

  // Filtra per periodo + kinds
  const fromMs = opts.from.getTime();
  const toMs = opts.to.getTime();
  const inRange = rows
    .filter((r) => opts.kinds.includes(r.kind))
    .filter((r) => {
      const t = new Date(r.measured_at).getTime();
      return t >= fromMs && t <= toMs;
    })
    .sort((a, b) => new Date(a.measured_at).getTime() - new Date(b.measured_at).getTime());

  // Riepilogo per tipo
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("Riepilogo statistico", MARGIN_X, y);
  y += 6;

  const summaryBody = opts.kinds.map((k) => {
    const list = inRange.filter((r) => r.kind === k);
    if (!list.length) {
      return [VITAL_LABELS[k], "0", "—", "—", "—", "—"];
    }
    if (k === "blood_pressure") {
      const sys = stats(list.map((r) => Number(r.value_primary)));
      const dia = stats(list.map((r) => Number(r.value_secondary ?? 0)).filter((n) => n > 0));
      return [
        VITAL_LABELS[k],
        String(list.length),
        `${fmtNum(sys?.avg ?? NaN, 0)} / ${fmtNum(dia?.avg ?? NaN, 0)}`,
        `${fmtNum(sys?.min ?? NaN, 0)} / ${fmtNum(dia?.min ?? NaN, 0)}`,
        `${fmtNum(sys?.max ?? NaN, 0)} / ${fmtNum(dia?.max ?? NaN, 0)}`,
        VITAL_UNITS[k],
      ];
    }
    const s = stats(list.map((r) => Number(r.value_primary)));
    return [
      VITAL_LABELS[k],
      String(list.length),
      fmtNum(s?.avg ?? NaN, k === "weight" ? 1 : 0),
      fmtNum(s?.min ?? NaN, k === "weight" ? 1 : 0),
      fmtNum(s?.max ?? NaN, k === "weight" ? 1 : 0),
      VITAL_UNITS[k],
    ];
  });

  autoTable(doc, {
    startY: y + 6,
    margin: { left: MARGIN_X, right: MARGIN_X },
    head: [["Parametro", "N.", "Media", "Min", "Max", "Unità"]],
    body: summaryBody,
    styles: { fontSize: 10 },
    headStyles: { fillColor: BRAND, textColor: 255 },
  });

  y = (doc as any).lastAutoTable.finalY + 24;

  // Dettaglio per tipo
  for (const k of opts.kinds) {
    const list = inRange.filter((r) => r.kind === k);
    if (!list.length) continue;

    if (y > 720) {
      doc.addPage();
      y = 50;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text(`${VITAL_LABELS[k]} — ${list.length} misurazioni`, MARGIN_X, y);
    y += 6;

    autoTable(doc, {
      startY: y + 6,
      margin: { left: MARGIN_X, right: MARGIN_X },
      head: [
        k === "blood_pressure"
          ? ["Data e ora", "Sistolica", "Diastolica", "Battito", "Note"]
          : ["Data e ora", `Valore (${VITAL_UNITS[k]})`, "Battito", "Note"],
      ],
      body: list.map((r) =>
        k === "blood_pressure"
          ? [
              fmtDateTime(r.measured_at),
              String(r.value_primary),
              String(r.value_secondary ?? "—"),
              r.pulse != null ? String(r.pulse) : "—",
              r.notes ?? "",
            ]
          : [
              fmtDateTime(r.measured_at),
              String(r.value_primary),
              r.pulse != null ? String(r.pulse) : "—",
              r.notes ?? "",
            ],
      ),
      styles: { fontSize: 9 },
      headStyles: { fillColor: BRAND, textColor: 255 },
    });

    y = (doc as any).lastAutoTable.finalY + 20;
  }

  // Footer paginazione
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(140);
    doc.text(`FamilyMed — Parametri vitali di ${patient.name}`, MARGIN_X, 820);
    doc.text(`Pagina ${i} di ${pageCount}`, 555 - MARGIN_X, 820, { align: "right" });
    doc.setTextColor(0);
  }

  const safe = patient.name.replace(/[^a-zA-Z0-9-_]+/g, "_");
  doc.save(`parametri-vitali-${safe}-${now.toISOString().slice(0, 10)}.pdf`);
}