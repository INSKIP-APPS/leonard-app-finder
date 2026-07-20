import { describe, it, expect } from "vitest";
import { trlLabel, escapeHtml, safeHttpUrl, extraireMontant } from "./format";

describe("trlLabel", () => {
  it("renvoie null si min et max absents", () => {
    expect(trlLabel(null, null)).toBeNull();
  });
  it("formate une fourchette", () => {
    expect(trlLabel(3, 8)).toBe("TRL 3–8");
  });
  it("formate une valeur unique (min seul ou max seul)", () => {
    expect(trlLabel(5, null)).toBe("TRL 5");
    expect(trlLabel(null, 7)).toBe("TRL 7");
  });
});

describe("escapeHtml", () => {
  it("échappe les 5 caractères sensibles (dont guillemets — fix XSS)", () => {
    expect(escapeHtml(`<a href="x" onclick='y'>&`)).toBe(
      "&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;",
    );
  });
  it("tolère null/undefined", () => {
    expect(escapeHtml(null as unknown as string)).toBe("");
  });
});

describe("safeHttpUrl", () => {
  it("laisse passer http(s)", () => {
    expect(safeHttpUrl("https://ec.europa.eu")).toBe("https://ec.europa.eu");
    expect(safeHttpUrl("http://x.fr")).toBe("http://x.fr");
  });
  it("bloque javascript: et data:", () => {
    expect(safeHttpUrl("javascript:alert(1)")).toBe("");
    expect(safeHttpUrl("data:text/html,x")).toBe("");
  });
  it("bloque un chemin relatif ou vide", () => {
    expect(safeHttpUrl("/relatif")).toBe("");
    expect(safeHttpUrl("")).toBe("");
    expect(safeHttpUrl(null)).toBe("");
  });
});

describe("extraireMontant", () => {
  it("extrait un montant en M€", () => {
    expect(extraireMontant("Aide de 3 M€ pour le projet")).toContain("3");
  });
  it("renvoie null sans montant", () => {
    expect(extraireMontant("Aucun chiffre ici")).toBeNull();
    expect(extraireMontant(null)).toBeNull();
  });
});
