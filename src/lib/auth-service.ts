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
 * Il trigger del database configurerà automaticamente la riga nella tabella public.profiles.
 */
export async function signUpUser(params: {
  email: string;
  password: createPassword;
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

  // Restituiamo il profilo formattato
  return {
    uid: data.user.id,
    email: params.email,
    name: params.name,
    role: params.role,
    createdAt: new Date().toISOString(),
  };
}

type createPassword = string;
