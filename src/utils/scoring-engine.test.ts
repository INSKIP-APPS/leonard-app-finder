import { describe, it, expect } from "vitest";
import { parseMontantEuros, joursRestants, statutEffectif } from "./scoring-engine";

describe("parseMontantEuros", () => {
  it("interprète les suffixes M / k", () => {
    expect(parseMontantEuros("3 M€")).toBe(3_000_000);
    expect(parseMontantEuros("500 k€")).toBe(500_000);
  });
  it("interprète les mots million/keur", () => {
    expect(parseMontantEuros("2 millions d'euros")).toBe(2_000_000);
  });
  it("renvoie null sur entrée vide/non numérique", () => {
    expect(parseMontantEuros("")).toBeNull();
    expect(parseMontantEuros(undefined)).toBeNull();
  });
});

describe("joursRestants", () => {
  it("renvoie null si pas de date", () => {
    expect(joursRestants(null)).toBeNull();
  });
  it("renvoie un nombre négatif pour une date passée", () => {
    expect(joursRestants("2000-01-01")).toBeLessThan(0);
  });
  it("renvoie un nombre positif pour une date lointaine", () => {
    expect(joursRestants("2999-01-01")).toBeGreaterThan(0);
  });
});

describe("statutEffectif", () => {
  it("reclasse un 'open' à échéance passée en 'closed'", () => {
    expect(statutEffectif({ statut: "open", date_cloture: "2000-01-01" })).toBe("closed");
  });
  it("laisse un 'open' à échéance future en 'open'", () => {
    expect(statutEffectif({ statut: "open", date_cloture: "2999-01-01" })).toBe("open");
  });
  it("laisse un 'open' sans date en 'open'", () => {
    expect(statutEffectif({ statut: "open", date_cloture: null })).toBe("open");
  });
  it("ne touche pas les autres statuts", () => {
    expect(statutEffectif({ statut: "closed", date_cloture: "2999-01-01" })).toBe("closed");
  });
});
