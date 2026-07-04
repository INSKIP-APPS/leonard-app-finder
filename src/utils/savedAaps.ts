import { useSyncExternalStore } from "react";

// ──────────────────────────────────────────────────────────────────────
// Éléments sauvegardés — petits stores partagés (localStorage), sans
// dépendance. DEUX stores distincts : les AAP et les dispositifs vivent dans
// des clés séparées (les ids "disp-XXX" mélangés aux AAP n'apparaissaient
// nulle part au Dashboard). Utilisés par les fiches (bouton Sauvegarder) ET
// le tableau de bord (bloc « Sauvegardés ») — mise à jour réactive partout.
// ──────────────────────────────────────────────────────────────────────

function createSavedStore(key: string) {
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
      if (s.has(id)) s.delete(id);
      else s.add(id);
      write([...s]);
    },
    remove(predicate: (id: string) => boolean): string[] {
      const removed = cache.filter(predicate);
      if (removed.length) write(cache.filter((id) => !predicate(id)));
      return removed;
    },
    add(ids: string[]): void {
      if (ids.length) write([...new Set([...cache, ...ids])]);
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

const aapStore = createSavedStore("leonard_saved_aaps");
const dispositifStore = createSavedStore("leonard_saved_dispositifs");

// Migration : les dispositifs sauvegardés avant la séparation des clés
// (ids "disp-XXX") sont déplacés de la clé AAP vers la clé dispositifs.
if (typeof window !== "undefined") {
  const migres = aapStore.remove((id) => id.startsWith("disp-"));
  dispositifStore.add(migres);
}

// ── AAP ───────────────────────────────────────────────────────────────

export const toggleSaved = aapStore.toggle;

/** Hook : liste réactive des IDs d'AAP sauvegardés. */
export function useSavedIds(): string[] {
  return useSyncExternalStore(aapStore.subscribe, aapStore.getSnapshot, aapStore.getSnapshot);
}

// ── Dispositifs ───────────────────────────────────────────────────────

export const toggleSavedDispositif = dispositifStore.toggle;

/** Hook : liste réactive des IDs de dispositifs sauvegardés. */
export function useSavedDispositifIds(): string[] {
  return useSyncExternalStore(
    dispositifStore.subscribe,
    dispositifStore.getSnapshot,
    dispositifStore.getSnapshot,
  );
}
