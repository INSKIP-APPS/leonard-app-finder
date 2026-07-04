import type { Dispositif } from "@/types/dispositif";

// Petits badges partagés par les cartes de l'Explorer.

export function geoBadge(g: string) {
  const map: Record<string, string> = {
    EU: "bg-[#E6F1FB] text-navy",
    National: "bg-[#E8F5F0] text-emerald-800",
    Régional: "bg-[#FFF4E6] text-orange-700",
    Local: "bg-[#F3E8FF] text-purple",
  };
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${map[g] ?? "bg-muted text-text"}`}>
      {g}
    </span>
  );
}

export function statutDispositifBadge(d: Dispositif) {
  const s = d.statut_ouverture;
  if (!s) return null;
  const map: Record<string, string> = {
    Ouvert: "text-emerald-700 font-medium",
    "À surveiller": "text-orange-600 font-medium",
    Fermé: "text-muted",
  };
  return <span className={`text-xs mt-1 ${map[s] ?? "text-muted"}`}>{s}</span>;
}
