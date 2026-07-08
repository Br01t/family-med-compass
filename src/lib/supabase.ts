import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://qdwadqkpobtxivlypbio.supabase.co";

const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY || 
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFkd2FkcWtwb2J0eGl2bHlwYmlvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMzNDk3ODAsImV4cCI6MjA5ODkyNTc4MH0.ozqo3sf9NkoRKk35g73-HbpRuZkRQhoV3ktcHS4Djng";
const isBrowser = typeof window !== "undefined";

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: isBrowser,
    autoRefreshToken: isBrowser,
    detectSessionInUrl: isBrowser,
  },
});