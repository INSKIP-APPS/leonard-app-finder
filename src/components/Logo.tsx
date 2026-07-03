import logoAsset from "@/assets/leonard-logo.png.asset.json";

export function Logo({ size = "md" }: { size?: "sm" | "md" }) {
  const w = size === "sm" ? "w-[140px]" : "w-[170px]";
  return (
    <img
      src={logoAsset.url}
      alt="Leonard — powered by VINCI"
      className={`${w} h-auto object-contain select-none`}
    />
  );
}

