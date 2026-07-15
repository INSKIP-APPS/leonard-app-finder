// ──────────────────────────────────────────────────────────────────────
// Edge Function : ingest-aaps (ingestion générique — enrichissement one-shot)
//
// Reçoit un lot d'AAP déjà préparé côté client (POST { source, aaps: [...] })
// et l'upsert dans `aaps`. Sert aux sources qu'on ne peut pas scraper depuis
// une edge function (fetch massif de N pages, sites protégés CloudFront scrapés
// via navigateur, etc.) : le client fait la collecte, cette fonction fait l'écriture
// avec la clé service_role + le rattachement dispositif.
//
// Chaque AAP entrant doit au minimum contenir : id, titre. Le reste est complété
// par des valeurs par défaut. `dispositif_id` est calculé si absent.
//
// ⚠️ UPSERT uniquement (jamais de fermeture). Non branché au cron.
//
// 🔒 SÉCURITÉ (étape 1) : appel refusé sauf si le header `x-ingest-secret`
// correspond exactement au secret `INGEST_SECRET` posé dans les Edge Function
// Secrets Supabase. Sans secret côté serveur → tout est refusé (fail-safe).
// ──────────────────────────────────────────────────────────────────────

import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-ingest-secret", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

// Comparaison de secret à temps constant (protection contre timing attacks)
function safeEqual(a: string | null | undefined, b: string | null | undefined) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

function norm(s: string) { return (s || "").toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, ""); }

type DispRow = { id: string; programme: string | null; nom: string; organisme: string | null };
function mapDispositif(titre: string, financeur: string, disp: DispRow[]): string | null {
  const tokens = [...new Set([...norm(financeur).split(/[^a-z0-9]+/), ...norm(titre).split(/[^a-z0-9]+/)])].filter((w) => w.length >= 4);
  let best: { id: string; score: number } | null = null;
  for (const d of disp) {
    const hay = norm(`${d.organisme ?? ""} ${d.programme ?? ""} ${d.nom}`);
    let score = 0;
    for (const t of tokens) if (hay.includes(t)) score += 2;
    if (score > 0 && (!best || score > best.score)) best = { id: d.id, score };
  }
  return best && best.score >= 4 ? best.id : null;
}

interface InAAP {
  id: string; titre: string; programme?: string; description?: string;
  statut?: string; date_ouverture?: string | null; date_cloture?: string | null;
  lien_officiel?: string; thematiques?: string[]; acteurs_eligibles?: string[];
  echelle?: string | null; type_action?: string; dispositif_id?: string | null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  // 🔒 Vérification du secret d'ingestion — refuse si absent des deux côtés.
  const expected = Deno.env.get("INGEST_SECRET");
  const received = req.headers.get("x-ingest-secret");
  if (!expected || !received || !safeEqual(expected, received)) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  const started = Date.now();
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const scrapedAt = new Date().toISOString();

  try {
    const body = await req.json().catch(() => null) as { source?: string; aaps?: InAAP[] } | null;
    const source = (body?.source ?? "").trim();
    const incoming = body?.aaps ?? [];
    if (!source) return json({ ok: false, error: "champ 'source' manquant" }, 400);
    if (!Array.isArray(incoming) || incoming.length === 0) return json({ ok: false, error: "aucun AAP fourni" }, 400);

    const { data: dispRows } = await supabase.from("dispositifs").select("id, programme, nom, organisme").in("echelle", ["National", "Régional"]);
    const disp = (dispRows ?? []) as DispRow[];

    const byId = new Map<string, Record<string, unknown>>();
    for (const a of incoming) {
      if (!a?.id || !a?.titre) continue;
      const financeur = a.programme || source;
      const thematiques = a.thematiques ?? [];
      const full = {
        id: a.id,
        titre: a.titre,
        programme: financeur,
        pilier: null, cluster: null, call_identifier: null,
        description: a.description ?? "",
        type_action: a.type_action ?? "Appel à projets",
        type_action_detail: null,
        statut: a.statut ?? "open",
        date_ouverture: a.date_ouverture ?? null,
        date_cloture: a.date_cloture ?? null,
        budget_total: null, budget_par_projet: null, trl_min: null, trl_max: null,
        mots_cles: thematiques,
        thematiques,
        acteurs_eligibles: a.acteurs_eligibles ?? ["Entreprise"],
        lien_officiel: a.lien_officiel ?? "",
        dispositif_id: a.dispositif_id ?? mapDispositif(a.titre, financeur, disp),
        echelle: a.echelle ?? "National",
        source,
        date_scraping: scrapedAt,
      };
      byId.set(a.id, full);
    }
    const aaps = [...byId.values()];

    const { data: existing } = await supabase.from("aaps").select("id").eq("source", source);
    const existingIds = new Set((existing ?? []).map((x: { id: string }) => x.id));
    const nouveaux = aaps.filter((a) => !existingIds.has(a.id as string)).length;
    const mis_a_jour = aaps.length - nouveaux;

    const dbRows = aaps.map((a) => ({
      id: a.id, titre: a.titre, programme: a.programme, pilier: a.pilier, cluster: a.cluster,
      statut: a.statut, type_action: a.type_action, date_ouverture: a.date_ouverture, date_cloture: a.date_cloture,
      budget_total: a.budget_total, budget_par_projet: a.budget_par_projet, trl_min: a.trl_min, trl_max: a.trl_max,
      thematiques: a.thematiques, dispositif_id: a.dispositif_id, data: a, date_scraping: a.date_scraping,
      source, updated_at: scrapedAt,
    }));
    for (let i = 0; i < dbRows.length; i += 200) {
      const { error } = await supabase.from("aaps").upsert(dbRows.slice(i, i + 200), { onConflict: "id" });
      if (error) throw new Error(`upsert: ${error.message}`);
    }

    const duration_ms = Date.now() - started;
    await supabase.from("scrape_logs").insert({ source, fetched: aaps.length, nouveaux, mis_a_jour, fermes: 0, duration_ms, ok: true });
    return json({ ok: true, source, fetched: aaps.length, nouveaux, mis_a_jour, duration_ms });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ ok: false, error: msg }, 500);
  }
});
