// Badge « pilule » partagé (fiches AAP / dispositif). Tons alignés sur la
// palette des écrans existants.

export type BadgeTone = "muted" | "sky" | "purple" | "emerald" | "pink";

const TONES: Record<BadgeTone, string> = {
  muted: "bg-muted text-text",
  sky: "bg-white text-navy border border-navy/20",
  purple: "bg-[#F3E8FF] text-purple",
  emerald: "bg-[#ECFDF5] text-emerald-700 border border-emerald-200",
  pink: "bg-pink/10 text-pink",
};

export function Badge({
  children,
  tone = "muted",
}: {
  children: React.ReactNode;
  tone?: BadgeTone;
}) {
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${TONES[tone]}`}>{children}</span>
  );
}
