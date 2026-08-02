import type { TutorialProps } from "./Tutorial";

export const FAQ_VIDEOS: Record<string, TutorialProps> = {
  "faq-crea-terapia": {
    chip: "FAQ · Terapie",
    title: "Come creare",
    titleAccent: "una terapia",
    outro: "Terapia attiva!",
    steps: [
      {
        n: 1,
        caption: "Apri «Terapie»",
        detail: "Dal menu laterale (o dalla barra in basso se sei paziente) scegli Terapie.",
        screen: {
          header: "Menu",
          sub: "Cosa vuoi fare?",
          rows: [
            { label: "Dashboard", sub: "Panoramica di oggi" },
            { label: "Terapie", sub: "Farmaci e orari", tone: "sage", target: true },
            { label: "Scorte", sub: "Pillole rimanenti" },
            { label: "Parametri vitali", sub: "Pressione, glicemia…" },
          ],
        },
      },
      {
        n: 2,
        caption: "Tocca «Aggiungi terapia»",
        detail: "Il pulsante è sempre in alto nella pagina Terapie.",
        screen: {
          header: "Terapie",
          sub: "2 terapie attive",
          rows: [
            { label: "Cardioaspirina", sub: "100mg · 08:00", tone: "clay" },
            { label: "Metformina", sub: "500mg · 13:00 · 20:00", tone: "clay" },
          ],
          cta: "+ Aggiungi terapia",
          tapCta: true,
        },
      },
      {
        n: 3,
        caption: "Inserisci nome e dosaggio",
        detail: "Nome del farmaco, dose per assunzione e forma (compressa, gocce, fiala…).",
        screen: {
          header: "Nuova terapia",
          sub: "Dati del farmaco",
          rows: [
            { label: "Lasix", sub: "Nome del farmaco", tone: "sage" },
            { label: "25 mg", sub: "Dosaggio" },
            { label: "1 compressa", sub: "Quantità per assunzione", target: true },
          ],
        },
      },
      {
        n: 4,
        caption: "Imposta gli orari",
        detail: "Aggiungi uno o più orari al giorno: il promemoria suonerà puntuale.",
        screen: {
          header: "Orari",
          bigLabel: "PROMEMORIA",
          bigValue: "08:00",
          rows: [
            { label: "13:00", sub: "Secondo promemoria", tone: "amber" },
            { label: "+ Aggiungi orario", sub: "Fino a 6 al giorno", target: true },
          ],
        },
      },
      {
        n: 5,
        caption: "Salva: è già attiva",
        detail: "Il paziente riceve subito il promemoria e tu vedi le conferme in tempo reale.",
        screen: {
          header: "Riepilogo",
          sub: "Lasix · 25mg",
          rows: [
            { label: "Ogni giorno", sub: "08:00 e 13:00", tone: "sage" },
            { label: "Scorta: 30 compresse", sub: "Avviso sotto le 7" },
          ],
          cta: "Salva terapia",
          tapCta: true,
        },
      },
    ],
  },

  "faq-invita-caregiver": {
    chip: "FAQ · Gruppo di cura",
    title: "Come invitare",
    titleAccent: "un caregiver",
    outro: "Famiglia collegata!",
    steps: [
      {
        n: 1,
        caption: "Apri la scheda del paziente",
        detail: "Dalla lista Pazienti tocca la persona per cui vuoi aggiungere qualcuno.",
        screen: {
          header: "Pazienti",
          sub: "Chi segui",
          rows: [
            { label: "Mario Rossi", sub: "1938 · 3 terapie", tone: "sage", target: true },
            { label: "Anna Bianchi", sub: "1945 · 1 terapia" },
          ],
        },
      },
      {
        n: 2,
        caption: "Vai su «Gruppo di cura»",
        detail: "La card centrale sotto le terapie di oggi apre l'amministrazione della famiglia.",
        screen: {
          header: "Mario Rossi",
          sub: "Scheda paziente",
          rows: [
            { label: "Terapie di oggi", sub: "3 dosi programmate" },
            { label: "Timeline di oggi", sub: "2 conferme" },
            { label: "Gruppo di cura", sub: "2 membri attivi", tone: "sage", target: true },
          ],
        },
      },
      {
        n: 3,
        caption: "Genera l'invito",
        detail: "Scegli il ruolo (familiare, badante) e crea il codice: vale 7 giorni.",
        screen: {
          header: "Gruppo di cura",
          sub: "Membri e inviti",
          rows: [
            { label: "Marco — Figlio", sub: "Principale" },
            { label: "Elena — Badante", sub: "Secondario" },
          ],
          cta: "Crea invito",
          tapCta: true,
        },
      },
      {
        n: 4,
        caption: "Condividi link o QR",
        detail: "Invia il link via WhatsApp oppure fai inquadrare il QR Code.",
        screen: {
          header: "Invito pronto",
          bigLabel: "CODICE",
          bigValue: "K7-42B",
          rows: [
            { label: "Copia link", sub: "familymed.app/invito/K7-42B", tone: "sage", target: true },
            { label: "Mostra QR Code", sub: "Scansione istantanea" },
          ],
        },
      },
      {
        n: 5,
        caption: "Gestisci ruoli e permessi",
        detail: "Puoi promuovere, limitare o rimuovere un membro in qualsiasi momento.",
        screen: {
          header: "Membri",
          sub: "3 persone",
          rows: [
            { label: "Giulia — Sorella", sub: "Appena entrata", tone: "sage" },
            { label: "Permessi", sub: "Vede terapie · registra dosi", target: true },
            { label: "Rimuovi accesso", sub: "Revoca immediata", tone: "clay" },
          ],
        },
      },
    ],
  },

  "faq-conferma-dose": {
    chip: "FAQ · Paziente",
    title: "Come confermare",
    titleAccent: "una dose",
    outro: "Dose registrata!",
    steps: [
      {
        n: 1,
        caption: "Arriva il promemoria",
        detail: "All'orario stabilito il telefono suona e mostra il farmaco da prendere.",
        screen: {
          header: "Promemoria",
          bigLabel: "ORA",
          bigValue: "08:00",
          rows: [{ label: "Cardioaspirina 100mg", sub: "1 compressa", tone: "clay" }],
          cta: "Apri",
          tapCta: true,
        },
      },
      {
        n: 2,
        caption: "Tocca il pulsante grande",
        detail: "Un solo tap su «Ho preso la medicina». Nessun modulo, nessun passaggio in più.",
        screen: {
          header: "Buongiorno, Mario",
          sub: "Cardioaspirina · 100mg",
          bigLabel: "PROSSIMO FARMACO",
          bigValue: "08:00",
          cta: "Ho preso la medicina",
          tapCta: true,
        },
      },
      {
        n: 3,
        caption: "Non ora? Rimanda",
        detail: "Con «Posticipa» la sveglia torna dopo 10 minuti senza segnare la dose.",
        screen: {
          header: "Cardioaspirina",
          sub: "Cosa vuoi fare?",
          rows: [
            { label: "Ho preso la medicina", sub: "Conferma subito", tone: "sage" },
            { label: "Posticipa 10 min", sub: "La sveglia torna", tone: "amber", target: true },
            { label: "Salta questa dose", sub: "Con motivazione", tone: "clay" },
          ],
        },
      },
      {
        n: 4,
        caption: "La famiglia lo vede subito",
        detail: "La conferma arriva in tempo reale nella dashboard di chi ti segue.",
        screen: {
          header: "Oggi",
          sub: "Timeline",
          rows: [
            { label: "08:02 · Presa", sub: "Cardioaspirina", tone: "sage" },
            { label: "13:00 · In attesa", sub: "Metformina", tone: "amber" },
            { label: "Marco è stato avvisato", sub: "Notifica inviata", target: true },
          ],
        },
      },
    ],
  },

  "faq-parametri-vitali": {
    chip: "FAQ · Diario salute",
    title: "Come registrare",
    titleAccent: "i parametri vitali",
    outro: "Parametro salvato!",
    steps: [
      {
        n: 1,
        caption: "Apri «Parametri vitali»",
        detail: "Pressione, glicemia, peso e saturazione in un unico diario.",
        screen: {
          header: "Menu",
          rows: [
            { label: "Terapie", sub: "Farmaci e orari" },
            { label: "Parametri vitali", sub: "Diario della salute", tone: "sage", target: true },
            { label: "Storico e report", sub: "PDF per il medico" },
          ],
        },
      },
      {
        n: 2,
        caption: "Scegli il parametro",
        detail: "Ogni tipo ha la sua unità di misura, già impostata per te.",
        screen: {
          header: "Nuova misurazione",
          rows: [
            { label: "Pressione arteriosa", sub: "mmHg", tone: "clay", target: true },
            { label: "Glicemia", sub: "mg/dL" },
            { label: "Peso", sub: "kg" },
            { label: "Saturazione", sub: "%" },
          ],
        },
      },
      {
        n: 3,
        caption: "Inserisci i valori",
        detail: "Sistolica, diastolica e battito. Data e ora si compilano da sole.",
        screen: {
          header: "Pressione",
          bigLabel: "SISTOLICA / DIASTOLICA",
          bigValue: "128 / 82",
          rows: [
            { label: "Battito: 72 bpm", sub: "Opzionale" },
            { label: "Oggi, 09:15", sub: "Modifica data e ora", target: true },
          ],
          cta: "Salva misurazione",
        },
      },
      {
        n: 4,
        caption: "Leggi grafici e trend",
        detail: "Media mobile e variazione rispetto alla settimana precedente.",
        screen: {
          header: "Andamento",
          sub: "Ultimi 30 giorni",
          rows: [
            { label: "Media 126/80", sub: "Stabile", tone: "sage" },
            { label: "▼ 4 mmHg", sub: "vs settimana scorsa", tone: "sage" },
            { label: "Esporta PDF", sub: "Per il medico curante", target: true },
          ],
        },
      },
    ],
  },

  "faq-report-pdf": {
    chip: "FAQ · Report",
    title: "Come scaricare",
    titleAccent: "il report PDF",
    outro: "PDF pronto!",
    steps: [
      {
        n: 1,
        caption: "Apri «Storico e report»",
        detail: "Tutte le dosi programmate, prese, saltate o dimenticate.",
        screen: {
          header: "Menu",
          rows: [
            { label: "Scorte", sub: "Pillole rimanenti" },
            { label: "Storico e report", sub: "Aderenza e PDF", tone: "sage", target: true },
          ],
        },
      },
      {
        n: 2,
        caption: "Scegli paziente e periodo",
        detail: "7, 30 o 90 giorni: i numeri si aggiornano all'istante.",
        screen: {
          header: "Storico",
          sub: "Mario Rossi",
          rows: [
            { label: "7 giorni", sub: "Ultima settimana" },
            { label: "30 giorni", sub: "Ultimo mese", tone: "sage", target: true },
            { label: "90 giorni", sub: "Ultimo trimestre" },
          ],
        },
      },
      {
        n: 3,
        caption: "Filtra terapie e stati",
        detail: "Puoi includere solo alcuni farmaci o solo le dosi dimenticate.",
        screen: {
          header: "Filtri",
          rows: [
            { label: "Cardioaspirina", sub: "Inclusa", tone: "sage" },
            { label: "Metformina", sub: "Inclusa", tone: "sage" },
            { label: "Solo dimenticate", sub: "Filtro stato", tone: "clay", target: true },
          ],
        },
      },
      {
        n: 4,
        caption: "Scarica il PDF",
        detail: "Riepilogo aderenza, dettaglio giornaliero e breakdown per farmaco.",
        screen: {
          header: "Aderenza",
          bigLabel: "ULTIMI 30 GIORNI",
          bigValue: "94%",
          rows: [
            { label: "78 dosi prese", sub: "5 dimenticate", tone: "sage" },
          ],
          cta: "Scarica PDF",
          tapCta: true,
        },
      },
    ],
  },

  "faq-scorte": {
    chip: "FAQ · Scorte",
    title: "Come gestire",
    titleAccent: "le scorte di farmaci",
    outro: "Non resti mai senza!",
    steps: [
      {
        n: 1,
        caption: "Apri «Scorte»",
        detail: "Ogni terapia ha il suo magazzino di pillole rimanenti.",
        screen: {
          header: "Menu",
          rows: [
            { label: "Terapie", sub: "Farmaci e orari" },
            { label: "Scorte", sub: "Pillole rimanenti", tone: "sage", target: true },
          ],
        },
      },
      {
        n: 2,
        caption: "Registra la confezione",
        detail: "Inserisci quante compresse hai comprato: lo scalo è automatico a ogni dose.",
        screen: {
          header: "Cardioaspirina",
          bigLabel: "RIMANENTI",
          bigValue: "6",
          rows: [{ label: "+ 30 compresse", sub: "Nuova confezione", target: true }],
          cta: "Aggiorna scorta",
        },
      },
      {
        n: 3,
        caption: "Imposta la soglia di avviso",
        detail: "Sotto la soglia ricevi la notifica «scorta in esaurimento».",
        screen: {
          header: "Avvisi",
          rows: [
            { label: "Avvisa sotto 7 dosi", sub: "≈ una settimana", tone: "amber", target: true },
            { label: "Notifica alla famiglia", sub: "Anche ai caregiver", tone: "sage" },
          ],
        },
      },
      {
        n: 4,
        caption: "Ricevi l'avviso in tempo",
        detail: "Hai il tempo di passare in farmacia prima che finiscano.",
        screen: {
          header: "Notifiche",
          rows: [
            { label: "Scorta in esaurimento", sub: "Cardioaspirina · 5 rimaste", tone: "clay" },
            { label: "Segna come riordinata", sub: "Chiudi l'avviso", target: true },
          ],
        },
      },
    ],
  },
};
