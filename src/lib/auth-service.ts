import { type User } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { type Role } from "./mock-data";
import { addPatientDoc } from "./supabase-service";

export interface UserProfile {
  uid: string;
  email: string;
  name: string;
  role: Role;
  createdAt: string;
}

/**
 * Ottiene il profilo utente dalla tabella public.profiles in base all'UID.
 */
function getFallbackProfile(user: Partial<User> | null | undefined): UserProfile | null {
  const metadata = (user?.user_metadata ?? {}) as Record<string, unknown>;
  const role = metadata.role;

  if (role !== "paziente" && role !== "caregiver") {
    return null;
  }

  return {
    uid: user?.id ?? "",
    email: (user?.email as string | undefined) ?? "",
    name: (metadata.name as string | undefined) ?? user?.email ?? "",
    role,
    createdAt: new Date().toISOString(),
  };
}

export async function getUserProfile(
  uid: string,
  fallbackUser?: Partial<User> | null,
  retries = 2,
): Promise<UserProfile | null> {
  if (!supabase) return null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const { data, error } = await supabase.from("profiles").select("*").eq("id", uid).maybeSingle();

      if (error) {
        // Errore di rete/RLS momentaneo (tipico quando l'app torna in
        // foreground dopo essere stata chiusa/in background e la connessione
        // non è ancora pronta): riprova prima di arrenderti. Altrimenti
        // l'utente verrebbe sloggato pur avendo una sessione Supabase
        // ancora perfettamente valida.
        console.warn(`Profilo non disponibile (tentativo ${attempt + 1}/${retries + 1}):`, error.message);
        if (attempt < retries) {
          await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
          continue;
        }
        return getFallbackProfile(fallbackUser);
      }

      if (!data) {
        return getFallbackProfile(fallbackUser);
      }

      const fallback = getFallbackProfile(fallbackUser);

      return {
        uid: data.id,
        email: data.email ?? fallback?.email ?? "",
        name: data.name ?? fallback?.name ?? "",
        role: (data.role as Role) ?? fallback?.role ?? "caregiver",
        createdAt: data.created_at ?? fallback?.createdAt ?? new Date().toISOString(),
      };
    } catch (error) {
      console.error(`Errore nel recupero del profilo utente (tentativo ${attempt + 1}/${retries + 1}):`, error);
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
        continue;
      }
    }
  }
  return getFallbackProfile(fallbackUser);
}

/**
 * Registra un nuovo utente con email, password, nome e ruolo desiderato.
 * Solo "paziente" o "caregiver" sono ruoli validi in fase di registrazione.
 * Se il ruolo è "paziente", crea automaticamente un record nella tabella patients.
 * Il trigger del database configura automaticamente la riga in public.profiles
 * a partire dai metadata passati qui sotto (vedi supabase/schema.sql).
 */
export async function signUpUser(params: {
  email: string;
  password: string;
  name: string;
  role: Role;
}): Promise<UserProfile> {
  if (!supabase) throw new Error("Supabase non inizializzato");

  const { data, error } = await supabase.auth.signUp({
    email: params.email,
    password: params.password,
    options: {
      data: {
        name: params.name,
        role: params.role,
      },
    },
  });

  if (error) throw error;
  if (!data.user) throw new Error("Errore durante la creazione dell'account.");

  try {
    await supabase.from("profiles").upsert(
      {
        id: data.user.id,
        email: params.email,
        name: params.name,
        role: params.role,
        created_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );
  } catch (profileError) {
    console.warn("Profilo non creato automaticamente, continuo con il fallback metadata:", profileError);
  }

  // Se il ruolo è "paziente", crea automaticamente il record nel DB
  if (params.role === "paziente") {
    try {
      await addPatientDoc({
        id: `p_${data.user.id}`,
        name: params.name,
        photo: undefined,
        birthYear: undefined,
        caregiverIds: [],
        userId: data.user.id,
      });
    } catch (patientError) {
      // Non blocchiamo la registrazione: il trigger Supabase o il recovery al login
      // provvederanno a creare il record paziente automaticamente.
      console.error("[signUpUser] Creazione paziente fallita (sarà recuperata al login):", patientError);
    }
  }

  // Se il ruolo è "caregiver", crea il record nella tabella caregivers
  if (params.role === "caregiver") {
    try {
      await supabase.from("caregivers").insert({
        id: data.user.id,
        name: params.name,
      });
    } catch {
      // Il record potrebbe già esistere via trigger — non blocchiamo
    }
  }

  return {
    uid: data.user.id,
    email: params.email,
    name: params.name,
    role: params.role,
    createdAt: new Date().toISOString(),
  };
}

export function formatAuthError(error: unknown): string {
  if (!error) {
    return "Si è verificato un errore imprevisto. Riprova più tardi.";
  }

  const err = error as Record<string, unknown>;
  const message =
    (typeof err.message === "string" && err.message) ||
    (typeof err.error_description === "string" && err.error_description) ||
    (typeof err.error === "string" && err.error) ||
    (typeof err.details === "string" && err.details) ||
    (typeof err.hint === "string" && err.hint) ||
    "Si è verificato un errore durante l'autenticazione.";

  return message;
}

/**
 * Effettua il login con email e password.
 */
export async function signInUser(params: {
  email: string;
  password: string;
}): Promise<User | null> {
  if (!supabase) throw new Error("Supabase non inizializzato");
  const { data, error } = await supabase.auth.signInWithPassword({
    email: params.email,
    password: params.password,
  });
  if (error) throw error;
  return data.user;
}