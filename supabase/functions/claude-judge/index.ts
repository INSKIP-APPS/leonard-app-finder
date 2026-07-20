// ──────────────────────────────────────────────────────────────────────
// Edge Function : claude-judge (v2 — le juge de pertinence du matching)
//
// Reçoit un projet + ~30 candidats présélectionnés (couche lexicale) et rend,
// pour CHACUN, un verdict + score. Seuls les pertinents sont affichés.
//
// v2 (unification couche IA) :
//   - règles de jugement depuis _shared/judge.ts — MÊMES règles que run-veille
//     et analyse-adhoc (barème 0-100 + règle dure d'éligibilité acteur)
//   - authentification requise (compte connecté) — la fonction était
//     invocable publiquement, donc coût Claude exposé
//   - retry transitoire + pool de 4 + usage tokens journalisé (veille_runs)
// Contrat de réponse inchangé : {results, model, batches, failed_batches}
// (results porte en plus un `score`, ignoré par les anciens clients).
// ──────────────────────────────────────────────────────────────────────

import { createClient } from "npm:@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk@0.68.0";
import { runJudge, normalizeVerdict } from "../_shared/judge.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!SUPABASE_URL || !SERVICE_ROLE) return json({ error: "env_missing" }, 500);
  if (!apiKey) {
    return json(
      { error: "not_configured", message: "Secret ANTHROPIC_API_KEY absent — configure-le dans Supabase." },
      503,
    );
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  // v2 : auth requise (le client invoque avec le JWT de session). Sans ce
  // contrôle, la fonction — et donc la clé Claude — était invocable par
  // quiconque connaissait l'URL.
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "missing_token" }, 401);
  const { data: userResp, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userResp?.user) return json({ error: "invalid_token" }, 401);

  const model = Deno.env.get("JUDGE_MODEL") || "claude-haiku-4-5-20251001";

  let payload;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const projet = payload.projet ?? {};
  const candidats = (payload.candidats ?? []).slice(0, 40);
  if (candidats.length === 0) return json({ results: [] });

  const started = Date.now();
  const projetBloc = `PROJET\n- Nom : ${projet.nom || "(non précisé)"}\n- Description : ${(projet.description || "(non précisée)").slice(0, 2000)}\n- Secteurs : ${(projet.secteurs ?? []).join(", ") || "(non précisés)"}\n- Type d'acteur : ${projet.typeActeur || "(non précisé)"}\n- TRL : ${projet.trl ?? "(non précisé)"}\n- Localisation : ${projet.region || "(non précisée)"}\n- Financement recherché : ${projet.financementRecherche || "(non précisé)"}\n- Contexte : ${(projet.motsClesLibres || "").slice(0, 400)}`;

  const items = candidats.map((c) => ({
    id: c.id,
    titre: c.titre,
    source: c.source ?? null,
    type_action: c.type_action ?? null,
    trl: c.trl ?? null,
    thematiques: c.thematiques ?? [],
    acteurs_eligibles: c.acteurs_eligibles ?? null,
    montant: c.montant ?? null,
    signaux: c.flags ?? [],
    description: (c.description ?? "").slice(0, 1200),
  }));

  const anthropic = new Anthropic({ apiKey });
  const { results: raw, batches, failed, usage } = await runJudge(anthropic, {
    projetBloc,
    items,
    model,
  });

  // Normalisation canonique (clamp, seuil 60, tier) — le contrat client reste
  // {id, pertinent, raison, points_attention, motif_ecart} + score en bonus.
  const results = raw
    .filter((v) => v && typeof v.id === "string")
    .map((v) => {
      const n = normalizeVerdict(v);
      return {
        id: v.id,
        score: n.score,
        pertinent: n.pertinent,
        raison: n.raison || "",
        points_attention: n.points_attention,
        motif_ecart: n.motif_ecart ?? undefined,
      };
    });

  // Observabilité coût (ne bloque jamais la réponse).
  try {
    await admin.from("veille_runs").insert({
      mode: "matching", ok: failed === 0,
      error: failed > 0 ? `${failed} batch(es) juge en echec` : null,
      projets_traites: 1, total_juges: candidats.length,
      batches_ok: batches - failed, batches_failed: failed,
      input_tokens: usage.input, output_tokens: usage.output,
      duration_ms: Date.now() - started,
    });
  } catch { /* best effort */ }

  if (results.length === 0 && failed > 0) {
    return json({ error: "anthropic_error", message: "Tous les batches du juge ont échoué." }, 502);
  }
  return json({ results, model, batches, failed_batches: failed });
});
