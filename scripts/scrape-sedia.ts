// ──────────────────────────────────────────────────────────────────────
// Pipeline de scraping SEDIA (Phase 2.6) — validation du pipeline complet :
//   appel API → structuration → mapping dispositif → extraction thématiques → stockage.
//
// Usage :  npx tsx scripts/scrape-sedia.ts [max]
// Écrit :  src/data/aap_sedia.json
//
// Ce script tourne côté Node (l'API SEDIA n'expose pas de CORS). Il servira de
// base au job planifié de la Phase 6.
// ──────────────────────────────────────────────────────────────────────

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { fetchOpenCalls } from "@/services/eu-api";
import type { Dispositif } from "@/types/dispositif";
import dispositifsData from "@/data/dispositifs.json" with { type: "json" };

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, "../src/data/aap_sedia.json");

const dispositifs = dispositifsData as unknown as Dispositif[];
const max = Number(process.argv[2] ?? 200);
const scrapedAt = new Date().toISOString();

console.log(`⏳ Récupération des topics Horizon Europe ouverts/à venir (max ${max})…`);

const aaps = await fetchOpenCalls({ dispositifs, max, scrapedAt });

// ── Validation ───────────────────────────────────────────────────────
const withDispositif = aaps.filter((a) => a.dispositif_id).length;
const withThematiques = aaps.filter((a) => a.thematiques.length > 0).length;
const withBudget = aaps.filter((a) => a.budget_total != null).length;
const withTrl = aaps.filter((a) => a.trl_min != null).length;
const byPilier = aaps.reduce<Record<string, number>>((acc, a) => {
  const k = a.pilier ?? "—";
  acc[k] = (acc[k] ?? 0) + 1;
  return acc;
}, {});
const byStatut = aaps.reduce<Record<string, number>>((acc, a) => {
  acc[a.statut] = (acc[a.statut] ?? 0) + 1;
  return acc;
}, {});

console.log(`\n✅ ${aaps.length} AAP structurés`);
console.log(`   • rattachés à un dispositif : ${withDispositif}/${aaps.length}`);
console.log(`   • avec thématiques détectées : ${withThematiques}/${aaps.length}`);
console.log(`   • avec budget : ${withBudget}/${aaps.length}`);
console.log(`   • avec TRL : ${withTrl}/${aaps.length}`);
console.log(`   • par pilier :`, byPilier);
console.log(`   • par statut :`, byStatut);

console.log(`\n── Échantillon (5 premiers) ──`);
for (const a of aaps.slice(0, 5)) {
  console.log(`\n• ${a.id} — ${a.titre.slice(0, 70)}`);
  console.log(`  pilier=${a.pilier} cluster=${a.cluster} type=${a.type_action} statut=${a.statut}`);
  console.log(`  dispositif_id=${a.dispositif_id} deadline=${a.date_cloture?.slice(0, 10)}`);
  console.log(`  budget_total=${a.budget_total} budget/projet=${a.budget_par_projet} TRL=${a.trl_min}-${a.trl_max}`);
  console.log(`  thématiques=[${a.thematiques.join(", ")}]`);
}

writeFileSync(OUT, JSON.stringify(aaps, null, 2), "utf-8");
console.log(`\n💾 Écrit ${aaps.length} AAP → ${OUT}`);
