// ──────────────────────────────────────────────────────────────────────
// Client de la BASE COMMUNE (« colonne vertébrale » / Dossier Startup).
//
// C'est un projet Supabase SÉPARÉ de la base applicative de Leonard : il
// détient l'entité startup et ses documents, partagés entre les 3 apps.
// On requête le schéma `core` (db.schema).
//
// Variables attendues (.env) :
//   VITE_CORE_SUPABASE_URL       — URL du projet « INSKIP Core - Dossier Startup »
//   VITE_CORE_SUPABASE_ANON_KEY  — clé publique (anon / publishable)
//
// Tant qu'elles sont absentes, `coreDb` vaut null et les fonctions d'upload
// lèvent une erreur explicite (aucun couplage dur au démarrage de l'app).
// ──────────────────────────────────────────────────────────────────────

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_CORE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_CORE_SUPABASE_ANON_KEY as string | undefined;

/** true si la base commune est configurée. */
export const isCoreConfigured = Boolean(url && anonKey);

/** Client de la base commune (schéma `core`), ou null si non configuré. */
export const coreDb: SupabaseClient | null = isCoreConfigured
  ? createClient(url as string, anonKey as string, { db: { schema: "core" } })
  : null;

/** Nom du bucket de stockage des documents startup dans la base commune. */
export const CORE_DOCUMENTS_BUCKET = "startup-documents";
