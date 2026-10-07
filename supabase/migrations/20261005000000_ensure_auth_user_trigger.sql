-- ============================================================
-- Allinea le migrazioni al database online: il trigger che crea profilo, ruolo e
-- scheda caregiver quando nasce un utente (on_auth_user_created su auth.users)
-- esiste online ma NON era nelle migrazioni, quindi un database ricostruito da
-- zero (locale, nuovo progetto, ripristino) non lo aveva.
--
-- Idempotente: se il trigger esiste già (come online) non viene toccato.
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'on_auth_user_created'
      AND tgrelid = 'auth.users'::regclass
      AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
  END IF;
END $$;