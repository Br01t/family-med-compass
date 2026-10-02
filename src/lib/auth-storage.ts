// Storage per la sessione Supabase con supporto "resta connesso".
//
// Logica:
// - "Resta connesso" (default) -> la sessione va in localStorage, sopravvive
//   alla chiusura del browser.
// - "Non restare connesso" -> la sessione va in sessionStorage, che il
//   browser stesso svuota alla chiusura dell'ultima scheda/finestra di
//   questo sito. Nessun codice deve "accorgersi" della chiusura: lo fa il
//   browser, quindi funziona anche se l'utente chiude il telefono di colpo,
//   perde la connessione, ecc. (a differenza di un handler su beforeunload,
//   che non è affidabile per operazioni asincrone).
//
// La preferenza va impostata PRIMA di chiamare signInWithPassword /
// signUp, altrimenti la sessione appena creata finisce nel default
// (localStorage) invece che nello storage scelto dall'utente.

const REMEMBER_KEY = "familymed:remember-me";

/** Imposta la preferenza per il PROSSIMO accesso (chiamare prima di signIn). */
export function setRememberMe(remember: boolean) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(REMEMBER_KEY, remember ? "1" : "0");
  } catch {
    // Storage non disponibile (Safari privato con quota 0, ecc.): il default
    // sarà "resta connesso" al prossimo avvio, comportamento preesistente.
  }
}

function getRememberPreference(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const v = window.localStorage.getItem(REMEMBER_KEY);
    return v !== "0"; // default true: comportamento identico a prima di questa modifica
  } catch {
    return true;
  }
}

/** Rimuove la sessione da entrambi gli storage, qualunque sia stato usato. */
export function clearPersistedSession(keyPrefix = "sb-") {
  if (typeof window === "undefined") return;
  for (const store of [window.localStorage, window.sessionStorage]) {
    try {
      const toRemove: string[] = [];
      for (let i = 0; i < store.length; i++) {
        const k = store.key(i);
        if (k && k.startsWith(keyPrefix)) toRemove.push(k);
      }
      toRemove.forEach((k) => store.removeItem(k));
    } catch {
      // ignora: storage non disponibile
    }
  }
}

export function rememberMeAuthStorage() {
  if (typeof window === "undefined") return undefined;

  return {
    getItem: (key: string) => {
      // Al ripristino di una sessione esistente (avvio app) non sappiamo
      // ancora quale storage fu scelto: si controllano entrambi. Solo uno
      // dei due può avere la chiave, l'altro è sempre vuoto per costruzione.
      return window.sessionStorage.getItem(key) ?? window.localStorage.getItem(key);
    },
    setItem: (key: string, value: string) => {
      if (getRememberPreference()) {
        window.localStorage.setItem(key, value);
        window.sessionStorage.removeItem(key);
      } else {
        window.sessionStorage.setItem(key, value);
        window.localStorage.removeItem(key);
      }
    },
    removeItem: (key: string) => {
      window.localStorage.removeItem(key);
      window.sessionStorage.removeItem(key);
    },
  };
}