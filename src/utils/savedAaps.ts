import { useSyncExternalStore } from "react";
import { supabase } from "@/services/supabase";

// ──────────────────────────────────────────────────────────────────────
// Éléments sauvegardés — stores partagés AAP / dispositifs.
//
// Depuis l'Option B (page « Sauvegardés »), la référence est la table
// `sauvegardes` côté Supabase (une ligne par utilisateur × élément) : les
// sauvegardes suivent le compte, pas le navigateur. Le localStorage sert de
// miroir local : affichage immédiat au chargement, et repli silencieux si la
// base est injoignable (les écritures serveur sont fire-and-forget, jamais
// bloquantes). À la connexion, les sauvegardes locales historiques sont
// reprises en base une seule fois, puis le serveur fait foi.
// ──────────────────────────────────────────────────────────────────────

type ItemType = "aap" | "dispositif";

/** Posé une fois la reprise du localStorage historique effectuée en base. */
const PUSHED_FLAG = "leonard_saved_pushed_v1";

function createSavedStore(key: string, itemType: ItemType) {
  const listeners = new Set<() => void>();

  function read(): string[] {
    try {
      return JSON.parse(localStorage.getItem(key) || "[]");
    } catch {
      return [];
    }
  }

  let cache: string[] = typeof window !== "undefined" ? read() : [];

  function write(ids: string[]) {
    cache = ids;
    try {
      localStorage.setItem(key, JSON.stringify(cache));
    } catch {
      /* localStorage indisponible : on garde au moins l'état en mémoire */
    }
    for (const l of listeners) l();
  }

  return {
    toggle(id: string): void {
      const s = new Set(cache);
      const ajout = !s.has(id);
      if (ajout) s.add(id);
      else s.delete(id);
      write([...s]);
      void pushToggle(itemType, id, ajout);
    },
    remove(predicate: (id: string) => boolean): string[] {
      const removed = cache.filter(predicate);
      if (removed.length) write(cache.filter((id) => !predicate(id)));
      return removed;
    },
    add(ids: string[]): void {
      if (ids.length) write([...new Set([...cache, ...ids])]);
    },
    /** Remplace tout l'état local par l'état serveur (ordre d'ajout conservé). */
    replace(ids: string[]): void {
      write(ids);
    },
    subscribe(l: () => void): () => void {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    getSnapshot(): string[] {
      return cache;
    },
  };
}

const aapStore = createSavedStore("leonard_saved_aaps", "aap");
const dispositifStore = createSavedStore("leonard_saved_dispositifs", "dispositif");

// Migration : les dispositifs sauvegardés avant la séparation des clés
// (ids "disp-XXX") sont déplacés de la clé AAP vers la clé dispositifs.
if (typeof window !== "undefined") {
  const migres = aapStore.remove((id) => id.startsWith("disp-"));
  dispositifStore.add(migres);
}

// ── Synchronisation serveur ───────────────────────────────────────────

/** Propage un ajout/retrait vers la table `sauvegardes` (jamais bloquant). */
async function pushToggle(itemType: ItemType, id: string, ajout: boolean): Promise<void> {
  if (!supabase) return;
  try {
    if (ajout) {
      const { error } = await supabase
        .from("sauvegardes")
        .upsert(
          { item_type: itemType, item_id: id },
          { onConflict: "user_id,item_type,item_id", ignoreDuplicates: true },
        );
      if (error) console.warn(`sauvegardes: écriture serveur échouée (${error.message})`);
    } else {
      const { error } = await supabase
        .from("sauvegardes")
        .delete()
        .match({ item_type: itemType, item_id: id });
      if (error) console.warn(`sauvegardes: suppression serveur échouée (${error.message})`);
    }
  } catch {
    /* hors-ligne : le miroir local reste juste, la prochaine sync réconciliera */
  }
}

let syncEnCours = false;
let syncFaite = false;

/**
 * Aligne les stores locaux sur la table `sauvegardes` de l'utilisateur
 * connecté. Au tout premier passage sur ce navigateur, les sauvegardes
 * localStorage historiques sont d'abord reprises en base (une seule fois).
 */
async function syncDepuisServeur(): Promise<void> {
  if (!supabase || syncEnCours || syncFaite) return;
  syncEnCours = true;
  try {
    // 1. Reprise de l'existant local vers la base. Tentée à chaque sync tant
    // qu'un aller-retour complet n'a pas abouti (drapeau posé en fin de
    // parcours seulement) : des sauvegardes faites pendant une indispo serveur
    // ne peuvent donc pas être écrasées par la première sync qui réussit.
    const repriseFaite = Boolean(localStorage.getItem(PUSHED_FLAG));
    if (!repriseFaite) {
      const rows = [
        ...aapStore.getSnapshot().map((id) => ({ item_type: "aap", item_id: id })),
        ...dispositifStore
          .getSnapshot()
          .map((id) => ({ item_type: "dispositif", item_id: id })),
      ];
      if (rows.length) {
        const { error } = await supabase
          .from("sauvegardes")
          .upsert(rows, { onConflict: "user_id,item_type,item_id", ignoreDuplicates: true });
        if (error) return; // table absente ou hors-ligne : on réessaiera plus tard
      }
    }

    // 2. Le serveur devient la référence (ordre = ordre d'ajout)
    const { data, error } = await supabase
      .from("sauvegardes")
      .select("item_type, item_id")
      .order("created_at", { ascending: true });
    if (error || !data) return;
    aapStore.replace(data.filter((r) => r.item_type === "aap").map((r) => r.item_id));
    dispositifStore.replace(
      data.filter((r) => r.item_type === "dispositif").map((r) => r.item_id),
    );
    localStorage.setItem(PUSHED_FLAG, "1");
    syncFaite = true;
  } finally {
    syncEnCours = false;
  }
}

if (typeof window !== "undefined" && supabase) {
  supabase.auth.onAuthStateChange((event, session) => {
    // Sans session, un SELECT passerait en anonyme et renverrait [] sans
    // erreur (RLS) — ce qui écraserait le miroir local à tort.
    if ((event === "INITIAL_SESSION" || event === "SIGNED_IN") && session)
      void syncDepuisServeur();
    if (event === "SIGNED_OUT") {
      // Le poste peut être partagé : on ne laisse pas les sauvegardes du
      // compte précédent dans le miroir local.
      syncFaite = false;
      aapStore.replace([]);
      dispositifStore.replace([]);
    }
  });
}

// ── AAP ───────────────────────────────────────────────────────────────

export const toggleSaved = aapStore.toggle;

/** Hook : liste réactive des IDs d'AAP sauvegardés (ordre d'ajout). */
export function useSavedIds(): string[] {
  return useSyncExternalStore(aapStore.subscribe, aapStore.getSnapshot, aapStore.getSnapshot);
}

// ── Dispositifs ───────────────────────────────────────────────────────

export const toggleSavedDispositif = dispositifStore.toggle;

/** Hook : liste réactive des IDs de dispositifs sauvegardés (ordre d'ajout). */
export function useSavedDispositifIds(): string[] {
  return useSyncExternalStore(
    dispositifStore.subscribe,
    dispositifStore.getSnapshot,
    dispositifStore.getSnapshot,
  );
}
