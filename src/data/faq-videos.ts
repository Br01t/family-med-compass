import type { LucideIcon } from "lucide-react";
import { Pill, Users, HeartPulse, Activity, FileText, Package } from "lucide-react";

// I file mp4/jpg sono import reali di src/assets/faq/*, esattamente come il video
// demo (src/assets/familymed-demo.mp4): Vite li tratta come asset con fingerprint
// nel nome file, quindi il browser puo' tenerli in cache indefinitamente tra un
// deploy e l'altro (cache-busting automatico quando il contenuto cambia).
// NB: prima puntavano ai riferimenti asset di Lovable (*.asset.json, risolti
// tramite il proxy interno /__l5e/assets-v1/...), che funziona solo dentro
// l'editor/preview di Lovable e dava 404 ovunque altrove.
// Per (ri)generare questi file: remotion/scripts/render-faq-assets.mjs

import v_faq_crea_terapia from "@/assets/faq/faq-crea-terapia.mp4";
import p_faq_crea_terapia from "@/assets/faq/faq-crea-terapia.jpg";
import v_faq_invita_caregiver from "@/assets/faq/faq-invita-caregiver.mp4";
import p_faq_invita_caregiver from "@/assets/faq/faq-invita-caregiver.jpg";
import v_faq_conferma_dose from "@/assets/faq/faq-conferma-dose.mp4";
import p_faq_conferma_dose from "@/assets/faq/faq-conferma-dose.jpg";
import v_faq_parametri_vitali from "@/assets/faq/faq-parametri-vitali.mp4";
import p_faq_parametri_vitali from "@/assets/faq/faq-parametri-vitali.jpg";
import v_faq_report_pdf from "@/assets/faq/faq-report-pdf.mp4";
import p_faq_report_pdf from "@/assets/faq/faq-report-pdf.jpg";
import v_faq_scorte from "@/assets/faq/faq-scorte.mp4";
import p_faq_scorte from "@/assets/faq/faq-scorte.jpg";

export type FaqVideo = {
  id: string;
  title: string;
  category: string;
  short: string;
  duration: number;
  icon: LucideIcon;
  src: string;
  poster: string;
  captions: string;
  transcript: string[];
};

export const FAQ_VIDEOS: FaqVideo[] = [
  {
    id: "faq-crea-terapia",
    title: "Come creare una terapia",
    category: "Terapie",
    short: "Aggiungi un farmaco con dosaggio, orari e scorta iniziale.",
    duration: 22,
    icon: Pill,
    src: v_faq_crea_terapia,
    poster: p_faq_crea_terapia,
    captions: "/faq/faq-crea-terapia.vtt",
    transcript: [
      "Come creare una terapia.",
      "Passaggio 1 — Apri «Terapie»: Dal menu laterale (o dalla barra in basso se sei paziente) scegli Terapie.",
      "Passaggio 2 — Tocca «Aggiungi terapia»: Il pulsante è sempre in alto nella pagina Terapie.",
      "Passaggio 3 — Inserisci nome e dosaggio: Nome del farmaco, dose per assunzione e forma (compressa, gocce, fiala…).",
      "Passaggio 4 — Imposta gli orari: Aggiungi uno o più orari al giorno: il promemoria suonerà puntuale.",
      "Passaggio 5 — Salva: è già attiva: Il paziente riceve subito il promemoria e tu vedi le conferme in tempo reale.",
      "Terapia attiva!",
    ],
  },
  {
    id: "faq-invita-caregiver",
    title: "Come invitare un caregiver",
    category: "Gruppo di cura",
    short: "Invita familiari o badanti con link o QR e gestisci i permessi.",
    duration: 22,
    icon: Users,
    src: v_faq_invita_caregiver,
    poster: p_faq_invita_caregiver,
    captions: "/faq/faq-invita-caregiver.vtt",
    transcript: [
      "Come invitare un caregiver.",
      "Passaggio 1 — Apri la scheda del paziente: Dalla lista Pazienti tocca la persona per cui vuoi aggiungere qualcuno.",
      "Passaggio 2 — Vai su «Gruppo di cura»: La card centrale sotto le terapie di oggi apre l'amministrazione della famiglia.",
      "Passaggio 3 — Genera l'invito: Scegli il ruolo (familiare, badante) e crea il codice: vale 7 giorni.",
      "Passaggio 4 — Condividi link o QR: Invia il link via WhatsApp oppure fai inquadrare il QR Code.",
      "Passaggio 5 — Gestisci ruoli e permessi: Puoi promuovere, limitare o rimuovere un membro in qualsiasi momento.",
      "Famiglia collegata!",
    ],
  },
  {
    id: "faq-conferma-dose",
    title: "Come confermare una dose",
    category: "Paziente",
    short: "Conferma, posticipa o salta una dose in un tap.",
    duration: 19,
    icon: HeartPulse,
    src: v_faq_conferma_dose,
    poster: p_faq_conferma_dose,
    captions: "/faq/faq-conferma-dose.vtt",
    transcript: [
      "Come confermare una dose.",
      "Passaggio 1 — Arriva il promemoria: All'orario stabilito il telefono suona e mostra il farmaco da prendere.",
      "Passaggio 2 — Tocca il pulsante grande: Un solo tap su «Ho preso la medicina». Nessun modulo, nessun passaggio in più.",
      "Passaggio 3 — Non ora? Rimanda: Con «Posticipa» la sveglia torna dopo 10 minuti senza segnare la dose.",
      "Passaggio 4 — La famiglia lo vede subito: La conferma arriva in tempo reale nella dashboard di chi ti segue.",
      "Dose registrata!",
    ],
  },
  {
    id: "faq-parametri-vitali",
    title: "Come registrare i parametri vitali",
    category: "Diario salute",
    short: "Registra pressione, glicemia, peso e saturazione e leggi i trend.",
    duration: 19,
    icon: Activity,
    src: v_faq_parametri_vitali,
    poster: p_faq_parametri_vitali,
    captions: "/faq/faq-parametri-vitali.vtt",
    transcript: [
      "Come registrare i parametri vitali.",
      "Passaggio 1 — Apri «Parametri vitali»: Pressione, glicemia, peso e saturazione in un unico diario.",
      "Passaggio 2 — Scegli il parametro: Ogni tipo ha la sua unità di misura, già impostata per te.",
      "Passaggio 3 — Inserisci i valori: Sistolica, diastolica e battito. Data e ora si compilano da sole.",
      "Passaggio 4 — Leggi grafici e trend: Media mobile e variazione rispetto alla settimana precedente.",
      "Parametro salvato!",
    ],
  },
  {
    id: "faq-report-pdf",
    title: "Come scaricare il report PDF",
    category: "Report",
    short: "Scarica lo storico aderenza in PDF a 7, 30 o 90 giorni.",
    duration: 19,
    icon: FileText,
    src: v_faq_report_pdf,
    poster: p_faq_report_pdf,
    captions: "/faq/faq-report-pdf.vtt",
    transcript: [
      "Come scaricare il report PDF.",
      "Passaggio 1 — Apri «Storico e report»: Tutte le dosi programmate, prese, saltate o dimenticate.",
      "Passaggio 2 — Scegli paziente e periodo: 7, 30 o 90 giorni: i numeri si aggiornano all'istante.",
      "Passaggio 3 — Filtra terapie e stati: Puoi includere solo alcuni farmaci o solo le dosi dimenticate.",
      "Passaggio 4 — Scarica il PDF: Riepilogo aderenza, dettaglio giornaliero e breakdown per farmaco.",
      "PDF pronto!",
    ],
  },
  {
    id: "faq-scorte",
    title: "Come gestire le scorte di farmaci",
    category: "Scorte",
    short: "Registra le confezioni e ricevi l'avviso prima che finiscano.",
    duration: 19,
    icon: Package,
    src: v_faq_scorte,
    poster: p_faq_scorte,
    captions: "/faq/faq-scorte.vtt",
    transcript: [
      "Come gestire le scorte di farmaci.",
      "Passaggio 1 — Apri «Scorte»: Ogni terapia ha il suo magazzino di pillole rimanenti.",
      "Passaggio 2 — Registra la confezione: Inserisci quante compresse hai comprato: lo scalo è automatico a ogni dose.",
      "Passaggio 3 — Imposta la soglia di avviso: Sotto la soglia ricevi la notifica «scorta in esaurimento».",
      "Passaggio 4 — Ricevi l'avviso in tempo: Hai il tempo di passare in farmacia prima che finiscano.",
      "Non resti mai senza!",
    ],
  },
];