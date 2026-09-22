# Procedura di Cancellazione dei Dati e Diritto all'Oblio
**Progetto:** FamilyMed  
**Riferimento normativo:** Art. 17 Regolamento (UE) 2016/679 (GDPR)  
**Data ultimo aggiornamento:** 14 Settembre 2026  
**Stato:** Documentazione tecnica di audit interno  

---

## 1. Ambito e Obiettivi

L'art. 17 del GDPR riconosce all'interessato il **Diritto alla Cancellazione («diritto all'oblio»)**, ossia il diritto di ottenere dal Titolare del trattamento la cancellazione dei dati personali che lo riguardano senza ingiustificato ritardo.

In FamilyMed questo diritto è implementato secondo due modalità:
1. **Modalità Self-Service (In-App Immediata):** Azionabile autonomamente dall'utente con un clic e doppia conferma all'interno dell'app;
2. **Modalità Manuale (Su Richiesta):** Ricevuta via email ordinaria o PEC all'indirizzo del Titolare.

---

## 2. Flusso Self-Service In-App (Procedura Tecnica)

### 2.1 Interfaccia Utente (`src/components/AccountDataCard.tsx`)
Per evitare cancellazioni accidentali di dati salvavita, l'interfaccia adotta un pattern di sicurezza a più livelli:
1. L'utente accede alla sezione **Impostazioni → Gestione Dati e Privacy**;
2. Clicca sul pulsante **"Elimina account e tutti i dati"**;
3. Si apre un modale di allerta che descrive chiaramente la totale irreversibilità dell'azione;
4. L'utente deve:
   - Spuntare la casella *"Confermo di voler eliminare definitivamente il mio account e tutti i dati sanitari collegati"*;
   - Digitare manualmente la parola di conferma esatta: **`ELIMINA`**;
5. Solo a questo punto il pulsante rosso di conferma diventa attivo.

---

### 2.2 Esecuzione nel Database: La RPC `delete_my_account()`
La logica di eliminazione è incapsulata in una stored procedure PostgreSQL con privilegi elevati (`SECURITY DEFINER` con owner `postgres`), garantendo l'esecuzione atomica in transazione unica:

```sql
CREATE OR REPLACE FUNCTION public.delete_my_account()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_patient_id text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Non autenticato' USING ERRCODE = '42501';
  END IF;

  -- 1. Traccia l'evento di cancellazione nel log GDPR
  PERFORM public.log_gdpr_event('account_deleted');

  -- 2. Elimina notifiche indirizzate all'utente
  DELETE FROM public.notifications WHERE target_user_id = v_uid;

  -- 3. Elimina codici invito generati o riscattati dall'utente
  DELETE FROM public.family_invites WHERE created_by = v_uid OR used_by = v_uid;

  -- 4. Rimuove l'utente come caregiver da qualsiasi paziente altrui
  DELETE FROM public.caregiver_patients WHERE caregiver_id = v_uid;

  -- 5. Per tutti i pazienti di proprietà dell'utente (owner):
  FOR v_patient_id IN
    SELECT id FROM public.patients
    WHERE user_id = v_uid OR owner_user_id = v_uid
  LOOP
    DELETE FROM public.stock_movements WHERE therapy_id IN (SELECT id FROM public.therapies WHERE patient_id = v_patient_id);
    DELETE FROM public.events WHERE patient_id = v_patient_id;
    DELETE FROM public.therapies WHERE patient_id = v_patient_id;
    DELETE FROM public.caregiver_patients WHERE patient_id = v_patient_id;
    DELETE FROM public.family_invites WHERE patient_id = v_patient_id;
    DELETE FROM public.notifications WHERE patient_id = v_patient_id;
    DELETE FROM public.patients WHERE id = v_patient_id; 
    -- (I record collegati in medical_profiles, vital_signs, wellness_notes sono eliminati via ON DELETE CASCADE)
  END LOOP;

  -- 6. Gestione pazienti senza owner in cui era primary caregiver
  FOR v_patient_id IN
    SELECT id FROM public.patients
    WHERE owner_user_id IS NULL AND primary_caregiver_id = v_uid
  LOOP
    IF NOT EXISTS (SELECT 1 FROM public.caregiver_patients WHERE patient_id = v_patient_id) THEN
      DELETE FROM public.patients WHERE id = v_patient_id;
    ELSE
      UPDATE public.patients SET primary_caregiver_id = NULL WHERE id = v_patient_id;
    END IF;
  END LOOP;

  -- 7. Elimina ruoli, anagrafica caregiver e profilo utente
  DELETE FROM public.user_roles WHERE user_id = v_uid;
  DELETE FROM public.caregivers WHERE id = v_uid;
  DELETE FROM public.profiles WHERE id = v_uid;

  -- 8. Elimina la riga dei consensi
  DELETE FROM public.user_consents WHERE user_id = v_uid;

  -- 9. Elimina definitivamente l'utente da Supabase Auth (auth.users)
  DELETE FROM auth.users WHERE id = v_uid;
END;
$$;
```

---

### 2.3 Post-Esecuzione sul Client
Appena la RPC si conclude con successo:
1. Viene invocato `supabase.auth.signOut({ scope: "global" })` per invalidare i token su tutti i dispositivi;
2. Viene invocato `resetDemoData()` / pulizia del `localStorage` per azzerare la cache locale del browser;
3. Il router reindirizza l'utente alla Landing Page pubblica con messaggio toast di avvenuta eliminazione.

---

## 3. Flusso di Cancellazione Manuale (Richiesta via Email / PEC)

Qualora l'interessato non riesca ad accedere all'app o invii formale richiesta scritta via email a `privacy@familymed.it` o PEC:

1. **Verifica dell'identità del richiedente:**
   - La richiesta deve pervenire dall'indirizzo email associato all'account FamilyMed, oppure corredata da copia del documento d'identità in corso di validità per prevenire cancellazioni dolose da parte di terzi non autorizzati.
2. **Termine di evasione:**
   - Il Titolare deve dare riscontro e provvedere alla cancellazione **entro 30 giorni** dal ricevimento della richiesta (estendibili a 60 in casi di particolare complessità ai sensi dell'art. 12.3 GDPR).
3. **Esecuzione tecnica amministrativa:**
   - L'amministratore esegue l'eliminazione direttamente dalla console di Supabase Auth (`Authentication → Users → Delete User`) oppure tramite script autorizzato con `service_role` key che invoca `delete_my_account()` specificando l'UUID target.
4. **Conferma all'interessato:**
   - Invio di riscontro formale attestante la cancellazione irreversibile di tutti i dati dal sistema di produzione.

---

## 4. Gestione di Backup e Storage Foto (Gap & Best Practices)

### 4.1 Backup di Database (Supabase Automated Backups)
- Il progetto FamilyMed è oggi sul piano **Free** di Supabase, che **non include alcun backup automatico né Point-in-Time Recovery**: questo canale di conservazione residua non esiste allo stato attuale. Se in futuro si passasse al piano Pro, i backup giornalieri tornerebbero disponibili con una retention di default di 7 giorni (configurabile), e questa sezione andrebbe aggiornata di conseguenza.
- I dati eliminati in produzione **non vengono ripristinati**, ma decadono naturalmente allo scadere del periodo di rotazione dei backup.
- *Presidio GDPR:* Qualora si rendesse necessario un ripristino da backup per motivi di disaster recovery, è istituita la procedura di ri-applicazione del log delle cancellazioni (`log_gdpr_event`) per eliminare nuovamente gli utenti che avevano esercitato l'oblio prima del restore.

### 4.2 File Storage Immagini (`therapy-photos`)
- **Evidenza tecnica attuale:** I file fisici caricati nel bucket Supabase Storage non vengono eliminati in automatico quando la riga di `therapies` viene cancellata via SQL.
- **Azione richiesta:** Implementare una Edge Function o un trigger Storage che, prima di confermare la cancellazione della terapia, invochi `supabase.storage.from('therapy-photos').remove(...)` per eliminare fisicamente i file dal bucket S3/Storage.