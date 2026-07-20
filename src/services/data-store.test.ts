import { describe, it, expect } from "vitest";
import { dedupeAaps } from "./data-store";
import type { AAP } from "@/types/aap";

// Fabrique un AAP minimal (dedupeAaps ne lit que id/titre/source/date_cloture).
function aap(p: Partial<AAP>): AAP {
  return { id: "x", titre: "", source: "", date_cloture: null, ...p } as unknown as AAP;
}

describe("dedupeAaps", () => {
  it("ne fusionne pas deux titres différents", () => {
    const out = dedupeAaps([aap({ id: "a", titre: "Projet A" }), aap({ id: "b", titre: "Projet B" })]);
    expect(out).toHaveLength(2);
  });

  it("fusionne deux titres identiques (accents/ponctuation ignorés) et garde la source prioritaire", () => {
    const out = dedupeAaps([
      aap({ id: "at", titre: "Décarbonation !", source: "Aides-territoires" }),
      aap({ id: "ademe", titre: "decarbonation", source: "ADEME (Agir pour la transition)" }),
    ]);
    expect(out).toHaveLength(1);
    // ADEME (rang 1) est prioritaire sur Aides-territoires (rang 6)
    expect(out[0].source).toBe("ADEME (Agir pour la transition)");
    expect(out[0].sources_multiples).toContain("Aides-territoires");
  });

  it("complète une date de clôture manquante depuis une source sœur", () => {
    const out = dedupeAaps([
      aap({ id: "ademe", titre: "Même titre", source: "ADEME (Agir pour la transition)", date_cloture: null }),
      aap({ id: "at", titre: "Même titre", source: "Aides-territoires", date_cloture: "2026-12-31" }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].date_cloture).toBe("2026-12-31");
  });

  it("ne fusionne jamais les titres vides", () => {
    const out = dedupeAaps([aap({ id: "a", titre: "" }), aap({ id: "b", titre: "" })]);
    expect(out).toHaveLength(2);
  });
});
