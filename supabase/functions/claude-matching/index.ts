// ──────────────────────────────────────────────────────────────────────
// Edge Function : claude-matching (Phase 4, Couche 2 — matching sémantique)
//
// Reçoit un projet + une liste d'AAP pré-filtrés (Couche 1) et demande à Claude
// (Sonnet 5) un score sémantique + raisons/points d'attention en langage naturel.
// La clé API Anthropic reste côté serveur (secret Supabase ANTHROPIC_API_KEY) —
// jamais exposée au navigateur.
//
// Déploiement : via le connecteur MCP (verify_jwt=false ; l'app appelle avec la
// clé publishable qui n'est pas un JWT). Secret requis : ANTHROPIC_API_KEY.
// ──────────────────────────────────────────────────────────────────────

import Anthropic from "npm:@anthropic-ai/sdk@0.68.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

interface AapIn {
  id: string;
  titre: string;
  description?: string;
  thematiques?: string[];
  type_action?: string;
  cluster?: string | null;
  trl_min?: number | null;
  trl_max?: number | null;
}

interface ProjetIn {
  nom?: string;
  description?: string;
  secteurs?: string[];
  trl?: number | null;
  region?: string;
  financementRecherche?: string;
  motsClesLibres?: string;
}

const SYSTEM = `Tu es un expert en financements publics européens de l'innovation (Horizon Europe, EIC, Missions, partenariats).
On te donne un PROJET d'innovation et une liste d'APPELS À PROJETS (AAP) déjà pré-filtrés.
Pour CHAQUE AAP, évalue au-delà des mots-clés si le FOND du projet correspond réellement aux objectifs de l'appel.

Consignes :
- score_semantique : entier 0-100 (pertinence réelle projet ↔ AAP).
- raisons : 2-3 raisons concrètes du match, en français, en langage naturel (cite le volet du projet qui répond à l'axe de l'AAP).
- points_attention : 1-2 points de vigilance contextualisés (ex : exigence de consortium, co-financement, dimension manquante).
- elements_manquants : 0-2 éléments que le projet devrait ajouter pour être compétitif sur cet AAP.
- N'INVENTE JAMAIS d'information absente de la description de l'AAP. Si l'info manque, dis-le.
Réponds UNIQUEMENT via le format structuré demandé, pour tous les AAP fournis, dans le même ordre.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    results: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          score_semantique: { type: "integer" },
          raisons: { type: "array", items: { type: "string" } },
          points_attention: { type: "array", items: { type: "string" } },
          elements_manquants: { type: "array", items: { type: "string" } },
        },
        required: ["id", "score_semantique", "raisons", "points_attention", "elements_manquants"],
      },
    },
  },
  required: ["results"],
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return json(
      { error: "not_configured", message: "Secret ANTHROPIC_API_KEY absent — configure-le dans Supabase." },
      503,
    );
  }

  let payload: { projet?: ProjetIn; aaps?: AapIn[] };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const projet = payload.projet ?? {};
  const aaps = (payload.aaps ?? []).slice(0, 20); // jamais plus de 20 (coût API)
  if (aaps.length === 0) return json({ results: [] });

  // Descriptions tronquées (limite les tokens).
  const aapsCompact = aaps.map((a) => ({
    id: a.id,
    titre: a.titre,
    cluster: a.cluster ?? null,
    type_action: a.type_action ?? null,
    trl: a.trl_min != null || a.trl_max != null ? `${a.trl_min ?? "?"}-${a.trl_max ?? "?"}` : null,
    thematiques: a.thematiques ?? [],
    description: (a.description ?? "").slice(0, 1500),
  }));

  const userContent = `PROJET
- Nom : ${projet.nom || "(non précisé)"}
- Description : ${(projet.description || "(non précisée)").slice(0, 2000)}
- Secteurs : ${(projet.secteurs ?? []).join(", ") || "(non précisés)"}
- TRL : ${projet.trl ?? "(non précisé)"}
- Région : ${projet.region || "(non précisée)"}
- Financement recherché : ${projet.financementRecherche || "(non précisé)"}
- Mots-clés / contexte : ${(projet.motsClesLibres || "").slice(0, 500)}

APPELS À PROJETS (${aapsCompact.length}) :
${JSON.stringify(aapsCompact, null, 1)}`;

  const client = new Anthropic({ apiKey });

  try {
    const resp = await client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 12000,
      thinking: { type: "disabled" },
      system: SYSTEM,
      output_config: { format: { type: "json_schema", schema: SCHEMA } },
      messages: [{ role: "user", content: userContent }],
    });

    const textBlock = resp.content.find((b) => b.type === "text");
    const text = textBlock && "text" in textBlock ? textBlock.text : "{}";
    const parsed = JSON.parse(text);
    return json({ results: parsed.results ?? [], model: resp.model });
  } catch (e) {
    return json({ error: "anthropic_error", message: String(e?.message ?? e) }, 502);
  }
});
