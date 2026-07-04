import type { ReactNode } from "react";

export function KpiCard({
  label,
  value,
  hint,
  accent = false,
  icon,
  delta,
  deltaTone = "neutral",
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  accent?: boolean;
  icon?: ReactNode;
  delta?: string;
  deltaTone?: "up" | "down" | "neutral";
}) {
  const toneClass =
    deltaTone === "up"
      ? "text-sky bg-sky/10"
      : deltaTone === "down"
        ? "text-pink bg-pink/10"
        : "text-muted bg-bg";

  const iconWrap = accent ? "bg-pink/10 text-pink" : "bg-sky/10 text-sky";

  return (
    <div className="card-flat card-hover p-5 group fade-up">
      <div className="flex items-start justify-between">
        <div className={`p-2 rounded-xl ${iconWrap} transition-colors`}>
          {icon ?? <DefaultIcon />}
        </div>
        {delta && (
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${toneClass}`}>
            {delta}
          </span>
        )}
      </div>
      <div className="label-caps mt-5">{label}</div>
      <div
        className={`mt-1 text-[30px] leading-none font-bold transition-colors ${
          accent ? "text-pink" : "text-navy group-hover:text-sky"
        }`}
      >
        {value}
      </div>
      {hint && <div className="mt-2 text-xs text-muted">{hint}</div>}
    </div>
  );
}

function DefaultIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
      />
    </svg>
  );
}
