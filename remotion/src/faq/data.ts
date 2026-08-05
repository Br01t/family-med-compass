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
        caption: "Compila i dati del farmaco",
        detail:
          "Paziente, nome farmaco, dosaggio, categoria e unità per dose: gli stessi campi della modale «Nuova terapia».",
        screen: {
          header: "Terapie",
          form: {
            title: "Nuova terapia",
            sub: "Farmaco, orari e scorte",
            fields: [
              { label: "Paziente", value: "Mario Rossi", kind: "select" },
              { label: "Nome farmaco", value: "Lasix", kind: "input" },
              { label: "Dosaggio", value: "25 mg", kind: "input", target: true },
              { label: "Categoria", value: "Cardiologico", kind: "select" },
            ],
          },
        },
      },
      {
        n: 4,
        caption: "Orari, ricorrenza e promemoria",
        detail:
          "Aggiungi fino a 6 orari, scegli la ricorrenza e decidi quanti minuti prima e dopo far scattare gli avvisi.",
        screen: {
          header: "Terapie",
          form: {
            title: "Orari e promemoria",
            fields: [
              { label: "Orari di assunzione", value: "08:00 · 13:00", kind: "time" },
              { label: "Ricorrenza", value: "Ogni giorno", kind: "select", target: true },
              { label: "Avviso prima della dose", value: "15 minuti prima", kind: "select" },
              { label: "Avviso post se non confermata", value: "60 minuti", kind: "select" },
            ],
          },
        },
      },
      {
        n: 5,
        caption: "Scorte, date e salva",
        detail:
          "Imposta pillole per confezione, soglia di allerta e data inizio: poi salva, la terapia è già attiva.",
        screen: {
          header: "Terapie",
          form: {
            title: "Scorte e periodo",
            fields: [
              { label: "Unità per dose", value: "1 compressa", kind: "input" },
              { label: "Pillole/confezione · N° confezioni", value: "30 × 1", kind: "input" },
              { label: "Soglia allerta scorte", value: "7 dosi", kind: "input" },
              { label: "Data inizio", value: "Oggi", kind: "select" },
            ],
          },
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
        caption: "Compila l'invito",
        detail:
          "Scegli il ruolo, il livello di permessi e la scadenza del codice: sono i campi della modale «Nuovo invito».",
        screen: {
          header: "Gruppo di cura",
          form: {
            title: "Nuovo invito",
            sub: "Chi entra nel gruppo di cura",
            fields: [
              { label: "Nome (facoltativo)", value: "Giulia", kind: "input" },
              { label: "Relazione", value: "Sorella", kind: "select" },
              { label: "Ruolo", value: "Caregiver secondario", kind: "select", target: true },
              { label: "Scadenza codice", value: "7 giorni", kind: "select" },
            ],
          },
          cta: "Crea invito",
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
        detail:
          "All'orario stabilito il telefono suona: vedi farmaco, dose e il countdown prima che diventi dimenticata.",
        screen: {
          header: "Promemoria",
          bigLabel: "ORA",
          bigValue: "08:00",
          rows: [
            { label: "Cardioaspirina 100mg", sub: "1 compressa", tone: "clay" },
            { label: "Scade tra 59:12", sub: "Poi risulta dimenticata", tone: "amber" },
          ],
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
        caption: "Non ora? Rimanda o salta",
        detail:
          "«Rimanda» è disponibile una volta sola e sposta la dose del tempo previsto dalla terapia. Se salti, indichi il motivo.",
        screen: {
          header: "Cardioaspirina",
          form: {
            title: "Cosa vuoi fare?",
            sub: "Dose delle 08:00",
            fields: [
              { label: "Azione", value: "Rimanda una volta", kind: "select", target: true },
              { label: "Nuovo orario", value: "08:15", kind: "time" },
              { label: "Motivo (se salti)", value: "Nausea", kind: "select" },
              { label: "Avvisa la famiglia", value: "Sempre attivo", kind: "toggle" },
            ],
          },
        },
      },
      {
        n: 4,
        caption: "La famiglia lo vede subito",
        detail: "La conferma arriva in tempo reale nella dashboard e nel centro notifiche di chi ti segue.",
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
        detail:
          "Sistolica, diastolica, battito, data/ora e una nota: sono esattamente i campi della modale di registrazione.",
        screen: {
          header: "Parametri vitali",
          form: {
            title: "Pressione arteriosa",
            sub: "Valori in mmHg",
            fields: [
              { label: "Sistolica / Diastolica", value: "128 / 82", kind: "input" },
              { label: "Battito (opzionale)", value: "72 bpm", kind: "input" },
              { label: "Data e ora", value: "Oggi, 09:15", kind: "time", target: true },
              { label: "Nota", value: "A digiuno", kind: "input" },
            ],
          },
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
        detail:
          "Selezioni paziente, periodo, quali farmaci includere e quali stati mostrare: il PDF rispetta gli stessi filtri.",
        screen: {
          header: "Storico e report",
          form: {
            title: "Filtri",
            sub: "Valgono anche per il PDF",
            fields: [
              { label: "Paziente", value: "Mario Rossi", kind: "select" },
              { label: "Periodo", value: "Ultimi 30 giorni", kind: "select" },
              {
                label: "Terapie incluse",
                value: "",
                kind: "chips",
                options: ["Cardioaspirina", "Metformina", "+1"],
              },
              { label: "Stati", value: "Prese · Dimenticate", kind: "select", target: true },
            ],
          },
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
          rows: [{ label: "78 dosi prese", sub: "5 dimenticate", tone: "sage" }],
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
        detail:
          "Pillole per confezione, numero di confezioni e soglia di avviso: lo scarico è automatico a ogni dose confermata.",
        screen: {
          header: "Scorte",
          form: {
            title: "Cardioaspirina 100mg",
            sub: "Aggiorna magazzino",
            fields: [
              { label: "Dosi rimanenti", value: "6", kind: "input" },
              { label: "Pillole per confezione", value: "30", kind: "input", target: true },
              { label: "N° confezioni acquistate", value: "1", kind: "input" },
              { label: "Soglia allerta", value: "7 dosi", kind: "input" },
            ],
          },
          cta: "Aggiorna scorta",
        },
      },
      {
        n: 3,
        caption: "Chi viene avvisato",
        detail: "Sotto la soglia parte la notifica «scorta in esaurimento», anche ai caregiver.",
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
