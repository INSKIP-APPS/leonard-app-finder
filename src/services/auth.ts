// ──────────────────────────────────────────────────────────────────────
// Auth — session Supabase + profil applicatif (nom, entité, rôle)
//
// La table `profils` (créée en sécurité étape 2 phase A) est jointe à
// auth.users via un trigger : chaque signup crée son profil avec role='lecture'.
// Ici on lit cette table pour l'utiliser côté UI (afficher le nom, décider si
// on affiche /admin, etc.).
// ──────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, isSupabaseConfigured } from "./supabase";

export type Role = "admin" | "editeur" | "lecture";

export interface Profil {
  id: string;
  email: string;
  nom: string | null;
  entite: string | null;
  role: Role;
}

/** Hook réactif sur la session Supabase (null = déconnecté). */
export function useSession(): { session: Session | null; loading: boolean } {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    // Session courante au montage
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    // Écoute des changements (login, logout, refresh de token)
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return { session, loading };
}

/** Charge le profil applicatif de l'utilisateur connecté (rôle, nom, entité). */
export function useProfil(): { profil: Profil | null; loading: boolean } {
  const { session, loading: sessionLoading } = useSession();
  const [profil, setProfil] = useState<Profil | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (sessionLoading) return;
    if (!supabase || !session?.user) {
      setProfil(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    supabase
      .from("profils")
      .select("nom, entite, role")
      .eq("id", session.user.id)
      .single()
      .then(({ data }) => {
        if (data) {
          setProfil({
            id: session.user.id,
            email: session.user.email ?? "",
            nom: data.nom,
            entite: data.entite,
            role: data.role as Role,
          });
        }
        setLoading(false);
      });
  }, [session, sessionLoading]);

  return { profil, loading: sessionLoading || loading };
}

export async function signIn(email: string, password: string): Promise<{ error: string | null }> {
  if (!supabase) return { error: "Supabase non configuré" };
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return { error: error?.message ?? null };
}

export async function signOut(): Promise<void> {
  if (!supabase) return;
  await supabase.auth.signOut();
}

/** true si l'auth est activée côté client (Supabase configuré). */
export const isAuthEnabled = isSupabaseConfigured;
