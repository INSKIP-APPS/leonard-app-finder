// ──────────────────────────────────────────────────────────────────────
// Edge Function : claude-judge (V2.1 — le juge de pertinence du matching)
//
// Reçoit un projet + ~30 candidats présélectionnés (couche lexicale) et rend,
// pour CHACUN, un VERDICT BINAIRE STRICT : pertinent oui/non + argumentaire
// court. C'est lui qui transforme le matching en « moteur de réponse » :
// seuls les OUI sont affichés à l'utilisateur.
//
// Modèle : Haiku 4.5 (rapport qualité/coût optimal pour un jugement binaire
// sur titre+description ; surclassable via le secret JUDGE_MODEL).
// Batches de 10 candidats, appels en parallèle. Clé côté serveur uniquement.
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

const SYSTEM = `Tu es un expert des financements publics de l'innovation (aides françaises : ADEME, Bpifrance, Régions, agences de l'eau ; et européennes : Horizon Europe, CEF, LIFE, EIC).
On te donne UN projet d'innovation et une liste d'appels à projets / aides (AAP) candidats.

Ta mission : pour CHAQUE AAP, rendre un VERDICT BINAIRE STRICT — cet AAP peut-il financer CE projet précis ?

Règles de jugement :
- STRICT : dans le doute, pertinent=false. Partager un domaine (« énergie », « bâtiment ») ne suffit PAS : l'objet de l'AAP doit correspondre à l'objet du projet.
- Un AAP qui finance un AUTRE objet du même domaine (ex. solaire thermique pour un projet hydrogène) → false.
- Un AAP pertinent sur le fond mais avec une contrainte (consortium requis, portage laboratoire, plafond bas, TRL décalé) → true, avec la contrainte dans points_attention. Les contraintes ne disqualifient pas.
- Les AAP génériques « accompagnement / études » ne sont true QUE s'ils peuvent réellement financer une étape de CE projet.
- Ne JAMAIS inventer d'information absente de la description fournie.

Réponds UNIQUEMENT en JSON valide, sans texte autour, au format :
{"results":[{"id":"...","pertinent":true|false,"raison":"1-2 phrases en français : pourquoi cet AAP correspond (ou non) à CE projet, en citant l'élément décisif","points_attention":["0 à 2 points de vigilance"],"motif_ecart":"si pertinent=false : motif court (ex. 'Finance le solaire thermique, pas l'hydrogène')"}]}
Un objet par AAP fourni, dans le même ordre, avec l'id exact.`;

function parseJsonLenient(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return JSON.parse(m[0]);
      } catch {
        /* tombe en erreur ci-dessous */
      }
    }
    throw new Error("réponse non-JSON du modèle");
  }
}

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
  const model = Deno.env.get("JUDGE_MODEL") || "claude-haiku-4-5-20251001";

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const projet = payload.projet ?? {};
  const candidats = (payload.candidats ?? []).slice(0, 40);
  if (candidats.length === 0) return json({ results: [] });

  const projetBloc = `PROJET\n- Nom : ${projet.nom || "(non précisé)"}\n- Description : ${(projet.description || "(non précisée)").slice(0, 2000)}\n- Secteurs : ${(projet.secteurs ?? []).join(", ") || "(non précisés)"}\n- Type de porteur : ${projet.typeActeur || "(non précisé)"}\n- TRL : ${projet.trl ?? "(non précisé)"}\n- Localisation : ${projet.region || "(non précisée)"}\n- Financement recherché : ${projet.financementRecherche || "(non précisé)"}\n- Contexte : ${(projet.motsClesLibres || "").slice(0, 400)}`;

  const compact = (c: any) => ({
    id: c.id,
    titre: c.titre,
    source: c.source ?? null,
    type_action: c.type_action ?? null,
    trl: c.trl ?? null,
    thematiques: c.thematiques ?? [],
    montant: c.montant ?? null,
    signaux: c.flags ?? [],
    description: (c.description ?? "").slice(0, 1200),
  });

  // Batches de 10, en parallèle. Un batch qui échoue n'invalide pas les autres.
  const chunks: any[][] = [];
  for (let i = 0; i < candidats.length; i += 10) chunks.push(candidats.slice(i, i + 10));

  const client = new Anthropic({ apiKey });

  const settled = await Promise.allSettled(
    chunks.map((chunk) =>
      client.messages
        .create({
          model,
          max_tokens: 3500,
          system: SYSTEM,
          messages: [
            {
              role: "user",
              content: `${projetBloc}\n\nAAP CANDIDATS (${chunk.length}) :\n${JSON.stringify(chunk.map(compact), null, 1)}`,
            },
          ],
        })
        .then((resp) => {
          const tb = resp.content.find((b: any) => b.type === "text");
          const text = tb && "text" in tb ? (tb as any).text : "{}";
          const parsed = parseJsonLenient(text);
          return (parsed.results ?? []) as any[];
        }),
    ),
  );

  const results: any[] = [];
  let failed = 0;
  for (const s of settled) {
    if (s.status === "fulfilled") results.push(...s.value);
    else failed++;
  }

  if (results.length === 0 && failed > 0) {
    return json({ error: "anthropic_error", message: "Tous les batches du juge ont échoué." }, 502);
  }
  return json({ results, model, batches: chunks.length, failed_batches: failed });
});
