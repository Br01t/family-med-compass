import { supabase } from "./supabase";
import { type Role } from "./mock-data";

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
export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", uid)
      .single();

    if (error) {
      console.warn("Errore o profilo non trovato per l'utente:", error.message);
      return null;
    }

    if (data) {
      return {
        uid: data.id,
        email: data.email,
        name: data.name,
        role: data.role as Role,
        createdAt: data.created_at,
      };
    }
  } catch (error) {
    console.error("Errore nel recupero del profilo utente:", error);
  }
  return null;
}

/**
 * Registra un nuovo utente con email, password, nome e ruolo desiderato.
 * Solo "paziente" o "caregiver" sono ruoli validi in fase di registrazione.
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

  return {
    uid: data.user.id,
    email: params.email,
    name: params.name,
    role: params.role,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Effettua il login con email e password.
 */
export async function signInUser(params: { email: string; password: string }): Promise<void> {
  if (!supabase) throw new Error("Supabase non inizializzato");
  const { error } = await supabase.auth.signInWithPassword({
    email: params.email,
    password: params.password,
  });
  if (error) throw error;
}