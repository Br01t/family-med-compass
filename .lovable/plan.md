## Obiettivo

1. Garantire che FamilyMed sia installabile come PWA su Android e iOS.
2. Garantire che le notifiche push arrivino anche ad app chiusa (in particolare su cellulare).
3. Ripulire la pagina Impostazioni lasciando solo controlli reali e funzionanti.

---

## 1. PWA installabile su cellulare

Lo scaffolding c'è già (manifest, service worker, icone 192/512/apple-touch, theme-color, viewport). Mancano dettagli che su iOS/Android fanno la differenza:

- Aggiungere in `src/routes/__root.tsx`:
  - `apple-mobile-web-app-capable = yes`, `apple-mobile-web-app-status-bar-style = black-translucent`, `apple-mobile-web-app-title = FamilyMed` (richiesti da iOS per l'installazione "vera").
  - `mobile-web-app-capable = yes` (Android legacy).
- `public/manifest.json`: aggiungere una seconda icona 512 con `purpose: "maskable"` separata da quella `any` (Chrome preferisce icone dedicate). Aggiungere `id: "/"` e `scope: "/"` per stabilità del prompt di installazione.
- In `public/sw.js`: aggiungere fallback offline pulito e assicurare che l'`activate` non elimini la cache push. Nessuna azione lato utente.
- Nuova card **"Installa app"** in Impostazioni che:
  - intercetta l'evento `beforeinstallprompt` (Android/desktop Chrome) e mostra il pulsante "Installa FamilyMed";
  - su iOS Safari (dove il prompt non esiste) mostra istruzioni: *Condividi → Aggiungi a Home*;
  - se già installata (`display-mode: standalone`) mostra "App installata ✓" e nasconde il pulsante.

## 2. Notifiche push affidabili ad app chiusa

L'infrastruttura Web Push (VAPID + `push-sender` + `push_subscriptions` + `sw.js`) esiste. Le criticità da chiudere:

- **iOS**: le Web Push funzionano solo se l'app è **installata come PWA dalla schermata Home** (Safari 16.4+). Il flusso in Impostazioni verrà riscritto in step obbligati e visibili:
  1. Installa la PWA (se non installata → bottone/istruzioni sopra).
  2. Concedi permesso notifiche.
  3. Registra questo dispositivo per le push.
  Ogni step si sblocca solo quando il precedente è completato, con stato "✓ Fatto / In attesa / Non supportato".
- **Diagnostica visibile all'utente**: mostrare in Impostazioni una riga di stato per dispositivo con: PWA installata sì/no, permesso notifiche, subscription registrata sul server (query a `push_subscriptions` filtrata per `user_id` + endpoint corrente), pulsante "Invia notifica di test" che chiama `push-sender` con un payload demo verso il proprio user_id — così l'utente verifica che arrivi anche a schermo bloccato.
- **Service worker**: garantire `requireInteraction: true`, `renotify: true`, `tag` per non-duplicare, e `notificationclick` che apre `/notifiche` (già in gran parte presente — verifico e correggo se serve).
- **`push-sender`**: già cancella le subscription scadute (410/404). Verifico che sia effettivamente il caso e aggiungo log lato client se `subscribeToPush` fallisce.

## 3. Pulizia Impostazioni

Attualmente la pagina contiene:
- ✅ Profilo & Account (login/register/logout) — **mantenere**.
- ❌ Card "Sistema" (fuso orario, lingua, tema, volume reminder) — sono valori read-only da `data.settings` mai modificabili → **rimuovere**.
- ❌ Card "Preferenze notifiche" con 5 Switch (`Push`, `Email`, `WhatsApp Business`, `Alert timeout`, `Alert scorte basse`) — tutti `defaultChecked` senza handler, non fanno nulla → **rimuovere**.
- ✅ Card "Sveglie & notifiche push" (NotificationsCard) — **mantenere e potenziare** (vedi §2).
- ⚠️ Card "Database & Dati" — mostrata solo se non loggato con bottone "Ripristina dati demo". Utente loggato vede solo un messaggio informativo. **Mantenere solo il messaggio per utente loggato**; rimuovere il ramo demo (l'app è ormai su Cloud reale).

Nuova struttura finale della pagina, in ordine:
1. **Profilo & Account** (invariato).
2. **Installa app** (nuova, §1).
3. **Notifiche push & sveglie** (riscritta a step, §2, con "Invia notifica di test").
4. **Info sincronizzazione** (riga singola: "Dati sincronizzati sul cloud in tempo reale").

## File toccati

- `src/routes/__root.tsx` — meta iOS/Android extra.
- `public/manifest.json` — icona maskable dedicata, `id`, `scope`.
- `public/sw.js` — verifica handler `push` / `notificationclick` (fix minore se serve).
- `src/routes/impostazioni.tsx` — rimozione card inutili, nuova UI "Installa app" + push a step + test push.
- `src/lib/push-subscription.ts` — piccola API `isSubscribed(userId)` per lo stato "registrato sul server".
- (nessuna nuova migrazione DB, nessun nuovo secret)

## Fuori scopo

- Non tocco business logic terapie/dosi/scheduler.
- Non tocco design system, tema o layout globale.
- Non aggiungo canali Email/WhatsApp (rimossi perché non implementati; se li vorrai in futuro li ricostruiamo veri).
