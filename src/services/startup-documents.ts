// ──────────────────────────────────────────────────────────────────────
// Alimentation de la BASE COMMUNE depuis Leonard (app Financement).
//
// Quand un document concernant une startup est uploadé, il « nourrit » la
// colonne vertébrale :
//   1. le fichier est déposé dans le bucket Storage `startup-documents`
//      sous le chemin  {startup_id}/{uuid}-{nom}  (règle RLS = 1er dossier) ;
//   2. une ligne est insérée dans core.startup_documents (métadonnées +
//      déposant + phase) ;
//   3. un évènement `doc_added` est poussé dans core.startup_events (timeline).
//
// Dans Leonard, la phase par défaut est « financement » et le déposant est
// le coach (cf. matrice d'architecture). On peut surcharger si besoin.
// ──────────────────────────────────────────────────────────────────────

import { coreDb, CORE_DOCUMENTS_BUCKET } from "./core";

export type DocumentType =
  | "business_plan"
  | "pitch_deck"
  | "comptes"
  | "produit"
  | "cap_table"
  | "contrat"
  | "kpi"
  | "autre";

export type Phase = "sourcing" | "suivi" | "financement";
export type UploaderRole = "fondateur" | "coach" | "analyste_financement" | "admin";

export interface UploadStartupDocumentInput {
  /** id de la startup dans core.startups */
  startupId: string;
  /** fichier à déposer */
  file: File;
  /** nature du document */
  type: DocumentType;
  /** contexte métier du dépôt (défaut : financement pour Leonard) */
  phase?: Phase;
  /** rôle du déposant (défaut : coach) */
  uploadedByRole?: UploaderRole;
  /** libellé lisible (défaut : nom du fichier) */
  libelle?: string;
  /** millésime comptable éventuel */
  exercice?: number;
}

export interface StartupDocument {
  id: string;
  startup_id: string;
  type: DocumentType;
  libelle: string | null;
  phase: Phase;
  storage_path: string;
  mime: string | null;
  taille_octets: number | null;
  created_at: string;
}

/** App émettrice — sert à tracer l'origine dans core.startup_documents / events. */
const SOURCE_APP = "financement" as const;

function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

/**
 * Dépose un document et alimente la base commune. Lève si la base commune
 * n'est pas configurée (VITE_CORE_SUPABASE_*).
 */
export async function uploadStartupDocument(
  input: UploadStartupDocumentInput,
): Promise<StartupDocument> {
  if (!coreDb) {
    throw new Error(
      "Base commune non configurée : renseigner VITE_CORE_SUPABASE_URL et VITE_CORE_SUPABASE_ANON_KEY.",
    );
  }

  const {
    startupId,
    file,
    type,
    phase = "financement",
    uploadedByRole = "coach",
    libelle,
    exercice,
  } = input;

  const storagePath = `${startupId}/${crypto.randomUUID()}-${sanitizeName(file.name)}`;

  // 1. dépôt du fichier dans le bucket privé
  const upload = await coreDb.storage
    .from(CORE_DOCUMENTS_BUCKET)
    .upload(storagePath, file, { upsert: false, contentType: file.type || undefined });
  if (upload.error) throw upload.error;

  const { data: userData } = await coreDb.auth.getUser();
  const uploadedBy = userData?.user?.id ?? null;

  // 2. métadonnées dans core.startup_documents
  const insert = await coreDb
    .from("startup_documents")
    .insert({
      startup_id: startupId,
      type,
      libelle: libelle ?? file.name,
      exercice: exercice ?? null,
      phase,
      source_app: SOURCE_APP,
      storage_bucket: CORE_DOCUMENTS_BUCKET,
      storage_path: storagePath,
      mime: file.type || null,
      taille_octets: file.size,
      uploaded_by: uploadedBy,
      uploaded_by_role: uploadedByRole,
    })
    .select("id, startup_id, type, libelle, phase, storage_path, mime, taille_octets, created_at")
    .single();
  if (insert.error) {
    // rollback best-effort du fichier orphelin
    await coreDb.storage.from(CORE_DOCUMENTS_BUCKET).remove([storagePath]);
    throw insert.error;
  }

  // 3. évènement de timeline (best-effort, non bloquant)
  await coreDb.from("startup_events").insert({
    startup_id: startupId,
    type: "doc_added",
    source_app: SOURCE_APP,
    actor_id: uploadedBy,
    payload: { document_id: insert.data.id, doc_type: type, phase },
  });

  return insert.data as StartupDocument;
}

/** Liste les documents d'une startup (via la base commune). */
export async function listStartupDocuments(startupId: string): Promise<StartupDocument[]> {
  if (!coreDb) return [];
  const { data, error } = await coreDb
    .from("startup_documents")
    .select("id, startup_id, type, libelle, phase, storage_path, mime, taille_octets, created_at")
    .eq("startup_id", startupId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as StartupDocument[];
}
