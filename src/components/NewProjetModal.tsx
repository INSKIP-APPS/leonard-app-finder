import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { X, Loader2, Plus, Check, PowerOff } from "lucide-react";
import { createProjet, updateProjet, desactiverProjet } from "@/services/programmes";
import type { ProgrammeId, ProjetStatut, ProjetV3 } from "@/types/programme";

const SECTEURS = [
  "Énergie",
  "Construction",
  "Mobilité",
  "Numérique-IA",
  "Eau",
  "Environnement",
  "Matériaux",
  "Industrie",
];

const THEMATIQUES_BY_SECTEUR: Record<string, string[]> = {
  Énergie: [
    "Transition énergétique",
    "Énergies renouvelables",
    "Efficacité énergétique",
    "Hydrogène",
    "Stockage d'énergie",
    "Flexibilité réseau",
  ],
  Construction: [
    "Construction & BTP",
    "Rénovation bâtiment",
    "Matériaux & biosourcés",
    "Amenagement & urbanisme",
  ],
  Mobilité: ["Mobilité décarbonée", "Recharge V.E."],
  "Numérique-IA": ["Numérique (IA / IoT / BIM)", "Robotique & automatisation"],
  Eau: ["Gestion de l'eau"],
  Environnement: ["Adaptation climatique", "Économie circulaire"],
  Matériaux: ["Matériaux & biosourcés"],
  Industrie: ["Décarbonation industrie", "Robotique & automatisation"],
};

const BESOINS = ["<100k€", "100k-1M€", "1-5M€", ">5M€"] as const;
type Besoin = (typeof BESOINS)[number];

const CONSORTIUMS = [
  { key: "ouvert" as const, label: "Ouvert" },
  { key: "ferme" as const, label: "Fermé" },
  { key: "non_applicable" as const, label: "Non applicable" },
];

const TYPES_ACTEUR = ["Grand groupe", "Filiale d'un grand groupe", "ETI", "PME", "Startup"];

export function NewProjetModal({
  programmeId,
  programmeNom,
  onClose,
  mode = "create",
  projet,
  cohorte,
}: {
  programmeId: ProgrammeId;
  programmeNom: string;
  onClose: () => void;
  mode?: "create" | "edit";
  projet?: ProjetV3;
  /** Cohorte à assigner au projet (Intrapreneur uniquement). Ignorée si null. */
  cohorte?: number | null;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isEdit = mode === "edit" && !!projet;
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [confirmDesactivation, setConfirmDesactivation] = useState(false);
  const [desactPending, setDesactPending] = useState(false);

  // Identité — pré-remplies si mode edit
  const [nom, setNom] = useState(projet?.nom ?? "");
  const [statut, setStatut] = useState<ProjetStatut>(
    (projet?.statut as ProjetStatut) ?? "prototype",
  );
  const [sponsor, setSponsor] = useState(projet?.sponsor ?? "");

  // Projet
  const [description, setDescription] = useState(projet?.description ?? "");
  const firstPorteur = projet?.porteurs?.[0];
  const [porteurNom, setPorteurNom] = useState(firstPorteur?.nom ?? "");
  const [porteurRole, setPorteurRole] = useState(firstPorteur?.role ?? "");
  const [porteurEntite, setPorteurEntite] = useState(firstPorteur?.entite ?? "");

  // Périmètre veille
  const [secteurs, setSecteurs] = useState<string[]>(projet?.data?.secteurs ?? []);
  const [thematiques, setThematiques] = useState<string[]>(
    projet?.data?.thematiques ?? [],
  );
  const [motsCleInput, setMotsCleInput] = useState("");
  const [motsCles, setMotsCles] = useState<string[]>(projet?.mots_cles ?? []);

  // Maturité & besoins
  const [trl, setTrl] = useState<number | null>(projet?.trl ?? null);
  const [trlVise, setTrlVise] = useState<number | null>(
    projet?.data?.trl_vise ?? null,
  );
  const [typeActeur, setTypeActeur] = useState(projet?.data?.type_acteur ?? "");
  const [localisation, setLocalisation] = useState(
    (projet?.data?.localisation ?? []).join(", "),
  );
  const [besoin, setBesoin] = useState<Besoin | "">(
    (projet?.data?.besoin_financement as Besoin) ?? "",
  );
  const [consortium, setConsortium] = useState<
    "ouvert" | "ferme" | "non_applicable" | ""
  >((projet?.data?.consortium as "ouvert" | "ferme" | "non_applicable") ?? "");
  const [partenaires, setPartenaires] = useState(projet?.data?.partenaires ?? "");

  const suggestedThemes = Array.from(
    new Set(secteurs.flatMap((s) => THEMATIQUES_BY_SECTEUR[s] ?? [])),
  ).filter((t) => !thematiques.includes(t));

  function toggle<T>(arr: T[], v: T, setter: (a: T[]) => void) {
    setter(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  }

  function addMotCle() {
    const v = motsCleInput.trim();
    if (v && !motsCles.includes(v)) setMotsCles([...motsCles, v]);
    setMotsCleInput("");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);

    if (!nom.trim()) return setErr("Le nom du projet est obligatoire.");
    if (!description.trim()) return setErr("La description est obligatoire.");
    if (!porteurNom.trim()) return setErr("Le porteur principal est obligatoire.");
    if (secteurs.length === 0) return setErr("Sélectionnez au moins un secteur.");
    if (trl == null) return setErr("Renseignez le TRL actuel.");

    setPending(true);
    const payload = {
      nom,
      statut,
      sponsor: sponsor.trim() || null,
      description,
      trl,
      mots_cles: motsCles,
      porteurs: [
        {
          nom: porteurNom.trim(),
          role: porteurRole.trim(),
          entite: porteurEntite.trim(),
        },
      ],
      data: {
        secteurs,
        thematiques,
        localisation: localisation
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        consortium: consortium || undefined,
        partenaires: partenaires.trim() || undefined,
        besoin_financement: besoin || undefined,
        trl_vise: trlVise ?? undefined,
        type_acteur: typeActeur || undefined,
      },
    };
    try {
      if (isEdit && projet) {
        await updateProjet(projet.id, payload);
        qc.invalidateQueries({ queryKey: ["projet-v3", projet.id] });
        qc.invalidateQueries({ queryKey: ["projets-by-programme", programmeId] });
        qc.invalidateQueries({ queryKey: ["projets-count-by-programme"] });
        onClose();
      } else {
        const created = await createProjet({
          programme_id: programmeId,
          ...payload,
          cohorte: cohorte ?? null,
        });
        if (!created) throw new Error("Création échouée.");
        onClose();
        navigate({ to: "/projets/$id", params: { id: created.id } });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(false);
    }
  }

  async function handleDesactiver() {
    if (!projet) return;
    setDesactPending(true);
    setErr(null);
    try {
      await desactiverProjet(projet.id);
      qc.invalidateQueries({ queryKey: ["projet-v3", projet.id] });
      qc.invalidateQueries({ queryKey: ["projets-by-programme", programmeId] });
      qc.invalidateQueries({ queryKey: ["projets-count-by-programme"] });
      onClose();
      // Retour à la page programme
      navigate({ to: "/programmes/$id", params: { id: programmeId } });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setDesactPending(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl w-full max-w-2xl my-8 shadow-2xl overflow-hidden"
      >
        {/* En-tête */}
        <div className="px-6 py-5 border-b border-border bg-gradient-to-br from-[#ECE8FB] to-[#E2F7FC] flex items-start justify-between gap-4">
          <div>
            <div className="text-[10px] uppercase tracking-widest font-bold text-cyan-ink mb-1">
              Programme {programmeNom}
            </div>
            <h2 className="text-lg font-bold text-navy tracking-tight">
              {isEdit ? "Modifier le projet" : "Ajouter un projet"}
            </h2>
            <p className="text-xs text-muted mt-1">
              {isEdit
                ? "Le programme de rattachement n'est pas modifiable ici."
                : (<>
                    Les champs marqués <span className="text-pink font-bold">*</span> sont
                    nécessaires pour lancer la veille. Le reste peut être complété plus tard.
                  </>)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-md border border-border bg-white/60 flex items-center justify-center text-muted hover:text-navy shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="max-h-[calc(100vh-260px)] overflow-y-auto px-6 py-5 space-y-5">
          {/* 1. Identité */}
          <Section num={1} title="Identité" sub="Nom, statut et rattachement">
            <Field label="Nom du projet" required>
              <input
                value={nom}
                onChange={(e) => setNom(e.target.value)}
                placeholder="Ex : eBOOST, ElecVision, Novelair…"
                className="input"
              />
            </Field>
            <Field label="Statut" required>
              <div className="flex flex-wrap gap-1.5">
                {(["idee", "prototype", "industrialise"] as ProjetStatut[]).map((s) => (
                  <Chip
                    key={s}
                    on={statut === s}
                    onClick={() => setStatut(s)}
                    dot={
                      s === "idee" ? "#c77700" : s === "prototype" ? "#E6175C" : "#2A1A6E"
                    }
                  >
                    {s === "idee"
                      ? "Idée"
                      : s === "prototype"
                        ? "Prototype"
                        : "Industrialisé"}
                  </Chip>
                ))}
              </div>
            </Field>
            <Field label="Sponsor / entité VINCI" hint="Business Unit ou filiale porteuse">
              <input
                value={sponsor}
                onChange={(e) => setSponsor(e.target.value)}
                placeholder="Ex : VINCI Energies · Actemium"
                className="input"
              />
            </Field>
          </Section>

          {/* 2. Le projet */}
          <Section num={2} title="Le projet" sub="Description courte + porteur principal">
            <Field
              label="Description"
              required
              hint="3 à 4 lignes — ce qui apparaît en haut de la fiche"
            >
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="Ex : Stations de recharge V.E. avec stockage batterie et arbitrage énergétique…"
                className="input resize-y min-h-[80px]"
              />
            </Field>
            <Field label="Porteur principal" required>
              <div className="grid grid-cols-3 gap-2">
                <input
                  value={porteurNom}
                  onChange={(e) => setPorteurNom(e.target.value)}
                  placeholder="Nom"
                  className="input"
                />
                <input
                  value={porteurRole}
                  onChange={(e) => setPorteurRole(e.target.value)}
                  placeholder="Rôle (ex : Chef d'affaires)"
                  className="input"
                />
                <input
                  value={porteurEntite}
                  onChange={(e) => setPorteurEntite(e.target.value)}
                  placeholder="Entité (ex : Easycharge)"
                  className="input"
                />
              </div>
            </Field>
          </Section>

          {/* 3. Périmètre de la veille */}
          <Section
            num={3}
            title="Périmètre de la veille"
            sub="Le socle du matching AAP — plus c'est précis, plus les propositions sont pertinentes"
          >
            <Field label="Secteurs" required hint="un ou plusieurs">
              <div className="flex flex-wrap gap-1.5">
                {SECTEURS.map((s) => (
                  <Chip
                    key={s}
                    on={secteurs.includes(s)}
                    onClick={() => toggle(secteurs, s, setSecteurs)}
                  >
                    {s}
                  </Chip>
                ))}
              </div>
            </Field>
            {(thematiques.length > 0 || suggestedThemes.length > 0) && (
              <Field
                label="Thématiques"
                hint={suggestedThemes.length > 0 ? "suggérées d'après vos secteurs" : ""}
              >
                {thematiques.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {thematiques.map((t) => (
                      <span
                        key={t}
                        className="inline-flex items-center gap-1 bg-sky text-white text-[11.5px] font-semibold pl-2.5 pr-1.5 py-0.5 rounded"
                      >
                        {t}
                        <button
                          type="button"
                          onClick={() =>
                            setThematiques(thematiques.filter((x) => x !== t))
                          }
                          className="w-4 h-4 rounded bg-white/20 hover:bg-white/40 flex items-center justify-center"
                        >
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                {suggestedThemes.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {suggestedThemes.map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setThematiques([...thematiques, t])}
                        className="text-[11.5px] font-medium border border-dashed border-purple text-purple bg-[#ECE8FB] hover:bg-purple hover:text-white px-2 py-0.5 rounded"
                      >
                        + {t}
                      </button>
                    ))}
                  </div>
                )}
              </Field>
            )}
            <Field
              label="Mots-clés matching"
              hint="termes précis et techniques propres à votre projet"
            >
              {motsCles.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {motsCles.map((m) => (
                    <span
                      key={m}
                      className="inline-flex items-center gap-1 bg-sky text-white text-[11.5px] font-semibold pl-2.5 pr-1.5 py-0.5 rounded"
                    >
                      {m}
                      <button
                        type="button"
                        onClick={() => setMotsCles(motsCles.filter((x) => x !== m))}
                        className="w-4 h-4 rounded bg-white/20 hover:bg-white/40 flex items-center justify-center"
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <input
                  value={motsCleInput}
                  onChange={(e) => setMotsCleInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addMotCle();
                    }
                  }}
                  placeholder="Ajouter un mot-clé et Entrée"
                  className="input flex-1"
                />
                <button
                  type="button"
                  onClick={addMotCle}
                  className="px-3 py-2 border border-border-strong rounded-md text-xs font-semibold text-muted hover:border-sky hover:text-sky-ink"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </Field>
          </Section>

          {/* 4. Maturité & besoins */}
          <Section num={4} title="Maturité & besoins" sub="Pour affiner l'éligibilité et cibler les bons AAP">
            <Field label="TRL actuel" required hint={trl ? `TRL ${trl}` : ""}>
              <TrlTrack value={trl} onChange={setTrl} tone="cyan" />
            </Field>
            <Field label="TRL visé" hint={trlVise ? `TRL ${trlVise}` : ""}>
              <TrlTrack value={trlVise} onChange={setTrlVise} tone="purple" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Type d'acteur">
                <select
                  value={typeActeur}
                  onChange={(e) => setTypeActeur(e.target.value)}
                  className="input"
                >
                  <option value="">—</option>
                  {TYPES_ACTEUR.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Besoin de financement">
                <div className="flex flex-wrap gap-1">
                  {BESOINS.map((b) => (
                    <Chip
                      key={b}
                      on={besoin === b}
                      onClick={() => setBesoin(besoin === b ? "" : b)}
                    >
                      {b}
                    </Chip>
                  ))}
                </div>
              </Field>
            </div>
            <Field label="Localisation" hint="France, Europe, ou régions séparées par virgules">
              <input
                value={localisation}
                onChange={(e) => setLocalisation(e.target.value)}
                placeholder="Ex : France, Europe, Île-de-France"
                className="input"
              />
            </Field>
            <Field label="Consortium">
              <div className="flex flex-wrap gap-1.5">
                {CONSORTIUMS.map((c) => (
                  <Chip
                    key={c.key}
                    on={consortium === c.key}
                    onClick={() => setConsortium(consortium === c.key ? "" : c.key)}
                  >
                    {c.label}
                  </Chip>
                ))}
              </div>
              {consortium === "ouvert" && (
                <input
                  value={partenaires}
                  onChange={(e) => setPartenaires(e.target.value)}
                  placeholder="Partenaires identifiés (optionnel)"
                  className="input mt-2"
                />
              )}
            </Field>
          </Section>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border bg-[#FBFBFD] flex items-center justify-between gap-3">
          {err ? (
            <div className="text-xs text-orange-700 bg-[#FFF4E6] px-3 py-1.5 rounded">
              {err}
            </div>
          ) : (
            <div className="text-[11px] text-muted">
              {isEdit
                ? "Les modifications seront prises en compte à la prochaine veille."
                : "La veille analysera ce projet au prochain passage, ou immédiatement via « Lancer la veille » sur sa fiche."}
            </div>
          )}
          <div className="flex gap-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-md text-sm font-medium text-muted hover:text-text"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={pending}
              className="inline-flex items-center gap-2 bg-navy text-white px-4 py-2 rounded-md text-sm font-semibold hover:opacity-90 disabled:opacity-60"
            >
              {pending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Check className="w-4 h-4" />
              )}
              {isEdit ? "Enregistrer" : "Créer le projet"}
            </button>
          </div>
        </div>

        {/* Zone désactivation (edit seulement) */}
        {isEdit && (
          <div className="px-6 py-4 border-t border-border bg-white">
            {!confirmDesactivation ? (
              <div className="flex items-center justify-between gap-3">
                <div className="text-[11px] text-muted leading-relaxed">
                  <span className="font-semibold text-text">Désactiver ce projet.</span>{" "}
                  Il disparaît du cockpit, du programme et de la boucle de veille auto.
                  L'historique reste conservé.
                </div>
                <button
                  type="button"
                  onClick={() => setConfirmDesactivation(true)}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-orange-700 border border-orange-300 bg-orange-50 hover:bg-orange-100 px-3 py-1.5 rounded-md shrink-0"
                >
                  <PowerOff className="w-3.5 h-3.5" />
                  Désactiver
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs text-orange-800 leading-relaxed">
                  <span className="font-bold">Confirmer la désactivation ?</span>{" "}
                  Le projet sortira de toutes les vues actives.
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setConfirmDesactivation(false)}
                    className="px-3 py-1.5 rounded-md text-xs font-medium text-muted hover:text-text"
                  >
                    Annuler
                  </button>
                  <button
                    type="button"
                    onClick={handleDesactiver}
                    disabled={desactPending}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-orange-600 hover:bg-orange-700 px-3 py-1.5 rounded-md disabled:opacity-60"
                  >
                    {desactPending ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <PowerOff className="w-3.5 h-3.5" />
                    )}
                    Confirmer
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </form>
    </div>
  );
}

// ── Sous-composants ────────────────────────────────────────────────────
function Section({
  num,
  title,
  sub,
  children,
}: {
  num: number;
  title: string;
  sub: string;
  children: React.ReactNode;
}) {
  return (
    <div className="pt-1 pb-1 border-b border-border last:border-0 last:pb-0">
      <div className="flex items-center gap-2.5 mb-3">
        <div className="w-6 h-6 rounded-full bg-navy text-white text-xs font-bold flex items-center justify-center shrink-0">
          {num}
        </div>
        <div>
          <div className="text-sm font-bold text-text -mb-px">{title}</div>
          <div className="text-[11px] text-muted">{sub}</div>
        </div>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs font-semibold text-text mb-1.5">
        <span>
          {label} {required && <span className="text-pink">*</span>}
        </span>
        {hint && <span className="text-[10.5px] text-faint font-normal">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function Chip({
  on,
  onClick,
  dot,
  children,
}: {
  on: boolean;
  onClick: () => void;
  dot?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 text-[12px] font-medium px-3 py-1 rounded-full border transition ${
        on
          ? "bg-navy text-white border-navy"
          : "bg-white border-border-strong text-muted hover:border-sky hover:text-sky-ink"
      }`}
    >
      {dot && (
        <span
          className="w-1.5 h-1.5 rounded-full"
          style={{ background: on ? "rgba(255,255,255,.9)" : dot }}
        />
      )}
      {children}
    </button>
  );
}

function TrlTrack({
  value,
  onChange,
  tone,
}: {
  value: number | null;
  onChange: (v: number) => void;
  tone: "cyan" | "purple";
}) {
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: 9 }, (_, i) => i + 1).map((n) => {
        const selected = n === value;
        const filled = value != null && n < value;
        const cls = selected
          ? tone === "cyan"
            ? "bg-sky border-sky text-white"
            : "bg-purple border-purple text-white"
          : filled
            ? tone === "cyan"
              ? "bg-[#E2F7FC] border-[#E2F7FC] text-sky-ink"
              : "bg-[#ECE8FB] border-[#ECE8FB] text-purple"
            : "bg-bg border-border text-muted";
        return (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className={`w-6 h-6 rounded-md border text-[10.5px] font-bold flex items-center justify-center tabular-nums ${cls}`}
          >
            {n}
          </button>
        );
      })}
    </div>
  );
}
