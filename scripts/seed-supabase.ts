// ──────────────────────────────────────────────────────────────────────
// Seed Supabase (Phase 3) — pousse dispositifs.json + aap_sedia.json vers
// les tables Supabase. Utilise la clé service_role (bypass RLS).
//
// Prérequis : avoir exécuté supabase/migrations/0001_init.sql, puis renseigné
//   SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY (dans .env ou l'environnement).
//
// Usage :  npx tsx scripts/seed-supabase.ts
// ──────────────────────────────────────────────────────────────────────

import { createClient } from "@supabase/supabase-js";
import dispositifsJson from "@/data/dispositifs.json" with { type: "json" };
import aapsJson from "@/data/aap_sedia.json" with { type: "json" };
import type { Dispositif } from "@/types/dispositif";
import type { AAP } from "@/types/aap";

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error(
    "❌ SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont requis.\n" +
      "   Renseigne-les dans .env (voir .env.example) puis relance.",
  );
  process.exit(1);
}

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

const dispositifs = dispositifsJson as unknown as Dispositif[];
const aaps = aapsJson as unknown as AAP[];
const now = new Date().toISOString();

const dispositifRows = dispositifs.map((d) => ({
  id: d.id,
  numero: d.numero,
  nom: d.nom,
  organisme: d.organisme,
  echelle: d.echelle,
  programme: d.programme,
  statut_ouverture: d.statut_ouverture,
  pertinence_vinci: d.pertinence_vinci,
  montant: d.montant,
  trl_min: d.trl_min,
  trl_max: d.trl_max,
  data: d,
  updated_at: now,
}));

const aapRows = aaps.map((a) => ({
  id: a.id,
  titre: a.titre,
  programme: a.programme,
  pilier: a.pilier,
  cluster: a.cluster,
  statut: a.statut,
  type_action: a.type_action,
  date_ouverture: a.date_ouverture,
  date_cloture: a.date_cloture,
  budget_total: a.budget_total,
  budget_par_projet: a.budget_par_projet,
  trl_min: a.trl_min,
  trl_max: a.trl_max,
  thematiques: a.thematiques,
  dispositif_id: a.dispositif_id,
  data: a,
  date_scraping: a.date_scraping,
  updated_at: now,
}));

console.log(`⏳ Seed dispositifs (${dispositifRows.length})…`);
const r1 = await supabase.from("dispositifs").upsert(dispositifRows, { onConflict: "id" });
if (r1.error) throw new Error(`dispositifs: ${r1.error.message}`);

console.log(`⏳ Seed aaps (${aapRows.length})…`);
const r2 = await supabase.from("aaps").upsert(aapRows, { onConflict: "id" });
if (r2.error) throw new Error(`aaps: ${r2.error.message}`);

console.log(`✅ Seed terminé : ${dispositifRows.length} dispositifs, ${aapRows.length} AAP.`);
