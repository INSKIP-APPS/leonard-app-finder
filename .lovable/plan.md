## Objectif

Aujourd'hui la page Push alloue les AAP au niveau d'une BU (généraliste). On passe à un modèle hiérarchique **BU → Filiale → Projet**, pour que chaque AAP atterrisse là où il a vraiment du sens — soit à toute la BU (cas générique), soit à une filiale précise (Actemium, Axians, GTM, CITINEA…), soit à un projet identifié porté par cette filiale.

## Modèle de données

On enrichit `src/data/entites.json` :

```text
BU (VINCI Construction, VINCI Energies, …)
 └─ filiales[]            ← Actemium, Axians, GTM, CITINEA, "Autre"
     ├─ secteurs / mots-clés propres   ← différencie Actemium ≠ Axians dans la même BU
     └─ projets[] (optionnel)          ← projets internes en cours
```

- Catalyst, SEED, INTRAP restent des entités à part (pas de filiales).
- Une filiale "Générique BU" reçoit les AAP qui s'adressent à la BU dans son ensemble, sans cible filiale précise.
- Le champ `projets[]` est vide au départ ; je laisse 2-3 projets fictifs de démo pour montrer la mécanique. L'ajout de projets côté UI (formulaire) est listé comme évolution suivante, pas dans ce lot.

## Scoring

Dans `src/utils/scoring.ts`, on ajoute :

- `scoreForFiliale(aap, filiale)` — mots-clés + secteurs spécifiques à la filiale.
- `scoreForProjet(aap, projet)` — mots-clés du projet + TRL projet.
- `aapsForFiliale(filiale)` renvoie pour chaque AAP : `{ aap, score, matchedProjets[] }` — un AAP peut matcher la filiale en général ou via un projet précis.

Logique de bonus : si un projet de la filiale matche, on l'affiche en sous-ligne et on booste le score.

## Page Push (`src/routes/push.tsx`)

Nouvelle structure visuelle :

```text
[Onglets BU : VINCI Construction · VINCI Energies · VINCI Autoroutes · …]

  Profil de la BU (carte existante, inchangée)

  ── Filiale : Actemium ──────────────────  12 AAP
    • AAP Hydrogène vert       Score 92   [projet : Microgrid Lyon]
    • AAP Smart Grids EU       Score 87
    • …

  ── Filiale : Axians ────────────────────   8 AAP
    • …

  ── Générique BU ───────────────────────   5 AAP
    (AAP pertinents pour toute la BU, sans filiale cible)
```

- Onglets = BU (comme aujourd'hui).
- Pour les BU qui ont des filiales : on regroupe la liste d'AAP par filiale, dans des sections pliables/scrollables.
- Pour Catalyst/SEED/INTRAP (pas de filiales) : on garde l'affichage actuel à plat.
- Quand un AAP matche un projet précis de la filiale, on affiche le titre du projet en badge sous le titre de l'AAP.

## Fichiers touchés

- `src/data/entites.json` — ajout `filiales[]` et `projets[]` sur les BU VINCI.
- `src/utils/scoring.ts` — types `Filiale`/`Projet`, helpers `scoreForFiliale`, `scoreForProjet`, `aapsForFiliale`.
- `src/routes/push.tsx` — rendu groupé par filiale, badge projet.
- `src/routes/matching.tsx` — inchangé sur cette itération (le champ Entreprise existant correspond déjà à la filiale).

## Hors scope (évolutions suivantes)

- Formulaire d'ajout/édition de projets par filiale dans l'UI.
- Persistance des projets côté Cloud (aujourd'hui : fichier JSON + edits en localStorage comme pour les profils).
- Notifications push réelles par filiale.
