export function ScoreBadge({ score, size = "md" }: { score: number; size?: "sm" | "md" | "lg" }) {
  let bg = "bg-[#FFEBEE]";
  let fg = "text-[#C62828]";
  if (score >= 85) {
    bg = "bg-[#E8F5E9]";
    fg = "text-[#2E7D32]";
  } else if (score >= 65) {
    bg = "bg-[#FFF3E0]";
    fg = "text-[#E65100]";
  }
  const sz = size === "lg" ? "w-14 h-14 text-lg" : size === "sm" ? "w-9 h-9 text-xs" : "w-12 h-12 text-base";
  return (
    <div className={`${sz} rounded-full ${bg} ${fg} font-bold flex items-center justify-center shrink-0`}>
      {score}
    </div>
  );
}
