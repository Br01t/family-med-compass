Piano di intervento:

1. Correggere il crash del form terapia
   - Sostituire l’uso errato di `FormLabel` fuori da `FormField` nella sezione “Orari di assunzione”.
   - Verificare che tutte le altre label del dialog siano dentro il contesto corretto.

2. Rendere completa la creazione terapia lato caregiver
   - Mantenere obbligatori: paziente, nome farmaco, dosaggio/descrizione, quantità, orari, frequenza, durata, scorte e foto.
   - Rendere più chiari i campi “durata” e “frequenza” nel dialog.
   - Salvare correttamente foto farmaco e foto confezione insieme alla terapia.
   - Bloccare il salvataggio con messaggio chiaro se non ci sono pazienti assegnati.

3. Gestire gli avvisi collegati alla terapia
   - Aggiungere nel form un campo esplicito per l’avviso prima dell’assunzione, es. 10/15/30/60 minuti prima.
   - Salvare questo valore in `reminderIntervals` con semantica coerente: minuti prima dell’orario.
   - Usare `timeoutMinutes` come finestra post-assunzione: se il paziente non conferma entro quel tempo, l’assunzione diventa “non confermata/in ritardo”.

4. Allineare notifiche e timeline paziente
   - Aggiornare la logica locale delle notifiche per usare il valore scelto dal caregiver, non un valore fisso.
   - Mantenere la notifica “è ora” all’orario esatto della dose.
   - Mantenere l’avviso post se la dose non viene confermata entro il timeout.
   - Aggiornare anche lo scheduler server-side per rispettare il reminder configurato sulla terapia invece del valore fisso a 10 minuti.

5. Migliorare salvataggio e aggiornamento terapia
   - Evitare che la creazione nuova dipenda da un upsert non necessario quando possibile.
   - Lasciare l’update per la modifica terapia.
   - Restituire errori leggibili se il caregiver non è collegato al paziente o se mancano permessi.

6. Verifica finale
   - Aprire il dialog “Nuova terapia” senza crash.
   - Creare una terapia con paziente, nome, descrizione/dosaggio, frequenza, durata, foto e avvisi.
   - Verificare che la terapia compaia nella vista paziente con timeline, riepilogo e azioni all’orario corretto.