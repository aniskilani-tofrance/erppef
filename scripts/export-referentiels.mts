// Exporte le référentiel unique en JSON pour le générateur du modèle Excel.
// Fait partie de `npm run modele` — ne pas lancer seul.
import { writeFileSync } from "node:fs";
import { LEVELS, GENDERS, ACTIVITIES, EDUCATION, DISTRICTS, PRESCRIBERS, GOALS, CONTACT_SOURCES } from "../src/lib/referentiels";

writeFileSync(
  "scripts/.referentiels.json",
  JSON.stringify(
    {
      levels: LEVELS,
      genders: GENDERS.map((g) => g.label.toLowerCase()),
      activities: ACTIVITIES.map((a) => a.label),
      education: EDUCATION.map((e) => e.label),
      districts: DISTRICTS,
      prescribers: PRESCRIBERS,
      goals: GOALS.map((g) => g.label),
      sources: CONTACT_SOURCES.map((s) => s.label),
    },
    null,
    1,
  ),
);
console.log("référentiels exportés");
