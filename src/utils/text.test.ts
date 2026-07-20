import { describe, it, expect } from "vitest";
import { stripAccents, empreinteTitre } from "./text";

describe("stripAccents", () => {
  it("minuscule + retire les diacritiques", () => {
    expect(stripAccents("Énergie")).toBe("energie");
    expect(stripAccents("Réhabilitation à FÔret")).toBe("rehabilitation a foret");
  });
  it("tolère null/undefined", () => {
    expect(stripAccents(null as unknown as string)).toBe("");
  });
});

describe("empreinteTitre", () => {
  it("retire aussi ponctuation et espaces", () => {
    expect(empreinteTitre("Décarbonation !")).toBe("decarbonation");
    expect(empreinteTitre("Aide 2026 — R&D")).toBe("aide2026rd");
  });
  it("deux titres équivalents produisent la même empreinte", () => {
    expect(empreinteTitre("Fonds Réindustrialisation")).toBe(
      empreinteTitre("fonds reindustrialisation"),
    );
  });
});
