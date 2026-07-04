import type { Dispositif, ActeursCibles } from "@/types/dispositif";
import { ACTEUR_LABELS } from "@/types/dispositif";

// ──────────────────────────────────────────────────────────────────────
// Filtres avancés de l'Explorer (Phase 5.3) — s'appliquent aux dispositifs.
// Regroupe le modèle (AdvFilters), le prédicat (matchesAdvanced) et le
// panneau UI (AdvancedFiltersPanel). Extrait de routes/explorer.tsx.
// ──────────────────────────────────────────────────────────────────────

const FINANCEURS = [
  "Commission européenne",
  "ADEME",
  "Bpifrance",
  "Région",
  "ANR",
  "Banque des Territoires",
];

function financeurOf(org: string): string {
  const o = (org || "").toLowerCase();
  if (/(commission|europ|hadea|cinea|eismea|\berc\b|\brea\b)/.test(o))
    return "Commission européenne";
  if (o.includes("ademe")) return "ADEME";
  if (o.includes("bpi")) return "Bpifrance";
  if (o.includes("anr")) return "ANR";
  if (o.includes("banque des territoires") || o.includes("cdc")) return "Banque des Territoires";
  if (/(région|region)/.test(o)) return "Région";
  return "Autre";
}

// libellé de filtre → mot-clé recherché dans type_financement
const TYPES_FIN: Record<string, string> = {
  Subvention: "subvention",
  Prêt: "prêt",
  "Avance récupérable": "avance",
  Equity: "equity",
  Garantie: "garantie",
  Accompagnement: "accompagnement",
  "Crédit d'impôt": "crédit",
};
const MONTANTS = ["<100k€", "100k€–1M€", "1M€–5M€", ">5M€", "Variable"];
const STATUTS = ["Ouvert", "À surveiller", "Fermé"];
const PERTINENCES = ["Forte", "Moyenne", "Faible"];
const ACTEUR_KEYS: (keyof ActeursCibles)[] = [
  "pme",
  "eti",
  "grand_groupe",
  "startup",
  "collectivite",
  "laboratoire_universite",
  "consortium",
  "bailleur_social",
  "agriculteur",
];

export interface AdvFilters {
  financeurs: string[];
  typesFin: string[];
  montants: string[];
  statuts: string[];
  pertinences: string[];
  acteurs: (keyof ActeursCibles)[];
  trlMin: number | null;
  trlMax: number | null;
}

export const EMPTY_ADV: AdvFilters = {
  financeurs: [],
  typesFin: [],
  montants: [],
  statuts: [],
  pertinences: [],
  acteurs: [],
  trlMin: null,
  trlMax: null,
};

export function advCount(f: AdvFilters): number {
  return (
    f.financeurs.length +
    f.typesFin.length +
    f.montants.length +
    f.statuts.length +
    f.pertinences.length +
    f.acteurs.length +
    (f.trlMin != null || f.trlMax != null ? 1 : 0)
  );
}

export function matchesAdvanced(d: Dispositif, f: AdvFilters): boolean {
  if (f.financeurs.length && !f.financeurs.includes(financeurOf(d.organisme))) return false;
  if (f.typesFin.length) {
    const tf = (d.type_financement ?? "").toLowerCase();
    if (!f.typesFin.some((label) => tf.includes(TYPES_FIN[label]))) return false;
  }
  if (f.montants.length) {
    const m = d.montant ?? "";
    if (!f.montants.some((b) => m.includes(b))) return false;
  }
  if (f.statuts.length && !(d.statut_ouverture && f.statuts.includes(d.statut_ouverture)))
    return false;
  if (f.pertinences.length && !(d.pertinence_vinci && f.pertinences.includes(d.pertinence_vinci)))
    return false;
  if (f.acteurs.length && !f.acteurs.some((k) => d.acteurs_cibles?.[k])) return false;
  if (f.trlMin != null || f.trlMax != null) {
    if (d.trl_min != null || d.trl_max != null) {
      const lo = d.trl_min ?? d.trl_max ?? 0;
      const hi = d.trl_max ?? d.trl_min ?? 9;
      const selLo = f.trlMin ?? 0;
      const selHi = f.trlMax ?? 9;
      if (hi < selLo || lo > selHi) return false;
    }
  }
  return true;
}

// Groupe de chips multi-sélection réutilisable pour le panneau avancé.
function ChipGroup<T extends string>({
  label,
  options,
  values,
  onToggle,
  render,
}: {
  label: string;
  options: T[];
  values: T[];
  onToggle: (v: T) => void;
  render?: (v: T) => string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="label-caps shrink-0 mr-1 w-28">{label}</span>
      {options.map((o) => {
        const active = values.includes(o);
        return (
          <button
            key={o}
            onClick={() => onToggle(o)}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition ${
              active
                ? "bg-navy text-white border-navy"
                : "bg-white text-text border-border hover:border-navy"
            }`}
          >
            {render ? render(o) : o}
          </button>
        );
      })}
    </div>
  );
}

/** Panneau des filtres avancés (le bouton d'ouverture reste dans la route). */
export function AdvancedFiltersPanel({
  adv,
  setAdv,
}: {
  adv: AdvFilters;
  setAdv: React.Dispatch<React.SetStateAction<AdvFilters>>;
}) {
  const nbAdv = advCount(adv);

  const toggleAdv = <K extends "financeurs" | "typesFin" | "montants" | "statuts" | "pertinences">(
    field: K,
    value: string,
  ) =>
    setAdv((prev) => {
      const arr = prev[field] as string[];
      return {
        ...prev,
        [field]: arr.includes(value) ? arr.filter((x) => x !== value) : [...arr, value],
      };
    });

  const toggleActeur = (k: keyof ActeursCibles) =>
    setAdv((prev) => ({
      ...prev,
      acteurs: prev.acteurs.includes(k)
        ? prev.acteurs.filter((x) => x !== k)
        : [...prev.acteurs, k],
    }));

  return (
    <div className="border-t border-border pt-3 mt-1 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted">
          Ces filtres s'appliquent aux <span className="font-medium text-text">dispositifs</span>.
        </span>
        {nbAdv > 0 && (
          <button
            onClick={() => setAdv(EMPTY_ADV)}
            className="text-xs text-pink hover:underline font-medium"
          >
            Tout réinitialiser
          </button>
        )}
      </div>
      <ChipGroup
        label="Financeur"
        options={FINANCEURS}
        values={adv.financeurs}
        onToggle={(v) => toggleAdv("financeurs", v)}
      />
      <ChipGroup
        label="Type de financement"
        options={Object.keys(TYPES_FIN)}
        values={adv.typesFin}
        onToggle={(v) => toggleAdv("typesFin", v)}
      />
      <ChipGroup
        label="Montant"
        options={MONTANTS}
        values={adv.montants}
        onToggle={(v) => toggleAdv("montants", v)}
      />
      <ChipGroup
        label="Acteur éligible"
        options={ACTEUR_KEYS}
        values={adv.acteurs}
        onToggle={(k) => toggleActeur(k)}
        render={(k) => ACTEUR_LABELS[k]}
      />
      <ChipGroup
        label="Statut"
        options={STATUTS}
        values={adv.statuts}
        onToggle={(v) => toggleAdv("statuts", v)}
      />
      <ChipGroup
        label="Pertinence VINCI"
        options={PERTINENCES}
        values={adv.pertinences}
        onToggle={(v) => toggleAdv("pertinences", v)}
      />
      <div className="flex flex-wrap items-center gap-2">
        <span className="label-caps shrink-0 mr-1 w-28">TRL</span>
        <select
          value={adv.trlMin ?? ""}
          onChange={(e) =>
            setAdv((p) => ({ ...p, trlMin: e.target.value ? Number(e.target.value) : null }))
          }
          className="px-2 py-1 rounded-md border border-border bg-white text-xs focus:outline-none focus:border-navy"
        >
          <option value="">min</option>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
            <option key={n} value={n}>
              TRL {n}
            </option>
          ))}
        </select>
        <span className="text-xs text-muted">→</span>
        <select
          value={adv.trlMax ?? ""}
          onChange={(e) =>
            setAdv((p) => ({ ...p, trlMax: e.target.value ? Number(e.target.value) : null }))
          }
          className="px-2 py-1 rounded-md border border-border bg-white text-xs focus:outline-none focus:border-navy"
        >
          <option value="">max</option>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
            <option key={n} value={n}>
              TRL {n}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
