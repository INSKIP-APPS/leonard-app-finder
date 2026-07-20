// Edge Function : run-veille (v10)
// v8 : le juge reçoit acteurs_eligibles par candidat + règle stricte d'inéligibilité acteur.
// v9 : retry transitoire, pool de 4, batches_failed, tokens, journal veille_runs.
// v10 : règles de jugement et plomberie déplacées dans _shared/judge.ts —
//       SOURCE UNIQUE partagée avec analyse-adhoc et claude-judge.

import { createClient } from "npm:@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk@0.68.0";
import { runJudge, normalizeVerdict } from "../_shared/judge.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-veille-secret",
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
  const themes = new Set(projet.thematiques || []);
  const kws = new Set([
    ...tokenize((projet.description || "") + " " + (projet.mots_cles || []).join(" ")),
    ...(projet.mots_cles || []).map(norm),
  ]);

  const scored = [];
  for (const a of aaps) {
    const themeOverlap = (a.thematiques || []).filter((t) => themes.has(t)).length;
    const hay = norm(a.titre + " " + (a.description || ""));
    let kwHits = 0;
    for (const k of kws) if (k && hay.includes(k)) kwHits++;
    const preScore = themeOverlap * 20 + Math.min(kwHits, 6) * 8;
    if (preScore >= 25) scored.push({ aap: a, preScore });
  }
  scored.sort((x, y) => y.preScore - x.preScore);
  return scored.slice(0, 200);
}

async function chargerCalibration(admin, projetId) {
  const { data } = await admin
    .from("projet_aap")
    .select("score, tier, feedback_pertinent, actif, feedback_note, aap:aaps(titre, description:data->description)")
    .eq("projet_id", projetId)
    .not("feedback_pertinent", "is", null)
    .order("feedback_at", { ascending: false })
    .limit(20);
  if (!data || data.length === 0) return "";
  const lignes = [];
  for (const r of data) {
    const jugeDitPertinent = r.actif === true;
    const humainDitPertinent = r.feedback_pertinent === true;
    if (jugeDitPertinent === humainDitPertinent && lignes.length >= 5) continue;
    const titre = r.aap?.titre || "(sans titre)";
    const verdict = humainDitPertinent ? "PERTINENT" : "NON PERTINENT";
    lignes.push(`  • « ${titre.slice(0, 100)} » → ${verdict}${r.feedback_note ? " (" + r.feedback_note.slice(0, 60) + ")" : ""}`);
    if (lignes.length >= 10) break;
  }
  if (lignes.length === 0) return "";
  return "\n\nCALIBRATION UTILISATEUR sur ce projet (verdicts humains valides, tiens-en compte) :\n" + lignes.join("\n");
}

function projetBlocDe(projet) {
  return `PROJET\n- Nom : ${projet.nom}\n- Description : ${(projet.description || "").slice(0, 2000)}\n- Secteurs : ${(projet.secteurs || []).join(", ")}\n- Thematiques : ${(projet.thematiques || []).join(", ")}\n- Type d'acteur : ${projet.type_acteur || "(non precise)"}\n- TRL actuel : ${projet.trl || "(non precise)"}\n- Localisation : ${(projet.localisation || []).join(", ")}\n- Besoin financement : ${projet.besoin_financement || "(non precise)"}`;
}

function compactCandidat(c) {
  return {
    id: c.aap.id, titre: c.aap.titre, source: c.aap.source, type_action: c.aap.type_action,
    trl_min: c.aap.trl_min, trl_max: c.aap.trl_max, thematiques: c.aap.thematiques,
    acteurs_eligibles: c.aap.data?.acteurs_eligibles || null,
    description: (c.aap.description || "").slice(0, 1200),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY");
  if (!SUPABASE_URL || !SERVICE_ROLE) return json({ ok: false, error: "env missing" }, 500);
  if (!ANTHROPIC_KEY) return json({ ok: false, error: "ANTHROPIC_API_KEY absent" }, 503);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  let bypassAuth = false;
  const providedSecret = req.headers.get("x-veille-secret");
  if (providedSecret) {
    const envSecret = Deno.env.get("VEILLE_SECRET");
    if (envSecret && envSecret === providedSecret) bypassAuth = true;
    else {
      const { data: setting } = await admin.from("app_settings").select("value").eq("key", "veille_secret").single();
      if (setting?.value && setting.value === providedSecret) bypassAuth = true;
    }
  }

  if (!bypassAuth) {
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return json({ ok: false, error: "missing token" }, 401);
    const { data: userResp, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userResp?.user) return json({ ok: false, error: "invalid token" }, 401);
    const { data: profil } = await admin.from("profils").select("role").eq("id", userResp.user.id).single();
    if (!profil || (profil.role !== "admin" && profil.role !== "editeur")) return json({ ok: false, error: "forbidden" }, 403);
  }

  const started = Date.now();
  const body = await req.json().catch(() => ({}));
  const projetIdFilter = body?.projet_id;
  const forceFull = body?.force_full === true || body?.mode === "full";

  const usage = { input: 0, output: 0 };
  const stats = { mode: forceFull ? "full" : "delta", projets_traites: 0, projets_pleins: 0, projets_delta: 0, projets_skip: 0, aap_ajoutes: 0, aap_ecartes: 0, total_juges: 0, projets_avec_feedback: 0, batches_ok: 0, batches_failed: 0 };
  const logRun = async (ok, error) => {
    try {
      await admin.from("veille_runs").insert({
        mode: stats.mode, ok, error: error ?? null,
        projets_traites: stats.projets_traites, aap_ajoutes: stats.aap_ajoutes,
        aap_ecartes: stats.aap_ecartes, total_juges: stats.total_juges,
        batches_ok: stats.batches_ok, batches_failed: stats.batches_failed,
        input_tokens: usage.input, output_tokens: usage.output,
        duration_ms: Date.now() - started,
      });
    } catch { /* le log ne doit jamais faire échouer le run */ }
  };

  try {
    let projQuery = admin.from("projets").select("*").not("programme_id", "is", null).eq("actif", true);
    if (projetIdFilter) projQuery = projQuery.eq("id", projetIdFilter);
    const { data: projets, error: pErr } = await projQuery;
    if (pErr) { await logRun(false, pErr.message); return json({ ok: false, error: pErr.message }, 500); }
    if (!projets || projets.length === 0) { await logRun(true, null); return json({ ok: true, projets: 0, message: "aucun projet actif" }); }

    const nowIso = new Date().toISOString();
    const { data: aapsOuvertsRaw, error: aErr } = await admin.from("aaps").select("id, titre, source, statut, date_cloture, updated_at, thematiques, trl_min, trl_max, type_action, data").eq("statut", "open").or(`date_cloture.is.null,date_cloture.gte.${nowIso}`);
    if (aErr) { await logRun(false, aErr.message); return json({ ok: false, error: aErr.message }, 500); }
    const aapsOuverts = (aapsOuvertsRaw || []).map((a) => ({ ...a, description: a.data?.description || "" }));
    const idsOuverts = new Set(aapsOuverts.map((a) => a.id));

    const anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY });

    for (const p of projets) {
      const projetInput = {
        nom: p.nom, description: p.description,
        secteurs: p.data?.secteurs || [], thematiques: p.data?.thematiques || [],
        mots_cles: p.mots_cles || [], type_acteur: p.data?.type_acteur,
        trl: p.trl, localisation: p.data?.localisation || [], besoin_financement: p.data?.besoin_financement,
      };

      const isFirstVeille = !p.derniere_veille_le;
      const useFullForThis = forceFull || isFirstVeille;

      let aapsPourPreselect = aapsOuverts;
      if (!useFullForThis) {
        const seuil = p.derniere_veille_le;
        const { data: actifs } = await admin.from("projet_aap").select("aap_id").eq("projet_id", p.id).eq("actif", true);
        const idsActifs = new Set((actifs || []).map((r) => r.aap_id));
        aapsPourPreselect = aapsOuverts.filter((a) => (a.updated_at && a.updated_at > seuil) || idsActifs.has(a.id));
        if (aapsPourPreselect.length === 0) {
          await admin.from("projets").update({ derniere_veille_le: nowIso }).eq("id", p.id);
          stats.projets_skip++; stats.projets_traites++; continue;
        }
        stats.projets_delta++;
      } else stats.projets_pleins++;

      const candidats = preselectionne(projetInput, aapsPourPreselect);
      if (candidats.length === 0) {
        await admin.from("projets").update({ derniere_veille_le: nowIso }).eq("id", p.id);
        stats.projets_traites++; continue;
      }

      const calibration = await chargerCalibration(admin, p.id);
      if (calibration) stats.projets_avec_feedback++;

      const { results: verdicts, batches, failed, usage: u } = await runJudge(anthropic, {
        projetBloc: projetBlocDe(projetInput),
        items: candidats.map(compactCandidat),
        calibration,
      });
      usage.input += u.input;
      usage.output += u.output;
      stats.batches_ok += batches - failed;
      stats.batches_failed += failed;
      const byId = new Map(verdicts.map((v) => [v.id, v]));
      stats.total_juges += candidats.length;

      const rows = [];
      for (const c of candidats) {
        const v = byId.get(c.aap.id);
        if (!v) continue;
        const n = normalizeVerdict(v);
        rows.push({
          projet_id: p.id, aap_id: c.aap.id, score: n.score,
          tier: n.tier, raison: n.raison, motif_ecart: n.motif_ecart,
          evalue_le: nowIso, actif: n.pertinent,
        });
      }

      if (rows.length > 0) {
        const { error: uErr } = await admin.from("projet_aap").upsert(rows, { onConflict: "projet_id,aap_id" });
        if (uErr) { await logRun(false, `upsert: ${uErr.message}`); return json({ ok: false, error: `upsert: ${uErr.message}` }, 500); }
        const pertinents = rows.filter((r) => r.actif).length;
        stats.aap_ajoutes += pertinents; stats.aap_ecartes += rows.length - pertinents;
      }

      // Si des batches ont échoué, on NE désactive PAS les reco absentes —
      // un AAP d'un batch raté n'a pas été jugé, le désactiver serait une perte.
      if (useFullForThis && failed === 0) {
        const idsList = Array.from(idsOuverts);
        await admin.from("projet_aap").update({ actif: false }).eq("projet_id", p.id).not("aap_id", "in", `(${idsList.map((id) => `"${id}"`).join(",") || '""'})`);
      }

      await admin.from("projets").update({ derniere_veille_le: nowIso }).eq("id", p.id);
      stats.projets_traites++;
    }

    await logRun(stats.batches_failed === 0, stats.batches_failed > 0 ? `${stats.batches_failed} batch(es) juge en echec` : null);
    return json({ ok: true, ...stats, input_tokens: usage.input, output_tokens: usage.output });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await logRun(false, msg);
    return json({ ok: false, error: msg, ...stats }, 500);
  }
});
