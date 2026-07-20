// ──────────────────────────────────────────────────────────────────────
// Boucle de veille : recommandations projet_aap, feedback, déclenchement de la
// veille et flux « Ce qui a besoin de vous ». Réexporté par
// services/programmes.ts (barrel).
// ──────────────────────────────────────────────────────────────────────

import { supabase } from "./supabase";

export interface ProjetAap {
  id: string;
  projet_id: string;
  aap_id: string;
  score: number;
  tier: "prioritaire" | "a_etudier" | null;
  raison: string | null;
  motif_ecart: string | null;
  statut_user:
    | "propose"
    | "a_instruire"
    | "ecarte"
    | "candidate"
    | "obtenu"
    | "refuse";
  detecte_le: string;
  evalue_le: string;
  actif: boolean;
  vu: boolean;
  feedback_pertinent: boolean | null;
  feedback_note: string | null;
  feedback_at: string | null;
  aap?: {
    id: string;
    titre: string;
    source: string;
    programme: string | null;
    statut: string;
    date_cloture: string | null;
  };
}

/** Marque une recommandation comme vue par l'utilisateur (sort de "Nouveautés"). */
export async function marquerAapVu(projetAapId: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.rpc("mark_projet_aap_vu", { p_id: projetAapId });
  if (error) throw new Error(`marquerAapVu: ${error.message}`);
}

/**
 * Enregistre le feedback utilisateur sur une reco : pertinent ou non, avec note
 * optionnelle. `pertinent = null` efface le feedback (re-clic sur un pouce actif)
 * — sinon le pouce réapparaîtrait au rechargement et fausserait la calibration.
 */
export async function donnerFeedback(
  projetAapId: string,
  pertinent: boolean | null,
  note?: string,
): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.rpc("donner_feedback_projet_aap", {
    p_id: projetAapId,
    p_pertinent: pertinent,
    p_note: note ?? null,
  });
  if (error) throw new Error(`donnerFeedback: ${error.message}`);
}

// ── Flux « Ce qui a besoin de vous » ─────────────────────────────────
//
// Agrégation transversale de tout ce qui appelle une action ce matin :
// - Urgences : recommandations actives dont la deadline arrive
// - Nouveautés prioritaires : reco fraîches (`vu=false`) au score >= 80
// - Autres nouveautés : reco fraîches à étudier
//
// Le flux est trié par priorité décroissante, cappé au N demandé.

export type FeedItemType = "urgent" | "nouveaute-prioritaire" | "nouveaute";

export interface FeedItem {
  type: FeedItemType;
  projet_id: string;
  projet_nom: string;
  programme_id: string | null;
  aap_id: string;
  aap_titre: string;
  aap_source: string;
  score: number;
  tier: "prioritaire" | "a_etudier" | null;
  date_cloture: string | null;
  jours_restants: number | null;
  detecte_le: string;
}

export async function getMomentumFeed(limit = 8): Promise<FeedItem[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("projet_aap")
    .select(
      "projet_id, aap_id, score, tier, vu, statut_user, detecte_le, actif, aap:aaps(id,titre,source,date_cloture,statut,titre_std), projet:projets!inner(id,nom,programme_id,actif)",
    )
    .eq("actif", true)
    .in("statut_user", ["propose", "a_instruire"]);
  if (error) throw new Error(`getMomentumFeed: ${error.message}`);

  const now = Date.now();
  const items: FeedItem[] = [];
  for (const r of (data ?? []) as unknown as Array<{
    projet_id: string;
    aap_id: string;
    score: number;
    tier: "prioritaire" | "a_etudier" | null;
    vu: boolean;
    detecte_le: string;
    aap: {
      id: string;
      titre: string;
      titre_std: string | null;
      source: string;
      date_cloture: string | null;
      statut: string;
    } | null;
    projet: { id: string; nom: string; programme_id: string | null; actif: boolean } | null;
  }>) {
    if (!r.aap || !r.projet || !r.projet.actif) continue;
    if (r.aap.statut !== "open") continue;
    const j = r.aap.date_cloture
      ? Math.ceil((new Date(r.aap.date_cloture).getTime() - now) / 86_400_000)
      : null;
    if (j !== null && j < 0) continue; // deadline passée

    let type: FeedItemType;
    if (j !== null && j <= 30) type = "urgent";
    else if (!r.vu && r.tier === "prioritaire") type = "nouveaute-prioritaire";
    else if (!r.vu) type = "nouveaute";
    else continue; // déjà vu et deadline lointaine → hors feed

    items.push({
      type,
      projet_id: r.projet_id,
      projet_nom: r.projet.nom,
      programme_id: r.projet.programme_id,
      aap_id: r.aap_id,
      aap_titre: r.aap.titre_std ?? r.aap.titre,
      aap_source: r.aap.source,
      score: r.score,
      tier: r.tier,
      date_cloture: r.aap.date_cloture,
      jours_restants: j,
      detecte_le: r.detecte_le,
    });
  }

  const rank = (t: FeedItemType) =>
    t === "urgent" ? 0 : t === "nouveaute-prioritaire" ? 1 : 2;
  items.sort((a, b) => {
    const r = rank(a.type) - rank(b.type);
    if (r !== 0) return r;
    if (a.type === "urgent")
      return (a.jours_restants ?? 999) - (b.jours_restants ?? 999);
    return b.score - a.score;
  });
  return items.slice(0, limit);
}

/** Recommandations de veille d'un projet — jointes aux AAP pour l'affichage. */
export async function getProjetAaps(projetId: string): Promise<ProjetAap[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("projet_aap")
    .select(
      "id, projet_id, aap_id, score, tier, raison, motif_ecart, statut_user, detecte_le, evalue_le, actif, vu, feedback_pertinent, feedback_note, feedback_at, aap:aaps(id, titre, source, programme, statut, date_cloture)",
    )
    .eq("projet_id", projetId)
    .order("score", { ascending: false });
  if (error) throw new Error(`getProjetAaps: ${error.message}`);
  return (data ?? []) as unknown as ProjetAap[];
}

/** Lance la veille pour un projet (ou tous si projetId omis). */
export async function runVeille(
  projetId?: string,
): Promise<{ ok: boolean; message?: string; stats?: Record<string, number> }> {
  if (!supabase) return { ok: false, message: "Supabase non configuré." };
  const { data: sess } = await supabase.auth.getSession();
  const token = sess.session?.access_token;
  if (!token) return { ok: false, message: "Session expirée — reconnectez-vous." };
  const url = import.meta.env.VITE_SUPABASE_URL as string;
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
  try {
    const res = await fetch(`${url}/functions/v1/run-veille`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        apikey: anon,
      },
      body: JSON.stringify(projetId ? { projet_id: projetId } : {}),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body?.ok === false) {
      return { ok: false, message: body?.error || `HTTP ${res.status}` };
    }
    return { ok: true, stats: body };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}
