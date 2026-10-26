import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";

/**
 * Igiene della sicurezza del database, controllata sul database REALE (non sul codice):
 * se una migrazione futura dimentica la protezione di una tabella, o lascia una funzione
 * privilegiata richiamabile da chiunque, questo test fallisce e dice quale.
 */
const DB_URL = process.env.TEST_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
let c: Client;

beforeAll(async () => {
  c = new Client({ connectionString: DB_URL });
  await c.connect();
});
afterAll(async () => {
  await c.end();
});

const names = (rows: { n: string }[]) => rows.map((r) => r.n);

describe("Igiene sicurezza database", () => {
  it("ogni tabella dello schema public ha la protezione per riga (RLS) attiva", async () => {
    const r = await c.query(`
      SELECT c.relname AS n FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
       WHERE ns.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity ORDER BY 1`);
    expect(names(r.rows), "Tabelle SENZA RLS").toEqual([]);
  });

  it("ogni funzione SECURITY DEFINER dichiara il proprio search_path (anti-dirottamento)", async () => {
    const r = await c.query(`
      SELECT p.proname AS n FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
       WHERE ns.nspname = 'public' AND p.prosecdef
         AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, '{}')) cfg WHERE cfg LIKE 'search_path=%')
       ORDER BY 1`);
    expect(names(r.rows), "Funzioni SECURITY DEFINER senza search_path").toEqual([]);
  });

  it("nessuna funzione SECURITY DEFINER richiamabile da utenti NON autenticati (ruolo anon)", async () => {
    const r = await c.query(`
      SELECT p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' AS n
        FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
       WHERE ns.nspname = 'public' AND p.prosecdef AND p.prorettype <> 'trigger'::regtype
         AND has_function_privilege('anon', p.oid, 'EXECUTE')
       ORDER BY 1`);
    expect(names(r.rows), "Funzioni privilegiate eseguibili da anon (verifica se previsto)").toEqual([]);
  });

  it("il ruolo anon non può scrivere in nessuna tabella dello schema public", async () => {
    const r = await c.query(`
      SELECT c.relname || ':' || priv AS n
        FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace,
             unnest(ARRAY['INSERT','UPDATE','DELETE','TRUNCATE']) priv
       WHERE ns.nspname = 'public' AND c.relkind = 'r' AND has_table_privilege('anon', c.oid, priv)
       ORDER BY 1`);
    expect(names(r.rows), "Privilegi di scrittura concessi ad anon").toEqual([]);
  });

  it("tutti i bucket di Storage sono privati", async () => {
    const r = await c.query(`SELECT id AS n FROM storage.buckets WHERE public ORDER BY 1`);
    expect(names(r.rows), "Bucket pubblici").toEqual([]);
  });
});
