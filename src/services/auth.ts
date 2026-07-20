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

/**
 * Traduit les messages d'erreur Supabase Auth (anglais) en français.
 * Fallback : message générique FR plutôt que l'anglais brut.
 */
export function authErrorFr(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const m = raw.toLowerCase();
  if (m.includes("invalid login credentials")) return "Email ou mot de passe incorrect.";
  if (m.includes("email not confirmed")) return "Email non confirmé — vérifiez votre boîte de réception.";
  if (m.includes("rate limit") || m.includes("too many requests"))
    return "Trop de tentatives — patientez quelques minutes avant de réessayer.";
  if (m.includes("failed to fetch") || m.includes("networkerror") || m.includes("load failed"))
    return "Connexion au serveur impossible — vérifiez votre réseau.";
  if (m.includes("invalid") && m.includes("expired")) return "Lien invalide ou expiré.";
  if (m.includes("session missing") || m.includes("session expired"))
    return "Session expirée — reconnectez-vous.";
  if (m.includes("user already registered")) return "Un compte existe déjà pour cet email.";
  if (m.includes("password should be")) return "Le mot de passe est trop court (minimum 6 caractères).";
  return "Une erreur est survenue. Réessayez ou contactez un administrateur.";
}

export async function signIn(email: string, password: string): Promise<{ error: string | null }> {
  if (!supabase) return { error: "Supabase non configuré" };
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return { error: authErrorFr(error?.message) };
}

/** Envoie un email de réinitialisation de mot de passe (flux recovery). */
export async function resetPassword(email: string): Promise<{ error: string | null }> {
  if (!supabase) return { error: "Supabase non configuré" };
  const redirectTo = `${window.location.origin}/auth/callback`;
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  return { error: authErrorFr(error?.message) };
}

export async function signOut(): Promise<void> {
  if (!supabase) return;
  await supabase.auth.signOut();
}

/** true si l'auth est activée côté client (Supabase configuré). */
export const isAuthEnabled = isSupabaseConfigured;
