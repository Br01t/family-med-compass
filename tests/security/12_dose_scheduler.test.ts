import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";
import { createAndAuthenticateUser, getAdminClient } from "../fixtures/seed-test-users";

/**
 * Scheduler delle dosi (process_dose_schedule): il cuore dell'app, eseguito dal cron ogni minuto.
 *
 * Ogni test gira in una TRANSAZIONE ANNULLATA a fine prova (ROLLBACK): ora e minuti sono
 * quelli reali, ma niente resta nel DB e i dati di esempio non vengono toccati.
 * Prima di chiamare la funzione, le dosi "scheduled" della prossima ora di altri dati vengono
 * messe da parte (sempre dentro la transazione) perché la generazione parte solo ogni 15 minuti
 * oppure se non ci sono dosi nella prossima ora.
 *
 * Richiede il Postgres locale: TEST_DB_URL (default postgresql://postgres:postgres@127.0.0.1:54322/postgres).
 */
const DB_URL = process.env.TEST_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const stamp = Date.now();
const admin = getAdminClient();

let ownerId: string;
let patA: string; // con utente collegato (riceve le notifiche)
let patB: string; // senza user_id (nessuna notifica)

async function inTx<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const c = new Client({ connectionString: DB_URL });
  await c.connect();
  try {
    await c.query("BEGIN");
    await c.query(
      `UPDATE public.events SET status = 'skipped'
        WHERE status = 'scheduled' AND scheduled_at BETWEEN now() AND now() + interval '1 hour'`,
    );
    return await fn(c);
  } finally {
    await c.query("ROLLBACK").catch(() => {});
    await c.end();
  }
}

/** Orario locale di Roma tra 2 ore: stringa HH:MM, data (testo) e giorno della settimana (0=dom). */
async function targetInTwoHours(c: Client) {
  const r = await c.query(`
    SELECT to_char((now() + interval '2 hours') AT TIME ZONE 'Europe/Rome', 'HH24:MI') AS hhmm,
           ((now() + interval '2 hours') AT TIME ZONE 'Europe/Rome')::date::text AS d,
           extract(dow FROM ((now() + interval '2 hours') AT TIME ZONE 'Europe/Rome'))::int AS dow`);
  return r.rows[0] as { hhmm: string; d: string; dow: number };
}

async function addTherapy(
  c: Client,
  id: string,
  patientId: string,
  o: {
    times?: string[]; recurrence?: object; startOffsetDays?: number;
    endOffsetDays?: number; active?: boolean; suspended?: boolean; timeout?: number; baseDate?: string;
  } = {},
) {
  const base = o.baseDate ?? (await c.query(`SELECT (now() AT TIME ZONE 'Europe/Rome')::date::text AS d`)).rows[0].d;
  await c.query(
    `INSERT INTO public.therapies
       (id, patient_id, name, dosage, times, recurrence, start_date, end_date, active, suspended_at, timeout_minutes)
     VALUES ($1, $2, $1, '10 mg', $3::text[], $4::jsonb,
             $5::date + $6::int,
             CASE WHEN $7::int IS NULL THEN NULL ELSE $5::date + $7::int END,
             $8::boolean,
             CASE WHEN $9::boolean THEN now() ELSE NULL END,
             $10::int)`,
    [
      `${id}_${stamp}`, patientId, o.times ?? [], JSON.stringify(o.recurrence ?? { kind: "daily" }),
      base, o.startOffsetDays ?? -1, o.endOffsetDays ?? null, o.active ?? true, o.suspended ?? false, o.timeout ?? 180,
    ],
  );
  return `${id}_${stamp}`;
}

async function eventsOf(c: Client, therapyId: string) {
  return (await c.query(`SELECT id, status, scheduled_at FROM public.events WHERE therapy_id = $1`, [therapyId])).rows;
}

beforeAll(async () => {
  const owner = await createAndAuthenticateUser(`sched_owner_${stamp}@test.local`, "Password123!", "caregiver", "Sched Owner");
  ownerId = owner.userId;
  await admin.from("profiles").update({ subscription_plan_own: "pro" }).eq("id", ownerId);
  patA = `p_sched_a_${stamp}`;
  patB = `p_sched_b_${stamp}`;
  const a = await admin.from("patients").insert({ id: patA, name: "Sched A", birth_year: 1950, user_id: ownerId, owner_user_id: ownerId, primary_caregiver_id: ownerId });
  const b = await admin.from("patients").insert({ id: patB, name: "Sched B", birth_year: 1950, owner_user_id: ownerId, primary_caregiver_id: ownerId });
  if (a.error || b.error) throw new Error(`seed pazienti: ${a.error?.message ?? b.error?.message}`);
}, 60000);

afterAll(async () => {
  await admin.from("patients").delete().in("id", [patA, patB]);
  await admin.auth.admin.deleteUser(ownerId).catch(() => {});
});

describe("Scheduler dosi — generazione", () => {
  it("genera la dose all'ora di Roma digitata dall'utente (fuso corretto) ed è idempotente", async () => {
    await inTx(async (c) => {
      const t = await targetInTwoHours(c);
      const id = await addTherapy(c, "t_daily", patA, { times: [t.hhmm] });

      await c.query("SELECT public.process_dose_schedule()");
      const ev = await eventsOf(c, id);
      expect(ev).toHaveLength(1);
      expect(ev[0].status).toBe("scheduled");

      const chk = await c.query(
        `SELECT to_char(scheduled_at AT TIME ZONE 'Europe/Rome', 'HH24:MI') AS local,
                abs(extract(epoch FROM (scheduled_at - (now() + interval '2 hours')))) AS diff_s
           FROM public.events WHERE therapy_id = $1`, [id]);
      expect(chk.rows[0].local).toBe(t.hhmm);          // l'ora che l'utente ha scelto
      expect(Number(chk.rows[0].diff_s)).toBeLessThanOrEqual(60); // ...nell'istante giusto

      await c.query("SELECT public.process_dose_schedule()");
      expect(await eventsOf(c, id)).toHaveLength(1);   // nessun duplicato
    });
  }, 30000);

  it("ricorrenze: solo nei giorni giusti (specific_days, weekdays, weekend, every_x_days)", async () => {
    await inTx(async (c) => {
      const t = await targetInTwoHours(c);
      const mk = (n: string, recurrence: object, startOffsetDays = -1) =>
        addTherapy(c, n, patA, { times: [t.hhmm], recurrence, startOffsetDays, baseDate: t.d });

      const specOk = await mk("t_spec_ok", { kind: "specific_days", days: [t.dow] });
      const specNo = await mk("t_spec_no", { kind: "specific_days", days: [(t.dow + 1) % 7] });
      const wd = await mk("t_wd", { kind: "weekdays" });
      const we = await mk("t_we", { kind: "weekend" });
      const xOn = await mk("t_x_on", { kind: "every_x_days", x: 2 }, -4);  // 4 giorni fa: oggi è in ciclo
      const xOff = await mk("t_x_off", { kind: "every_x_days", x: 2 }, -3); // 3 giorni fa: oggi NON è in ciclo

      await c.query("SELECT public.process_dose_schedule()");

      expect(await eventsOf(c, specOk)).toHaveLength(1);
      expect(await eventsOf(c, specNo)).toHaveLength(0);
      const isWeekday = t.dow >= 1 && t.dow <= 5;
      expect(await eventsOf(c, wd)).toHaveLength(isWeekday ? 1 : 0);
      expect(await eventsOf(c, we)).toHaveLength(isWeekday ? 0 : 1);
      expect(await eventsOf(c, xOn)).toHaveLength(1);
      expect(await eventsOf(c, xOff)).toHaveLength(0);
    });
  }, 30000);

  it("terapie inattive, sospese, terminate, non ancora iniziate o di un paziente sospeso NON generano dosi", async () => {
    await inTx(async (c) => {
      const t = await targetInTwoHours(c);
      const base = { times: [t.hhmm], baseDate: t.d };
      const inactive = await addTherapy(c, "t_inactive", patA, { ...base, active: false });
      const suspended = await addTherapy(c, "t_susp", patA, { ...base, suspended: true });
      const ended = await addTherapy(c, "t_ended", patA, { ...base, startOffsetDays: -5, endOffsetDays: -1 });
      const future = await addTherapy(c, "t_future", patA, { ...base, startOffsetDays: 1 });
      await c.query("UPDATE public.patients SET suspended_at = now() WHERE id = $1", [patB]);
      const patientSusp = await addTherapy(c, "t_patsusp", patB, base);

      await c.query("SELECT public.process_dose_schedule()");

      for (const id of [inactive, suspended, ended, future, patientSusp]) {
        expect(await eventsOf(c, id), `la terapia ${id} non doveva generare dosi`).toHaveLength(0);
      }
    });
  }, 30000);
});

describe("Scheduler dosi — dosi mancate (auto-missed)", () => {
  it("una dose diventa 'missed' dopo il timeout (minimo 30 minuti), non prima", async () => {
    await inTx(async (c) => {
      // active=false: la terapia non genera nuove dosi, ma le dosi già presenti vengono comunque gestite
      const long = await addTherapy(c, "t_to_long", patA, { active: false, timeout: 180 });
      const short = await addTherapy(c, "t_to_short", patA, { active: false, timeout: 5 }); // il minimo è 30
      await c.query(
        `INSERT INTO public.events (id, therapy_id, patient_id, scheduled_at) VALUES
           ('m_old_${stamp}',      $1, $3, now() - interval '4 hours'),
           ('m_recent_${stamp}',   $1, $3, now() - interval '100 minutes'),
           ('m_floor_${stamp}',    $2, $3, now() - interval '50 minutes'),
           ('m_floor_not_${stamp}',$2, $3, now() - interval '20 minutes')`,
        [long, short, patA],
      );
      await c.query("SELECT public.process_dose_schedule()");

      const st = async (id: string) =>
        (await c.query("SELECT status FROM public.events WHERE id = $1", [`${id}_${stamp}`])).rows[0].status;
      expect(await st("m_old")).toBe("missed");
      expect(await st("m_recent")).toBe("scheduled");     // entro il timeout di 180 minuti
      expect(await st("m_floor")).toBe("missed");          // timeout 5 -> si applica il minimo di 30 minuti
      expect(await st("m_floor_not")).toBe("scheduled");   // sono passati solo 20 minuti
    });
  }, 30000);
});

describe("Scheduler dosi — promemoria e notifiche", () => {
  it("crea promemoria prima / all'ora / dopo per l'utente del paziente, senza duplicati", async () => {
    await inTx(async (c) => {
      const th = await addTherapy(c, "t_rem", patA, { active: false });
      await c.query(
        `INSERT INTO public.events (id, therapy_id, patient_id, scheduled_at) VALUES
           ('r_pre_${stamp}',   $1, $2, now() + interval '9 minutes'),
           ('r_exact_${stamp}', $1, $2, now()),
           ('r_post_${stamp}',  $1, $2, now() - interval '11 minutes')`,
        [th, patA],
      );

      // Se la funzione va in errore (es. reminder_intervals trattato come jsonb, o ON CONFLICT
      // senza il predicato dell'indice parziale) questa chiamata lancia e il test fallisce.
      await c.query("SELECT public.process_dose_schedule()");
      await c.query("SELECT public.process_dose_schedule()"); // seconda esecuzione: nessun duplicato

      const n = await c.query(
        `SELECT kind, severity, target_user_id FROM public.notifications
          WHERE event_id LIKE $1 ORDER BY kind`, [`%_${stamp}`]);
      expect(n.rows.map((r) => r.kind)).toEqual(["dose_reminder_exact", "dose_reminder_post", "dose_reminder_pre"]);
      expect(n.rows.every((r) => r.target_user_id === ownerId)).toBe(true);
    });
  }, 30000);

  it("nessun promemoria per terapie sospese o per pazienti senza utente collegato", async () => {
    await inTx(async (c) => {
      const susp = await addTherapy(c, "t_rem_susp", patA, { active: false, suspended: true });
      const nouser = await addTherapy(c, "t_rem_nouser", patB, { active: false });
      await c.query(
        `INSERT INTO public.events (id, therapy_id, patient_id, scheduled_at) VALUES
           ('rs_${stamp}', $1, $3, now() + interval '9 minutes'),
           ('rn_${stamp}', $2, $4, now() + interval '9 minutes')`,
        [susp, nouser, patA, patB],
      );
      await c.query("SELECT public.process_dose_schedule()");
      const n = await c.query(`SELECT 1 FROM public.notifications WHERE event_id IN ($1, $2)`, [`rs_${stamp}`, `rn_${stamp}`]);
      expect(n.rows).toHaveLength(0);
    });
  }, 30000);
});
