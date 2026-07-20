// ──────────────────────────────────────────────────────────────────────
// Couche d'accès aux données (Phase 3.3).
//
// C'est le POINT D'ENTRÉE UNIQUE de l'UI vers les données. Il masque la source :
//   • si Supabase est configuré (VITE_SUPABASE_*)  → requêtes Supabase ;
//   • sinon                                         → fichiers JSON embarqués.
//
// L'UI n'importe donc jamais les JSON directement : elle appelle getDispositifs()
// / getAaps() et fonctionne à l'identique dans les deux modes.
// ──────────────────────────────────────────────────────────────────────

import { supabase } from "./supabase";
import type { Dispositif } from "@/types/dispositif";
import type { AAP } from "@/types/aap";
import { empreinteTitre } from "@/utils/text";

// Données de repli LOCAL (dev sans Supabase). Chargées à la demande via import()
// dynamique : elles ne sont PAS embarquées dans le bundle principal en prod
// (où Supabase est configuré et le repli jamais utilisé).
let _localDispositifs: Dispositif[] | null = null;
let _localAaps: AAP[] | null = null;
async function loadLocalDispositifs(): Promise<Dispositif[]> {
  if (!_localDispositifs)
    _localDispositifs = (await import("@/data/dispositifs.json"))
      .default as unknown as Dispositif[];
  return _localDispositifs;
}
async function loadLocalAaps(): Promise<AAP[]> {
  if (!_localAaps) _localAaps = (await import("@/data/aap_sedia.json")).default as unknown as AAP[];
  return _localAaps;
}

/** Indique la source de données active (utile pour l'affichage / debug). */
export const dataSource: "supabase" | "local" = supabase ? "supabase" : "local";

// ── Lecture ──────────────────────────────────────────────────────────

export async function getDispositifs(): Promise<Dispositif[]> {
  if (!supabase) return loadLocalDispositifs();
  const { data, error } = await supabase.from("dispositifs").select("data");
  if (error) throw new Error(`getDispositifs: ${error.message}`);
  return (data ?? []).map((row) => row.data as Dispositif);
}

export interface AapFilter {
  dispositifId?: string;
  statut?: AAP["statut"];
  cluster?: string;
}

// ── Déduplication inter-sources (Phase 6.1) ────────────────────────────
//
// Un même AAP peut être relayé par plusieurs portails (ex. une aide ADEME
// présente sur ADEME Agir + Aides-territoires + les-aides.fr). La clé primaire
// `id` (préfixée par source) ne les fusionne pas. On collapse donc À LA LECTURE,
// par empreinte de titre, en gardant la source la plus fiable. Non destructif :
// toutes les lignes restent en base, seule l'lecture masque les redondances.

/** Priorité des sources : plus le nombre est petit, plus la source est prioritaire (conservée). */
const SOURCE_PRIORITY: Record<string, number> = {
  "ADEME (Agir pour la transition)": 1,
  Bpifrance: 2,
  "Banque des Territoires (France 2030)": 3,
  "appelsprojetsrecherche.fr": 4,
  "les-aides.fr": 5,
  "Aides-territoires": 6,
  "EU Funding & Tenders (SEDIA)": 7,
};
const sourceRank = (s: string | undefined) => SOURCE_PRIORITY[s ?? ""] ?? 99;

/** Empreinte de fusion = titre normalisé (sans accents ni ponctuation). */
function empreinte(a: AAP): string {
  return empreinteTitre(a.titre || "");
}

/**
 * Fusionne les AAP partageant la même empreinte : on conserve la ligne de la
 * source prioritaire, on liste les autres sources dans `sources_multiples`, et
 * on complète une `date_cloture` manquante depuis une source sœur si possible.
 */
export function dedupeAaps(aaps: AAP[]): AAP[] {
  const clusters = new Map<string, AAP[]>();
  for (const a of aaps) {
    const key = empreinte(a);
    if (!key) {
      clusters.set(`__${a.id}`, [a]);
      continue;
    } // titre vide → jamais fusionné
    const arr = clusters.get(key);
    if (arr) arr.push(a);
    else clusters.set(key, [a]);
  }
  const out: AAP[] = [];
  for (const group of clusters.values()) {
    if (group.length === 1) {
      out.push(group[0]);
      continue;
    }
    const sorted = [...group].sort((x, y) => sourceRank(x.source) - sourceRank(y.source));
    const rep = { ...sorted[0] };
    const autres = [
      ...new Set(
        sorted
          .slice(1)
          .map((g) => g.source)
          .filter((s) => s && s !== rep.source),
      ),
    ];
    rep.sources_multiples = autres.length ? autres : null;
    if (rep.date_cloture == null) {
      const sibling = sorted.find((g) => g.date_cloture != null);
      if (sibling) rep.date_cloture = sibling.date_cloture;
    }
    out.push(rep);
  }
  return out;
}

export async function getAaps(filter: AapFilter = {}): Promise<AAP[]> {
  if (!supabase) {
    const localAaps = await loadLocalAaps();
    return dedupeAaps(
      localAaps.filter(
        (a) =>
          (!filter.dispositifId || a.dispositif_id === filter.dispositifId) &&
          (!filter.statut || a.statut === filter.statut) &&
          (!filter.cluster || a.cluster === filter.cluster),
      ),
    );
  }
  // PostgREST plafonne à 1000 lignes/requête → on pagine par lots de 1000.
  // On charge `data` + les colonnes plates de standardisation Leonard
  // (`titre_std`, `description_std`) que les scrapers n'écrasent pas. Ces
  // colonnes prennent la priorité à l'affichage, avec fallback sur `data.*`
  // pour les fiches jamais standardisées (nouveaux AAP fraîchement scrapés).
  const PAGE = 1000;
  const all: AAP[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = supabase
      .from("aaps")
      .select("data, titre_std, description_std")
      // .order("id") : ordre stable entre les lots paginés (BUG-014), sinon
      // PostgREST peut renvoyer des doublons/omissions entre deux pages.
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (filter.dispositifId) q = q.eq("dispositif_id", filter.dispositifId);
    if (filter.statut) q = q.eq("statut", filter.statut);
    if (filter.cluster) q = q.eq("cluster", filter.cluster);
    const { data, error } = await q;
    if (error) throw new Error(`getAaps: ${error.message}`);
    const batch = (data ?? []).map((row) => {
      const aap = { ...(row.data as AAP) };
      if (row.titre_std) aap.titre = row.titre_std;
      if (row.description_std) aap.description = row.description_std;
      return aap;
    });
    all.push(...batch);
    if (batch.length < PAGE) break;
  }
  return dedupeAaps(all);
}

/**
 * Charge UN seul AAP par id (fiche détaillée), sans tirer tout le catalogue.
 * Applique le même mapping titre_std/description_std que getAaps. Renvoie null
 * si introuvable. Évite de charger ~2600 lignes juste pour en résoudre une
 * (perf #2 + corrige PERF-003 : la fiche s'ouvre sans dépendre du gros fetch).
 */
export async function getAapById(id: string): Promise<AAP | null> {
  if (!supabase) {
    const localAaps = await loadLocalAaps();
    return localAaps.find((a) => a.id === id) ?? null;
  }
  const { data, error } = await supabase
    .from("aaps")
    .select("data, titre_std, description_std")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getAapById: ${error.message}`);
  if (!data) return null;
  const aap = { ...(data.data as AAP) };
  if (data.titre_std) aap.titre = data.titre_std;
  if (data.description_std) aap.description = data.description_std;
  return aap;
}

// ── Écriture (CRUD AAP — utilisé par le pipeline de scraping) ──────────

/** Colonnes scalaires dérivées d'un AAP pour l'indexation Supabase. */
function aapRow(a: AAP) {
  return {
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
    updated_at: new Date().toISOString(),
  };
}

/** Upsert (insert/update) d'un lot d'AAP. No-op en mode local. */
export async function upsertAaps(aaps: AAP[]): Promise<number> {
  if (!supabase) {
    console.warn("upsertAaps: Supabase non configuré, écriture ignorée (mode local).");
    return 0;
  }
  const { error } = await supabase.from("aaps").upsert(aaps.map(aapRow), { onConflict: "id" });
  if (error) throw new Error(`upsertAaps: ${error.message}`);
  return aaps.length;
}

function dispositifRow(d: Dispositif) {
  return {
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
    updated_at: new Date().toISOString(),
  };
}

/** Upsert d'un lot de dispositifs (import Excel). No-op en mode local. */
export async function upsertDispositifs(dispositifs: Dispositif[]): Promise<number> {
  if (!supabase) {
    console.warn("upsertDispositifs: Supabase non configuré, écriture ignorée (mode local).");
    return 0;
  }
  const { error } = await supabase
    .from("dispositifs")
    .upsert(dispositifs.map(dispositifRow), { onConflict: "id" });
  if (error) throw new Error(`upsertDispositifs: ${error.message}`);
  return dispositifs.length;
}

// ── Projets (CRUD — préparé pour le matching, Phase 4/5) ───────────────

export interface Projet {
  id?: string;
  nom: string;
  filiale?: string | null;
  description?: string | null;
  trl?: number | null;
  mots_cles?: string[];
}

export async function getProjets(): Promise<Projet[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from("projets").select("*").order("created_at");
  if (error) throw new Error(`getProjets: ${error.message}`);
  return (data ?? []) as Projet[];
}

/**
 * Enregistre une DEMANDE de matching (page Matching à la demande).
 * Chaque lancement crée une ligne dans `projets` : colonnes scalaires pour
 * l'indexation + `data` (jsonb) pour le détail complet de la saisie. No-op en
 * mode local ; ne bloque jamais l'UI (erreurs seulement loguées).
 */
export async function saveMatchingRequest(input: {
  nom: string;
  description?: string;
  filiale?: string;
  trl?: number | null;
  secteurs?: string[];
  region?: string;
  profil?: string;
  budget?: string;
  financement?: string;
  motsCles?: string[];
  nb_resultats?: number;
  extra?: Record<string, unknown>;
}): Promise<void> {
  if (!supabase) return;
  if (!input.nom?.trim()) return; // on ne journalise pas une saisie vide
  // Depuis la sécurité étape 2 : la table `projets` est fermée à `anon`.
  // On skip silencieusement si aucune session (mode démo publique).
  const { data: sess } = await supabase.auth.getSession();
  if (!sess.session) return;
  const row = {
    nom: input.nom.trim(),
    filiale: input.filiale || null,
    description: input.description || null,
    trl: input.trl ?? null,
    mots_cles: input.motsCles ?? [],
    data: { ...input, saved_at: new Date().toISOString() },
  };
  const { error } = await supabase.from("projets").insert(row);
  if (error) console.warn(`saveMatchingRequest: ${error.message}`);
}

export async function upsertProjet(projet: Projet): Promise<Projet | null> {
  if (!supabase) {
    console.warn("upsertProjet: Supabase non configuré.");
    return null;
  }
  const { data, error } = await supabase.from("projets").upsert(projet).select().single();
  if (error) throw new Error(`upsertProjet: ${error.message}`);
  return data as Projet;
}

export async function deleteProjet(id: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from("projets").delete().eq("id", id);
  if (error) throw new Error(`deleteProjet: ${error.message}`);
}

// ── Administration : suivi & fréquence du scraping (Phase 6) ───────────

export interface ScrapeLog {
  id: number;
  run_at: string;
  fetched: number;
  nouveaux: number;
  mis_a_jour: number;
  fermes: number;
  duration_ms: number | null;
  ok: boolean;
  error: string | null;
}

/** Fréquences proposées (presets validés côté serveur). */
export type ScrapeFrequency = "quotidien" | "hebdo_lundi" | "bihebdo" | "mensuel";

export const FREQUENCY_LABELS: Record<ScrapeFrequency, string> = {
  quotidien: "Chaque jour (~8h)",
  hebdo_lundi: "Chaque lundi (~8h)",
  bihebdo: "Lundi & jeudi (~8h)",
  mensuel: "Le 1er du mois (~8h)",
};

const CRON_TO_FREQUENCY: Record<string, ScrapeFrequency> = {
  "0 6 * * *": "quotidien",
  "0 6 * * 1": "hebdo_lundi",
  "0 6 * * 1,4": "bihebdo",
  "0 6 1 * *": "mensuel",
};

/** Historique des exécutions du scraping (les plus récentes d'abord). */
export async function getScrapeLogs(limit = 30): Promise<ScrapeLog[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("scrape_logs")
    .select("*")
    .order("run_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`getScrapeLogs: ${error.message}`);
  return (data ?? []) as ScrapeLog[];
}

/** Fréquence courante (déduite de l'expression cron), ou null. */
export async function getScrapeFrequency(): Promise<{
  frequency: ScrapeFrequency | null;
  cron: string | null;
}> {
  if (!supabase) return { frequency: null, cron: null };
  const { data, error } = await supabase.rpc("get_scrape_schedule");
  if (error) throw new Error(`getScrapeFrequency: ${error.message}`);
  const cron = (data as string | null) ?? null;
  return { frequency: cron ? (CRON_TO_FREQUENCY[cron] ?? null) : null, cron };
}

/** Change la fréquence du scraping (preset validé côté serveur). */
export async function setScrapeFrequency(preset: ScrapeFrequency): Promise<void> {
  if (!supabase) throw new Error("Supabase non configuré.");
  const { error } = await supabase.rpc("set_scrape_frequency", { preset });
  if (error) throw new Error(`setScrapeFrequency: ${error.message}`);
}

/**
 * Déclenche un scraping immédiat via le même chemin serveur que le cron
 * (RPC → net.http_post → Edge Function). Asynchrone : renvoie dès que la requête
 * est mise en file ; le résultat apparaît ensuite dans l'historique (scrape_logs).
 */
export async function runScrapeNow(): Promise<{ ok: boolean; message?: string }> {
  if (!supabase) return { ok: false, message: "Supabase non configuré." };
  const { error } = await supabase.rpc("run_scrape_now");
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

// ── Administration : utilisateurs & rôles (Sécurité étape 2 phase D) ─

export type Role = "admin" | "editeur" | "lecture";
export interface AdminUser {
  id: string;
  email: string;
  nom: string | null;
  entite: string | null;
  role: Role;
  created_at: string;
  last_sign_in_at: string | null;
}

/** Liste tous les utilisateurs (admin uniquement — fonction SQL protégée). */
export async function adminListUsers(): Promise<AdminUser[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("admin_list_users");
  if (error) throw new Error(`adminListUsers: ${error.message}`);
  return (data ?? []) as AdminUser[];
}

/** Change le rôle d'un utilisateur (admin uniquement — garde interne). */
export async function adminSetRole(userId: string, role: Role): Promise<void> {
  if (!supabase) throw new Error("Supabase non configuré.");
  const { error } = await supabase.rpc("admin_set_role", { target_id: userId, new_role: role });
  if (error) throw new Error(`adminSetRole: ${error.message}`);
}

/** Envoie une invitation email à un nouveau contributeur (via Edge Function admin). */
export async function adminInviteUser(input: {
  email: string;
  nom?: string;
  entite?: string;
  role?: Role;
}): Promise<{ ok: boolean; message?: string }> {
  if (!supabase) return { ok: false, message: "Supabase non configuré." };
  // On récupère le JWT de session pour l'envoyer explicitement en Authorization.
  const { data: sess } = await supabase.auth.getSession();
  const token = sess.session?.access_token;
  if (!token) return { ok: false, message: "Session expirée — reconnectez-vous." };
  const url = import.meta.env.VITE_SUPABASE_URL as string;
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
  try {
    const redirectTo = `${window.location.origin}/auth/callback`;
    const res = await fetch(`${url}/functions/v1/admin-invite-user`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        apikey: anon,
      },
      body: JSON.stringify({ ...input, redirectTo }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body?.ok === false) {
      return { ok: false, message: body?.error || `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}
