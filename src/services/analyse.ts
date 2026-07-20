// ──────────────────────────────────────────────────────────────────────
// Analyse express (ad-hoc, ne persiste rien). Réexporté par
// services/programmes.ts (barrel).
// ──────────────────────────────────────────────────────────────────────

import { supabase } from "./supabase";

export interface AnalyseAdhocInput {
  nom?: string;
  description: string;
  secteurs: string[];
  type_acteur: string;
  mots_cles?: string[];
}

export interface AnalyseAdhocResult {
  id: string;
  titre: string;
  source: string;
  date_cloture: string | null;
  score: number;
  tier: "prioritaire" | "a_etudier" | null;
  pertinent: boolean;
  raison: string | null;
  motif_ecart: string | null;
}

export interface AnalyseAdhocResponse {
  ok: boolean;
  aap_candidats: number;
  resultats_pertinents: number;
  /** Nombre de lots du juge IA en échec — si > 0, l'analyse est partielle. */
  failed_batches?: number;
  resultats: AnalyseAdhocResult[];
  message?: string;
  error?: string;
}

export async function analyseAdhoc(input: AnalyseAdhocInput): Promise<AnalyseAdhocResponse> {
  if (!supabase) return { ok: false, aap_candidats: 0, resultats_pertinents: 0, resultats: [], error: "Supabase non configuré" };
  const { data: sess } = await supabase.auth.getSession();
  const token = sess.session?.access_token;
  if (!token) return { ok: false, aap_candidats: 0, resultats_pertinents: 0, resultats: [], error: "Session expirée — reconnectez-vous." };
  const url = import.meta.env.VITE_SUPABASE_URL as string;
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
  // Timeout dur (~60 s) : sans lui, une fonction qui traîne = spinner infini.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 60_000);
  try {
    const res = await fetch(`${url}/functions/v1/analyse-adhoc`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, apikey: anon },
      body: JSON.stringify(input),
      signal: ctrl.signal,
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body?.ok === false) {
      return { ok: false, aap_candidats: 0, resultats_pertinents: 0, resultats: [], error: body?.error || `HTTP ${res.status}` };
    }
    return body as AnalyseAdhocResponse;
  } catch (e) {
    const msg =
      e instanceof DOMException && e.name === "AbortError"
        ? "L'analyse a dépassé 60 s — réessayez ou simplifiez la description."
        : e instanceof Error
          ? e.message
          : String(e);
    return { ok: false, aap_candidats: 0, resultats_pertinents: 0, resultats: [], error: msg };
  } finally {
    clearTimeout(timer);
  }
}
