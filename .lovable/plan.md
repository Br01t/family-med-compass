## Piano di intervento

1. **Flusso notifiche terapia in 3 momenti**
   - Generare notifiche per ogni dose:
     - promemoria prima dell’orario configurato della terapia;
     - avviso all’orario esatto con azioni paziente “Conferma” e “Rimanda”;
     - avviso dopo il tempo massimo se non c’è stata azione, marcando la dose come dimenticata.
   - Il testo dell’ultimo avviso al paziente indicherà chiaramente che la cura è stata segnata come dimenticata e che potrebbe essere contattato da un familiare.

2. **Caregiver sempre informato**
   - Per ogni promemoria/avviso importante creare anche notifiche dedicate ai caregiver collegati al paziente, così il caregiver vede le stesse tappe senza poter alterare lo stato “letto” del paziente.
   - Quando il paziente conferma, rimanda o salta una dose, mantenere notifiche realtime al caregiver con azione, farmaco, orario e paziente.
   - Se una dose diventa “dimenticata”, notificare sia paziente sia caregiver.

3. **Centro notifiche con azioni corrette**
   - Vista paziente: mostrare solo notifiche proprie, con azioni rapide sulle notifiche “È ora”: conferma, rimanda, segna come letta.
   - Vista caregiver: mostrare notifiche proprie + quelle dei pazienti collegati, con filtri per paziente/categoria/stato e “segna letta” solo per le notifiche del caregiver.
   - Mantenere sincronizzazione realtime letta/non letta e nuove notifiche su più dispositivi.

4. **Push mobile e registrazione dispositivo nelle impostazioni paziente**
   - Rendere la card “Notifiche push & sveglie” più evidente e completa nella vista paziente mobile.
   - Unire in un unico pulsante guidato: richiesta permesso notifiche + registrazione del dispositivo + notifica di prova.
   - Gestire casi mobile: browser non supportato, iOS non installata in Home, permesso negato, service worker non registrato.

5. **Suono/visibilità notifiche**
   - Migliorare la notifica “È ora” come allarme in-app fullscreen con suono/vibrazione quando l’app è aperta.
   - Per app chiusa o telefono bloccato usare Web Push con `requireInteraction`, vibrazione, tag/renotify e apertura diretta alla schermata paziente/notifiche.
   - Nota tecnica: su iOS/Android il suono delle push a schermo bloccato dipende dal sistema operativo e dalle impostazioni dell’utente; l’app può richiedere notifiche persistenti e vibrazione, ma non può forzare sempre un suono personalizzato.

6. **Patch database/permessi**
   - Aggiornare lo script SQL patch esistente con colonne/indici/policy necessari per:
     - notifiche uniche per dose e fase;
     - campi snooze/timeout/post-reminder;
     - RLS: paziente vede/modifica solo proprie notifiche; caregiver vede le proprie e quelle relative ai pazienti collegati, ma modifica solo le proprie notifiche.
   - Allineare scheduler e client alle policy aggiornate.

7. **Verifica**
   - Controllare che la vista paziente mobile mostri il pulsante per abilitare le push.
   - Verificare che il centro notifiche distingua paziente/caregiver.
   - Verificare che le azioni conferma/rimanda aggiornino eventi e notifiche in realtime.