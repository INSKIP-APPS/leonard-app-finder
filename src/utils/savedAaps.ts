import { useSyncExternalStore } from "react";

// ──────────────────────────────────────────────────────────────────────
// AAP sauvegardés — petit store partagé (localStorage) sans dépendance.
// Utilisé par la fiche (bouton Sauvegarder) ET le tableau de bord (liste).
// Toute sauvegarde/désauvegarde met à jour les deux en direct.
// ──────────────────────────────────────────────────────────────────────

const KEY = "leonard_saved_aaps";
const listeners = new Set<() => void>();

function read(): string[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}

let cache: string[] = typeof window !== "undefined" ? read() : [];

function emit() {
  for (const l of listeners) l();
}

export function toggleSaved(id: string): void {
  const s = new Set(cache);
  if (s.has(id)) s.delete(id);
  else s.add(id);
  cache = [...s];
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    /* localStorage indisponible : on garde au moins l'état en mémoire */
  }
  emit();
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

function getSnapshot(): string[] {
  return cache;
}

/** Hook : liste réactive des IDs d'AAP sauvegardés. */
export function useSavedIds(): string[] {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
