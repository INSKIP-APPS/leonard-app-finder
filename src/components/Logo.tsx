export function Logo({ size = "md" }: { size?: "sm" | "md" }) {
  const w = size === "sm" ? "w-[140px]" : "w-[170px]";
  return (
    <img
      src="/logos/leonard-brand.png"
      alt="Leonard — together @ VINCI"
      className={`${w} h-auto object-contain select-none`}
    />
  );
}
