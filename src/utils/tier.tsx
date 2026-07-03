import { Flame, Eye, Search } from "lucide-react";

export type TierKey = "prioritaire" | "interessant" | "investiguer";

export interface TierInfo {
  key: TierKey;
  label: string;
  range: string;
  icon: typeof Flame;
  className: string;
}

export const TIERS: Record<TierKey, TierInfo> = {
  prioritaire: {
    key: "prioritaire",
    label: "Prioritaire",
    range: "≥ 75",
    icon: Flame,
    className: "bg-emerald-100 text-emerald-800",
  },
  interessant: {
    key: "interessant",
    label: "Intéressant",
    range: "55–74",
    icon: Eye,
    className: "bg-sky-100 text-sky-800",
  },
  investiguer: {
    key: "investiguer",
    label: "À investiguer",
    range: "< 55",
    icon: Search,
    className: "bg-gray-100 text-gray-600",
  },
};

export const TIER_ORDER: TierKey[] = ["prioritaire", "interessant", "investiguer"];

export function tierFor(score: number): TierInfo {
  if (score >= 75) return TIERS.prioritaire;
  if (score >= 55) return TIERS.interessant;
  return TIERS.investiguer;
}

export function TierBadge({ score }: { score: number }) {
  const t = tierFor(score);
  const Icon = t.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${t.className}`}>
      <Icon className="w-3 h-3" />
      {t.label}
    </span>
  );
}
