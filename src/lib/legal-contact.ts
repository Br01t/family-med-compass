// Dati del Titolare del trattamento, centralizzati qui per essere aggiornati
// in un unico punto invece che duplicati in privacy.tsx, cookie.tsx,
// registrati.tsx, impostazioni.tsx, ecc.
//
// ⚠️ FAC-SIMILE: sostituire con i dati reali prima di pubblicare l'app.
// Vedi anche src/routes/privacy.tsx, sezione 1, per i campi ragione
// sociale / P.IVA / sede che restano testo libero nel documento legale.

export const LEGAL_CONTACT = {
  /** Email operativa per richieste privacy/supporto — usata nei link "mailto:" dell'app. */
  privacyEmail: "privacy@tuodominio.it", // TODO: sostituire con la tua email reale
} as const;