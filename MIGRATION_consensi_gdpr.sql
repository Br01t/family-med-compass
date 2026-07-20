-- =====================================================================
-- MIGRATION: registrazione dei consensi GDPR (art. 7.1 - accountability)
-- Da lanciare nell'SQL Editor del TUO Supabase. Idempotente.
-- =====================================================================
--
-- Tiene traccia di CHI ha accettato COSA e QUANDO, come richiesto dal
-- GDPR per poter dimostrare il consenso in caso di controllo.
--
-- Il consenso ai dati sanitari (art. 9.2.a GDPR) è separato da quello ai
-- Termini/Privacy: sono due basi giuridiche distinte.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.user_consents (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind         text NOT NULL CHECK (kind IN ('terms_privacy', 'health_data')),
  version      text NOT NULL DEFAULT '2026-07-20',
  granted      boolean NOT NULL,
  granted_at   timestamptz NOT NULL DEFAULT now(),
  revoked_at   timestamptz,
  user_agent   text,
  ip_hash      text
);

CREATE INDEX IF NOT EXISTS user_consents_user_kind_idx
  ON public.user_consents (user_id, kind, granted_at DESC);

GRANT SELECT, INSERT ON public.user_consents TO authenticated;
GRANT ALL          ON public.user_consents TO service_role;

ALTER TABLE public.user_consents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user reads own consents"   ON public.user_consents;
DROP POLICY IF EXISTS "user inserts own consents" ON public.user_consents;

CREATE POLICY "user reads own consents"
  ON public.user_consents FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "user inserts own consents"
  ON public.user_consents FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- RPC per revocare un consenso dalle impostazioni utente
CREATE OR REPLACE FUNCTION public.revoke_my_consent(_kind text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.user_consents
    SET revoked_at = now()
    WHERE user_id = auth.uid()
      AND kind = _kind
      AND revoked_at IS NULL;
$$;

REVOKE ALL ON FUNCTION public.revoke_my_consent(text) FROM public;
GRANT EXECUTE ON FUNCTION public.revoke_my_consent(text) TO authenticated;
