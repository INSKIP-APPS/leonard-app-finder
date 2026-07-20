// Edge Function : analyse-adhoc (v3)
// Matching ad-hoc pour un projet fourni inline. Ne persiste RIEN en base
// (sauf une ligne d'observabilité dans veille_runs, mode='adhoc').
// Utilisé par le bouton "Analyse express" sur les pages programme.
// v2 : retry, pool de 4, failed_batches, tokens journalisés.
// v3 : règles de jugement et plomberie déplacées dans _shared/judge.ts —
//      SOURCE UNIQUE partagée avec run-veille et claude-judge.

import { createClient } from "npm:@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk@0.68.0";
import { runJudge, normalizeVerdict } from "../_shared/judge.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

function norm(s) {
  return (s || "").toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

const STOPWORDS = new Set(
  "pour dans avec les des une aux sur par plus leur nos vos ces cette sont etre leurs projet projets entreprise entreprises innovation innovant developpement systeme solution solutions cadre acteur acteurs euros million millions vinci type nouvelle nouveau objectif long production mise place votre notre ainsi afin dont entre tres bien tout tous toute toutes comme usages usage unite haute".split(/\s+/)
);

function tokenize(text) {
  return norm(text).split(/[^a-z0-9]+/).filter((t) => t.length >= 4 && !STOPWORDS.has(t));
}

function preselectionne(projet, aaps) {
  // Pour l'analyse ad-hoc, on n'a pas forcement de thematiques : on privilegie les mots-cles
  // + secteurs (element grossier). Seuil identique run-veille (>=25) + cap dur 60 pour rester rapide.
  const themes = new Set(projet.thematiques || []);
  const secteurs = new Set((projet.secteurs || []).map(norm));
  const desc = (projet.description || "") + " " + (projet.mots_cles || []).join(" ");
  const kws = new Set([...tokenize(desc), ...(projet.mots_cles || []).map(norm)]);

  const scored = [];
  for (const a of aaps) {
    const themeOverlap = (a.thematiques || []).filter((t) => themes.has(t)).length;
    const hay = norm(a.titre + " " + (a.description || ""));
    let kwHits = 0;
    for (const k of kws) if (k && hay.includes(k)) kwHits++;
    // Boost secteur (approximation : le nom du secteur apparait dans titre/desc)
    let secteurHits = 0;
    for (const s of secteurs) if (s && s.length >= 4 && hay.includes(s)) secteurHits++;
    const preScore = themeOverlap * 20 + Math.min(kwHits, 6) * 8 + Math.min(secteurHits, 3) * 5;
    if (preScore >= 25) scored.push({ aap: a, preScore });
  }
  scored.sort((x, y) => y.preScore - x.preScore);
  return scored.slice(0, 60); // Cap plus dur pour tenir dans la limite Edge Function
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY");
  if (!SUPABASE_URL || !SERVICE_ROLE) return json({ ok: false, error: "env missing" }, 500);
  if (!ANTHROPIC_KEY) return json({ ok: false, error: "ANTHROPIC_API_KEY absent" }, 503);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  // Auth : n'importe quel authenticated (consultation seulement, aucune ecriture)
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ ok: false, error: "missing token" }, 401);
  const { data: userResp, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userResp?.user) return json({ ok: false, error: "invalid token" }, 401);

  const started = Date.now();
  const body = await req.json().catch(() => ({}));
  const projet = {
    nom: (body?.nom || "").toString().slice(0, 200),
    description: (body?.description || "").toString().slice(0, 3000),
    secteurs: Array.isArray(body?.secteurs) ? body.secteurs.slice(0, 5) : [],
    thematiques: Array.isArray(body?.thematiques) ? body.thematiques.slice(0, 10) : [],
    mots_cles: Array.isArray(body?.mots_cles) ? body.mots_cles.slice(0, 15) : [],
    type_acteur: (body?.type_acteur || "").toString().slice(0, 50),
  };
  if (!projet.description || projet.description.length < 20) {
    return json({ ok: false, error: "description trop courte (min 20 caracteres)" }, 400);
  }

  const nowIso = new Date().toISOString();
  const { data: aapsRaw, error: aErr } = await admin
    .from("aaps")
    .select("id, titre, source, statut, date_cloture, thematiques, trl_min, trl_max, type_action, data")
    .eq("statut", "open")
    .or(`date_cloture.is.null,date_cloture.gte.${nowIso}`);
  if (aErr) return json({ ok: false, error: aErr.message }, 500);
  const aaps = (aapsRaw || []).map((a) => ({ ...a, description: a.data?.description || "", titre: a.data?.titre_std || a.titre }));

  const candidats = preselectionne(projet, aaps);
  if (candidats.length === 0) {
    return json({ ok: true, projet, aap_candidats: 0, resultats: [], message: "Aucun AAP candidat apres preselection lexicale. Precise davantage la description ou ajoute des mots-cles." });
  }

  const anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY });
  const projetBloc = [
    "PROJET",
    "- Nom : " + (projet.nom || "(sans titre)"),
    "- Description : " + (projet.description || "").slice(0, 2000),
    "- Secteurs : " + (projet.secteurs || []).join(", "),
    "- Type d'acteur : " + (projet.type_acteur || "(non precise)"),
  ].join("\n");

  const { results: verdicts, batches, failed, usage } = await runJudge(anthropic, {
    projetBloc,
    items: candidats.map((c) => ({
      id: c.aap.id, titre: c.aap.titre, source: c.aap.source, type_action: c.aap.type_action,
      trl_min: c.aap.trl_min, trl_max: c.aap.trl_max, thematiques: c.aap.thematiques,
      acteurs_eligibles: c.aap.data?.acteurs_eligibles || null,
      description: (c.aap.description || "").slice(0, 1000),
    })),
    maxTokens: 3000,
  });
  const byId = new Map(verdicts.map((v) => [v.id, v]));

  const resultats = [];
  for (const c of candidats) {
    const v = byId.get(c.aap.id);
    if (!v) continue;
    const n = normalizeVerdict(v);
    resultats.push({
      id: c.aap.id,
      titre: c.aap.titre,
      source: c.aap.source,
      date_cloture: c.aap.date_cloture,
      score: n.score,
      tier: n.tier,
      pertinent: n.pertinent,
      raison: n.raison,
      motif_ecart: n.motif_ecart,
    });
  }
  resultats.sort((a, b) => b.score - a.score);

  // Observabilité coût : une ligne par analyse express (ne bloque jamais la réponse).
  try {
    await admin.from("veille_runs").insert({
      mode: "adhoc", ok: failed === 0,
      error: failed > 0 ? `${failed} batch(es) juge en echec` : null,
      projets_traites: 1, total_juges: candidats.length,
      batches_ok: batches - failed, batches_failed: failed,
      input_tokens: usage.input, output_tokens: usage.output,
      duration_ms: Date.now() - started,
    });
  } catch { /* best effort */ }

  return json({
    ok: true,
    aap_candidats: candidats.length,
    resultats_pertinents: resultats.filter((r) => r.pertinent).length,
    failed_batches: failed,
    resultats,
  });
});
