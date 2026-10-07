import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";
import {
  createAndAuthenticateUser,
  getAdminClient,
  TestUserSession,
} from "../fixtures/seed-test-users";

/**
 * Piani di abbonamento a livello DB: Pro / Max, downgrade, retention storico, cifratura note.
 *
 * Fonti di verità nel codice (supabase/migrations):
 *  - check_patient_limit()          -> free 1 / pro 2 / max 10 (conta per COALESCE(user_id, owner_user_id))
 *  - check_therapy_limit()          -> free 3 attive / pro,max illimitate
 *  - check_caregiver_invite_limit() -> free 1 / pro 5 / max 10 righe in caregiver_patients per paziente
 *  - perform_downgrade()            -> sospende (suspended_at) invece di cancellare
 *  - policy "events: read linked"   -> free vede ultimi 7 giorni, pro/max tutto
 *
 * Prerequisito: `npx supabase start` (istanza locale, mai il cloud).
 */

const stamp = Date.now();
const admin = getAdminClient();

async function setOwnPlan(userId: string, plan: "free" | "pro" | "max") {
  const { error } = await admin
    .from("profiles")
    .update({ subscription_plan_own: plan })
    .eq("id", userId);
  if (error) throw new Error(`setOwnPlan(${plan}) fallito: ${error.message}`);
}

async function effectivePlan(userId: string): Promise<string | undefined> {
  const { data } = await admin
    .from("profiles")
    .select("subscription_plan, subscription_plan_own")
    .eq("id", userId)
    .single();
  return data?.subscription_plan;
}

async function insertPatient(ownerId: string, id: string) {
  return admin.from("patients").insert({
    id,
    name: `Paziente ${id}`,
    birth_year: 1950,
    owner_user_id: ownerId,
    primary_caregiver_id: ownerId,
  });
}

async function insertTherapy(patientId: string, id: string) {
  return admin.from("therapies").insert({
    id,
    patient_id: patientId,
    name: `Terapia ${id}`,
    times: ["08:00"],
    recurrence: { type: "daily" },
  });
}

const createdUsers: string[] = [];
const createdPatients: string[] = [];

async function newOwner(label: string): Promise<TestUserSession> {
  const u = await createAndAuthenticateUser(
    `${label}_${stamp}@test.local`,
    "Password123!",
    "caregiver",
    `Owner ${label}`,
  );
  createdUsers.push(u.userId);
  return u;
}

afterAll(async () => {
  if (createdPatients.length) {
    await admin.from("events").delete().in("patient_id", createdPatients);
    await admin.from("therapies").delete().in("patient_id", createdPatients);
    await admin.from("caregiver_patients").delete().in("patient_id", createdPatients);
    await admin.from("patients").delete().in("id", createdPatients);
  }
  for (const uid of createdUsers) await admin.auth.admin.deleteUser(uid);
});

// ---------------------------------------------------------------------------
describe("Limiti PAZIENTI per piano (check_patient_limit)", () => {
  it("Free: 1 paziente, il 2° è bloccato", async () => {
    const owner = await newOwner("pl_free");
    const p1 = `p_pl_free_1_${stamp}`;
    const p2 = `p_pl_free_2_${stamp}`;
    createdPatients.push(p1, p2);

    expect((await insertPatient(owner.userId, p1)).error).toBeNull();
    const { error } = await insertPatient(owner.userId, p2);
    expect(error?.message).toMatch(/Limite pazienti raggiunto/i);
  });

  it("Pro: accetta 2 pazienti, blocca il 3°", async () => {
    const owner = await newOwner("pl_pro");
    await setOwnPlan(owner.userId, "pro");
    expect(await effectivePlan(owner.userId)).toBe("pro"); // propagazione trigger

    const ids = [1, 2, 3].map((i) => `p_pl_pro_${i}_${stamp}`);
    createdPatients.push(...ids);

    expect((await insertPatient(owner.userId, ids[0])).error).toBeNull();
    expect((await insertPatient(owner.userId, ids[1])).error).toBeNull();
    const { error } = await insertPatient(owner.userId, ids[2]);
    expect(error?.message).toMatch(/Limite pazienti raggiunto/i);
  });

  it("Max: accetta 10 pazienti, blocca l'11°", async () => {
    const owner = await newOwner("pl_max");
    await setOwnPlan(owner.userId, "max");
    expect(await effectivePlan(owner.userId)).toBe("max");

    const ids = Array.from({ length: 11 }, (_, i) => `p_pl_max_${i + 1}_${stamp}`);
    createdPatients.push(...ids);

    for (let i = 0; i < 10; i++) {
      const { error } = await insertPatient(owner.userId, ids[i]);
      expect(error, `paziente ${i + 1} deve essere accettato`).toBeNull();
    }
    const { error } = await insertPatient(owner.userId, ids[10]);
    expect(error?.message).toMatch(/Limite pazienti raggiunto/i);
  });
});

// ---------------------------------------------------------------------------
describe("Limiti TERAPIE per piano (check_therapy_limit)", () => {
  it("Pro: terapie oltre il limite Free (5 attive) sono accettate", async () => {
    const owner = await newOwner("tl_pro");
    await setOwnPlan(owner.userId, "pro");
    const pid = `p_tl_pro_${stamp}`;
    createdPatients.push(pid);
    expect((await insertPatient(owner.userId, pid)).error).toBeNull();

    for (let i = 1; i <= 5; i++) {
      const { error } = await insertTherapy(pid, `t_tl_pro_${i}_${stamp}`);
      expect(error, `terapia ${i} su Pro`).toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
describe("Limiti CAREGIVER per paziente (check_caregiver_invite_limit)", () => {
  // Il trigger conta TUTTE le righe di caregiver_patients del paziente
  // (incluso eventuale link del proprietario).
  async function fillCaregivers(plan: "free" | "pro" | "max", max: number) {
    const owner = await newOwner(`cg_${plan}`);
    if (plan !== "free") await setOwnPlan(owner.userId, plan);
    const pid = `p_cg_${plan}_${stamp}`;
    createdPatients.push(pid);
    expect((await insertPatient(owner.userId, pid)).error).toBeNull();

    for (let i = 1; i <= max; i++) {
      const cg = await createAndAuthenticateUser(
        `cg_${plan}_${i}_${stamp}@test.local`,
        "Password123!",
        "caregiver",
        `CG ${plan} ${i}`,
      );
      createdUsers.push(cg.userId);
      const { error } = await admin
        .from("caregiver_patients")
        .insert({ caregiver_id: cg.userId, patient_id: pid, relationship: "Familiare" });
      expect(error, `caregiver ${i}/${max} su ${plan}`).toBeNull();
    }

    const extra = await createAndAuthenticateUser(
      `cg_${plan}_extra_${stamp}@test.local`,
      "Password123!",
      "caregiver",
      `CG ${plan} extra`,
    );
    createdUsers.push(extra.userId);
    const { error } = await admin
      .from("caregiver_patients")
      .insert({ caregiver_id: extra.userId, patient_id: pid, relationship: "Familiare" });
    expect(error?.message).toMatch(/Limite caregiver/i);
  }

  it("Free: 1 caregiver, il 2° è bloccato", async () => fillCaregivers("free", 1), 120000);
  it("Pro: 5 caregiver, il 6° è bloccato", async () => fillCaregivers("pro", 5), 120000);
  it("Max: 10 caregiver, l'11° è bloccato", async () => fillCaregivers("max", 10), 180000);
});

// ---------------------------------------------------------------------------
describe("Downgrade (perform_downgrade): sospensione, non perdita dati", () => {
  let owner: TestUserSession;
  let p1: string;
  let p2: string;
  const therapies: string[] = [];

  beforeAll(async () => {
    owner = await newOwner("dg");
    await setOwnPlan(owner.userId, "pro");
    p1 = `p_dg_1_${stamp}`;
    p2 = `p_dg_2_${stamp}`;
    createdPatients.push(p1, p2);
    expect((await insertPatient(owner.userId, p1)).error).toBeNull();
    expect((await insertPatient(owner.userId, p2)).error).toBeNull();
    for (let i = 1; i <= 5; i++) {
      const id = `t_dg_${i}_${stamp}`;
      therapies.push(id);
      expect((await insertTherapy(p1, id)).error).toBeNull();
    }
    // dose storica già presa su una terapia che verrà sospesa
    await admin.from("events").insert({
      id: `ev_dg_hist_${stamp}`,
      therapy_id: therapies[4],
      patient_id: p1,
      status: "taken",
      scheduled_at: new Date(Date.now() - 2 * 86400000).toISOString(),
    });
  }, 60000);

  it("Pro -> Free sospende i record in eccesso e conserva lo storico", async () => {
    const keep = therapies.slice(0, 3);
    const { data, error } = await owner.client.rpc("perform_downgrade", {
      _new_plan: "free",
      _keep_patient_ids: [p1],
      _keep_therapy_ids: { [p1]: keep },
      _keep_caregiver_ids: {},
    });
    expect(error).toBeNull();
    expect((data as any).ok).toBe(true);
    expect((data as any).suspended_patients).toBe(1);
    expect((data as any).suspended_therapies).toBe(2);

    const { data: pts } = await admin.from("patients").select("id, suspended_at").in("id", [p1, p2]);
    expect(pts?.find((p) => p.id === p1)?.suspended_at).toBeNull();
    expect(pts?.find((p) => p.id === p2)?.suspended_at).not.toBeNull();

    const { data: ths } = await admin
      .from("therapies")
      .select("id, active, suspended_at, suspended_reason")
      .eq("patient_id", p1);
    expect(ths).toHaveLength(5); // nessuna cancellazione
    for (const t of ths ?? []) {
      if (keep.includes(t.id)) {
        expect(t.suspended_at).toBeNull();
      } else {
        expect(t.suspended_at).not.toBeNull();
        expect(t.suspended_reason).toBe("downgrade");
        expect(t.active).toBe(false);
      }
    }

    const { data: hist } = await admin.from("events").select("status").eq("id", `ev_dg_hist_${stamp}`).single();
    expect(hist?.status).toBe("taken"); // storico intatto

    expect(await effectivePlan(owner.userId)).toBe("free");
  });

  it("Dopo il downgrade i limiti Free tornano a essere applicati", async () => {
    const { error: pErr } = await insertPatient(owner.userId, `p_dg_3_${stamp}`);
    expect(pErr?.message).toMatch(/Limite pazienti raggiunto/i);

    const { error: tErr } = await insertTherapy(p1, `t_dg_new_${stamp}`);
    expect(tErr?.message).toMatch(/Limite di 3 terapie/i);
  });

  it("Ri-upgrade a Pro ripristina pazienti e terapie sospesi", async () => {
    await setOwnPlan(owner.userId, "pro");

    const { data: p } = await admin.from("patients").select("suspended_at").eq("id", p2).single();
    expect(p?.suspended_at).toBeNull();

    const { data: ths } = await admin.from("therapies").select("active, suspended_at").eq("patient_id", p1);
    expect(ths?.every((t) => t.suspended_at === null && t.active === true)).toBe(true);
  });

  // I due test seguenti usano un utente Pro NUOVO: non dipendono dallo stato
  // lasciato dai test precedenti (un errore a monte li farebbe passare per il
  // motivo sbagliato, es. "Not a downgrade: free -> free").
  async function freshProWithTwoPatients(label: string) {
    const u = await newOwner(label);
    await setOwnPlan(u.userId, "pro");
    const a = `p_${label}_a_${stamp}`;
    const b = `p_${label}_b_${stamp}`;
    createdPatients.push(a, b);
    expect((await insertPatient(u.userId, a)).error).toBeNull();
    expect((await insertPatient(u.userId, b)).error).toBeNull();
    expect(await effectivePlan(u.userId)).toBe("pro");
    return { u, a, b };
  }

  it("perform_downgrade rifiuta un 'downgrade' che non lo è (Pro -> Pro)", async () => {
    const { u, a, b } = await freshProWithTwoPatients("dg_same");
    const { error } = await u.client.rpc("perform_downgrade", {
      _new_plan: "pro",
      _keep_patient_ids: [a, b],
      _keep_therapy_ids: {},
      _keep_caregiver_ids: {},
    });
    expect(error?.message).toMatch(/Not a downgrade: pro -> pro/i);
  });

  it("SERVER-SIDE: downgrade a Free NON può mantenere più pazienti del limite Free", async () => {
    const { u, a, b } = await freshProWithTwoPatients("dg_cheat_p");
    const { error } = await u.client.rpc("perform_downgrade", {
      _new_plan: "free",
      _keep_patient_ids: [a, b],
      _keep_therapy_ids: {},
      _keep_caregiver_ids: {},
    });
    expect(error?.message, "downgrade con 2 pazienti su Free doveva essere rifiutato").toMatch(/al massimo 1 pazienti/i);
    expect(await effectivePlan(u.userId)).toBe("pro"); // rollback: nessun effetto parziale
  });

  it("SERVER-SIDE: downgrade a Free NON può mantenere più di 3 terapie attive", async () => {
    const { u, a } = await freshProWithTwoPatients("dg_cheat_t");
    const ids = [1, 2, 3, 4, 5].map((i) => `t_dg_cheat_${i}_${stamp}`);
    for (const id of ids) expect((await insertTherapy(a, id)).error).toBeNull();
    const { error } = await u.client.rpc("perform_downgrade", {
      _new_plan: "free",
      _keep_patient_ids: [a],
      _keep_therapy_ids: { [a]: ids },
      _keep_caregiver_ids: {},
    });
    expect(error?.message, "5 terapie attive su Free doveva essere rifiutato").toMatch(/al massimo 3 terapie/i);
    expect(await effectivePlan(u.userId)).toBe("pro");
  });
});

// ---------------------------------------------------------------------------
describe("Integrità del piano: nessun auto-upgrade dal client", () => {
  it("Un utente autenticato NON può scriversi subscription_plan_own = 'max'", async () => {
    // Letto dal codice: policy "profiles: self update" + GRANT UPDATE su profiles,
    // e src/lib/store.tsx scrive subscription_plan_own dal client.
    // Se questo test fallisce, i limiti di piano sono aggirabili senza pagare.
    const user = await newOwner("selfup");
    await user.client.from("profiles").update({ subscription_plan_own: "max" }).eq("id", user.userId);
    expect(await effectivePlan(user.userId)).toBe("free");

    await user.client.from("profiles").update({ subscription_plan: "max" }).eq("id", user.userId);
    expect(await effectivePlan(user.userId)).toBe("free");
  });

  it("Regressione: l'utente può ancora aggiornare nome e profilo (upsert come in auth-service)", async () => {
    const user = await newOwner("selfname");
    const { error: e1 } = await user.client.from("profiles").update({ name: "Nuovo Nome" }).eq("id", user.userId);
    expect(e1).toBeNull();
    const { error: e2 } = await user.client
      .from("profiles")
      .upsert({ id: user.userId, email: `selfname_${stamp}@test.local`, name: "Altro", role: "caregiver", created_at: new Date().toISOString() }, { onConflict: "id" });
    expect(e2).toBeNull();
  });

  it("Un utente NON può modificare il piano di un altro utente", async () => {
    const a = await newOwner("victim");
    const b = await newOwner("attacker");
    await b.client.from("profiles").update({ subscription_plan_own: "max" }).eq("id", a.userId);
    expect(await effectivePlan(a.userId)).toBe("free");
  });
});

// ---------------------------------------------------------------------------
describe("Retention storico dosi (RLS events: read linked)", () => {
  async function seedEvents(plan: "free" | "pro") {
    const owner = await newOwner(`ret_${plan}`);
    if (plan === "pro") await setOwnPlan(owner.userId, "pro");
    const pid = `p_ret_${plan}_${stamp}`;
    const tid = `t_ret_${plan}_${stamp}`;
    createdPatients.push(pid);
    expect((await insertPatient(owner.userId, pid)).error).toBeNull();
    expect((await insertTherapy(pid, tid)).error).toBeNull();
    const recent = `ev_ret_${plan}_recent_${stamp}`;
    const old = `ev_ret_${plan}_old_${stamp}`;
    await admin.from("events").insert([
      { id: recent, therapy_id: tid, patient_id: pid, status: "taken", scheduled_at: new Date(Date.now() - 3 * 86400000).toISOString() },
      { id: old, therapy_id: tid, patient_id: pid, status: "taken", scheduled_at: new Date(Date.now() - 30 * 86400000).toISOString() },
    ]);
    const { data } = await owner.client.from("events").select("id").eq("patient_id", pid);
    return new Set((data ?? []).map((e) => e.id));
  }

  it("Free: vede gli eventi degli ultimi 7 giorni, non quelli di 30 giorni fa", async () => {
    const ids = await seedEvents("free");
    expect(ids.has(`ev_ret_free_recent_${stamp}`)).toBe(true);
    expect(ids.has(`ev_ret_free_old_${stamp}`)).toBe(false);
  });

  it("Pro: vede anche gli eventi di 30 giorni fa", async () => {
    const ids = await seedEvents("pro");
    expect(ids.has(`ev_ret_pro_recent_${stamp}`)).toBe(true);
    expect(ids.has(`ev_ret_pro_old_${stamp}`)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
describe("Cifratura note terapia a riposo (notes_enc)", () => {
  // encrypt_therapy_note è volutamente NON eseguibile né da utenti né da
  // service_role (solo dal proprietario del DB): per popolare notes_enc il test
  // si collega direttamente al Postgres locale come `postgres`.
  const DB_URL =
    process.env.TEST_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

  it("i client NON possono invocare encrypt_therapy_note", async () => {
    const user = await newOwner("enc_nocall");
    const { error } = await user.client.rpc("encrypt_therapy_note", { _plain: "x" });
    expect(error).not.toBeNull();
    const { error: adminErr } = await admin.rpc("encrypt_therapy_note", { _plain: "x" });
    expect(adminErr).not.toBeNull();
  });

  // SALTATO di proposito: l'app non usa notes_enc (le note sono in chiaro in `notes`, protette da RLS).
  // Rimuovere ".skip" se/quando la cifratura delle note verrà attivata (serve il secret
  // `therapy_notes_key` nel Vault locale).
  it.skip("notes_enc è cifrato, decifrabile solo da chi ha titolo", async () => {
    const owner = await newOwner("enc_owner");
    const stranger = await newOwner("enc_stranger");
    const pid = `p_enc_${stamp}`;
    const tid = `t_enc_${stamp}`;
    createdPatients.push(pid);
    expect((await insertPatient(owner.userId, pid)).error).toBeNull();
    expect((await insertTherapy(pid, tid)).error).toBeNull();

    const secret = "NOTA-RISERVATA-XYZ-12345";
    const pg = new Client({ connectionString: DB_URL });
    await pg.connect();
    let stored: Buffer;
    try {
      await pg.query(
        "UPDATE public.therapies SET notes_enc = public.encrypt_therapy_note($1) WHERE id = $2",
        [secret, tid],
      );
      const r = await pg.query("SELECT notes_enc FROM public.therapies WHERE id = $1", [tid]);
      stored = r.rows[0].notes_enc as Buffer;
    } finally {
      await pg.end();
    }

    // 1. Nel DB il testo in chiaro non compare
    expect(stored).toBeInstanceOf(Buffer);
    expect(stored.length).toBeGreaterThan(0);
    expect(stored.includes(Buffer.from(secret))).toBe(false);

    // 2. Chi ha titolo decifra
    const { data: dec, error: decErr } = await owner.client.rpc("decrypt_therapy_note", { _therapy_id: tid });
    expect(decErr).toBeNull();
    expect(dec).toBe(secret);

    // 3. Un estraneo non può né decifrare né leggere la riga
    const { error: strErr } = await stranger.client.rpc("decrypt_therapy_note", { _therapy_id: tid });
    expect(strErr).not.toBeNull();
    const { data: strRows } = await stranger.client.from("therapies").select("notes_enc").eq("id", tid);
    expect(strRows ?? []).toHaveLength(0);
  }, 60000);
});