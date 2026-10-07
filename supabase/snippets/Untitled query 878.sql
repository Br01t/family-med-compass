select
  (select max(version) from supabase_migrations.schema_migrations) as ultima_migrazione,
  (select proconfig::text from pg_proc where proname = 'create_family_invite') as search_path_funzione,
  (select extnamespace::regnamespace::text from pg_extension where extname = 'pgcrypto') as schema_pgcrypto,
  (select count(*) from pg_proc where proname = 'gen_random_bytes') as funzioni_gen_random_bytes;