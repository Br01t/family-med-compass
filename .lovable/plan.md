## Obiettivo
Rendere completo il centro notifiche in-app (paziente + caregiver), notificare al caregiver anche le azioni del paziente (confermata / rimandata / saltata / dimenticata / scorta bassa), e far apparire il contatore "Alert attivi" nella dashboard caregiver — che torna a 0 quando le notifiche vengono viste in `/notifiche`.

## Diagnosi
- Il centro notifiche legge già `notifications` con realtime (`subscribeNotifications`) e auto-marca lette all'apertura di `/notifiche`.
- Il badge "Alert attivi" già mostra `notifications.filter(n => !n.read && n.severity !== "info").length`, quindi torna a 0 dopo l'apertura del centro notifiche.
- La funzione `handle_dose_taken` esiste nel DB **ma non ha un trigger collegato** (`db-triggers: There are no triggers`) → nessuna notifica di "confermata" e "scorta bassa" viene mai generata.
- Non esiste alcuna logica DB per notificare al caregiver quando il paziente **rimanda** o **salta** una dose (le azioni oggi aggiornano solo `events` lato client).
- Le notifiche `missed` e le `reminder_pre / due / reminder_post / final_due` sono già generate dalla edge `dose-scheduler` → basta assicurarsi che il cron sia attivo.

## Cosa cambia lato codice (frontend)
- `src/routes/caregiver.tsx`: piccolo aggiustamento al calcolo "Alert attivi" per includere esplicitamente i `kind` che contano come alert (`missed`, `final_due`, `snoozed`, `skipped`, `low_stock`, `reminder_post`) invece di basarsi solo su `severity !== "info"`, così il numero è coerente con la richiesta.
- Nessun'altra modifica: subscribe realtime + auto-mark-read già funzionano.

## Cosa devi eseguire sul tuo DB Supabase esterno

### 1) Migration SQL — trigger sulle azioni delle dosi
Da eseguire una volta nell'SQL editor. È idempotente.

```sql
-- A) Trigger per "taken" (usa la funzione handle_dose_taken già esistente)
DROP TRIGGER IF EXISTS trg_dose_taken ON public.events;
CREATE TRIGGER trg_dose_taken
AFTER UPDATE OF status ON public.events
FOR EACH ROW
WHEN (NEW.status = 'taken' AND (OLD.status IS DISTINCT FROM 'taken'))
EXECUTE FUNCTION public.handle_dose_taken();

-- B) Nuova funzione: notifica caregiver su snoozed / skipped / missed
CREATE OR REPLACE FUNCTION public.handle_dose_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_therapy public.therapies%rowtype;
  v_patient public.patients%rowtype;
  v_caregiver uuid;
  v_kind text; v_sev text; v_title text; v_msg text;
BEGIN
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;
  IF NEW.status NOT IN ('snoozed','skipped','missed') THEN RETURN NEW; END IF;

  SELECT * INTO v_therapy FROM public.therapies WHERE id = NEW.therapy_id;
  SELECT * INTO v_patient FROM public.patients  WHERE id = NEW.patient_id;

  IF NEW.status = 'snoozed' THEN
    v_kind := 'snoozed'; v_sev := 'warning';
    v_title := v_patient.name || ' ha rimandato ' || v_therapy.name;
    v_msg   := 'Dose delle ' || to_char(NEW.scheduled_at AT TIME ZONE 'Europe/Rome','HH24:MI') || ' rimandata.';
  ELSIF NEW.status = 'skipped' THEN
    v_kind := 'skipped'; v_sev := 'alert';
    v_title := v_patient.name || ' ha saltato ' || v_therapy.name;
    v_msg   := 'Dose delle ' || to_char(NEW.scheduled_at AT TIME ZONE 'Europe/Rome','HH24:MI') || ' rifiutata.';
  ELSE  -- missed
    v_kind := 'missed'; v_sev := 'alert';
    v_title := v_patient.name || ' non ha preso ' || v_therapy.name;
    v_msg   := 'Dose delle ' || to_char(NEW.scheduled_at AT TIME ZONE 'Europe/Rome','HH24:MI') || ' dimenticata.';
  END IF;

  FOR v_caregiver IN
    SELECT caregiver_id FROM public.caregiver_patients WHERE patient_id = NEW.patient_id
  LOOP
    INSERT INTO public.notifications
      (target_user_id, kind, severity, title, message, patient_id, therapy_id, event_id, dose_key)
    VALUES
      (v_caregiver, v_kind, v_sev, v_title, v_msg,
       NEW.patient_id, NEW.therapy_id, NEW.id,
       NEW.therapy_id || '@' || NEW.scheduled_at::text || '@' || v_kind || '@cg@' || v_caregiver)
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- Eco al paziente (per storico personale) solo su skipped/missed
  IF NEW.status IN ('skipped','missed') AND v_patient.user_id IS NOT NULL THEN
    INSERT INTO public.notifications
      (target_user_id, kind, severity, title, message, patient_id, therapy_id, event_id, dose_key)
    VALUES
      (v_patient.user_id, v_kind, v_sev,
       CASE WHEN NEW.status='missed' THEN 'Cura dimenticata: '||v_therapy.name
            ELSE 'Hai saltato '||v_therapy.name END,
       'Dose delle ' || to_char(NEW.scheduled_at AT TIME ZONE 'Europe/Rome','HH24:MI'),
       NEW.patient_id, NEW.therapy_id, NEW.id,
       NEW.therapy_id || '@' || NEW.scheduled_at::text || '@' || v_kind || '@patient')
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_dose_status_change ON public.events;
CREATE TRIGGER trg_dose_status_change
AFTER UPDATE OF status ON public.events
FOR EACH ROW
EXECUTE FUNCTION public.handle_dose_status_change();

-- C) Assicura vincolo di deduplica sulle notifiche (necessario per ON CONFLICT)
CREATE UNIQUE INDEX IF NOT EXISTS notifications_dose_key_target_uniq
  ON public.notifications (target_user_id, dose_key)
  WHERE dose_key IS NOT NULL;
```

### 2) Edge function `dose-scheduler`
Nessuna modifica: la versione già in `supabase/functions/dose-scheduler/index.ts` copre `reminder_pre`, `due`, `reminder_post`, `final_due`, `missed` con `notifyBoth`. Basta essere sicuri che sia deployata.

### 3) Cron job (pg_cron) — ogni minuto
Se non l'hai già impostato o vuoi ricrearlo:

```sql
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.unschedule('dose-scheduler-every-minute')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='dose-scheduler-every-minute');

SELECT cron.schedule(
  'dose-scheduler-every-minute',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://acnkryjihmhwgwnostvs.functions.supabase.co/dose-scheduler',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer <TUO_SUPABASE_ANON_KEY>"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
```

Sostituisci `<TUO_SUPABASE_ANON_KEY>` con la anon key del tuo progetto esterno.

## Risultato atteso
- Paziente: riceve nel centro notifiche `reminder_pre`, `due`, `reminder_post`, `final_due`, `missed`, `skipped` (dai trigger + scheduler).
- Caregiver: riceve `reminder_pre`, `due`, `reminder_post`, `final_due` dallo scheduler + `taken`, `low_stock`, `snoozed`, `skipped`, `missed` dai trigger DB.
- Dashboard caregiver: "Alert attivi" mostra il numero di notifiche non lette rilevanti; aprendo `/notifiche` vengono marcate come lette (già implementato) e il contatore torna a 0 in tempo reale via realtime.
