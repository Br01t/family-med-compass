
-- Default & backfill soglia scorte a 10
ALTER TABLE public.therapies ALTER COLUMN low_stock_threshold SET DEFAULT 10;
UPDATE public.therapies SET low_stock_threshold = 10 WHERE low_stock_threshold IS NULL OR low_stock_threshold < 10;

-- Aggiorna handle_dose_taken: messaggio con dosi residue + severity warning
CREATE OR REPLACE FUNCTION public.handle_dose_taken()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_therapy public.therapies%rowtype;
  v_patient public.patients%rowtype;
  v_caregiver uuid;
  v_remaining int;
begin
  if new.status<>'taken' or coalesce(old.status,'')='taken' then return new; end if;
  select * into v_therapy from public.therapies where id=new.therapy_id;
  if not found then return new; end if;
  select * into v_patient from public.patients where id=new.patient_id;

  update public.therapies
    set pills_remaining=greatest(0, pills_remaining-coalesce(v_therapy.quantity,1))
    where id=new.therapy_id
    returning pills_remaining into v_remaining;

  insert into public.stock_movements (therapy_id, delta, reason, event_id)
    values (new.therapy_id, -coalesce(v_therapy.quantity,1), 'intake', new.id);

  -- Notifica caregiver: dose confermata
  for v_caregiver in select caregiver_id from public.caregiver_patients where patient_id=new.patient_id loop
    insert into public.notifications (target_user_id, kind, severity, title, message, patient_id, therapy_id, event_id, dose_key)
    values (v_caregiver, 'taken', 'info',
      v_patient.name||' ha preso '||v_therapy.name,
      'Confermata alle '||to_char(new.confirmed_at at time zone 'Europe/Rome','HH24:MI'),
      new.patient_id, new.therapy_id, new.id,
      new.therapy_id||'@'||new.scheduled_at::text||'@taken')
    on conflict do nothing;
  end loop;

  -- Notifica scorta bassa (una volta al giorno per terapia)
  if v_remaining <= coalesce(v_therapy.low_stock_threshold, 10) then
    for v_caregiver in select caregiver_id from public.caregiver_patients where patient_id=new.patient_id loop
      insert into public.notifications (target_user_id, kind, severity, title, message, patient_id, therapy_id, dose_key)
      values (v_caregiver, 'low_stock', 'warning',
        'Scorta bassa: '||v_therapy.name,
        'Restano '||v_remaining||' dosi per '||v_patient.name||'. Programma il riordino.',
        new.patient_id, new.therapy_id,
        new.therapy_id||'@lowstock@'||to_char(now(),'YYYY-MM-DD'))
      on conflict do nothing;
    end loop;
  end if;
  return new;
end;
$function$;

-- Assicura che il trigger esista (finora la funzione era definita ma non collegata)
DROP TRIGGER IF EXISTS trg_dose_taken ON public.events;
CREATE TRIGGER trg_dose_taken
AFTER INSERT OR UPDATE OF status ON public.events
FOR EACH ROW EXECUTE FUNCTION public.handle_dose_taken();
