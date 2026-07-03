// ──────────────────────────────────────────────────────────────────────
// Client Supabase (Phase 3). Le client n'est instancié que si les variables
// d'environnement sont présentes ; sinon `supabase` vaut null et le data-store
// bascule automatiquement sur les fichiers JSON embarqués.
//
// Variables attendues (fichier .env, cf. .env.example) :
//   VITE_SUPABASE_URL       — URL du projet Supabase
//   VITE_SUPABASE_ANON_KEY  — clé publique "anon"
// ──────────────────────────────────────────────────────────────────────

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** true si l'app est reliée à une base Supabase. */
export const isSupabaseConfigured = Boolean(url && anonKey);

/** Client Supabase partagé, ou null si non configuré (mode JSON local). */
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url as string, anonKey as string)
  : null;
