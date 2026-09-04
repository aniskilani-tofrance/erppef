// Calendrier d'alternance UPEC/CFA — Master 2 Lettres FLES (M2 LETTRES FLE 25-27),
// année 2026-2027 (source : « Calendrier 2026-27pdf.pdf », septembre 2026 → 7 septembre 2027).
// Les jours « Formation »/« Révision » (à l'université) deviennent des absences pour
// Marie TREGARO et Marie Joelle GRACIAS ; les jours ouvrés laissés vides par le CFA
// (20, 30, 31 août 2027) deviennent des congés. Idempotent : une plage déjà couverte
// (contrainte no_absence_overlap) est sautée, pas dupliquée.
//
// Usage : PGURL=... node scripts/seed-calendrier-alternance-2026-27.mjs
//
// Totaux contrôlés contre la ligne E/F/R du PDF : 61 jours Cours + 1 jour Révision,
// 194 jours Entreprise (sept: F14, oct: F8, nov: F8, déc: F6, jan: F12, fév: F2,
// mars: F4, avr: F1, mai: F0, juin: F5, juil: R1, août: 3 jours vides, sept 27: F1).

import pg from "pg";

const NOTE_FORMATION = "Cours M2 FLES — UPEC/CFA (calendrier alternance 2026-27)";
const RANGES = [
  // [starts_on, ends_on, kind, note] — plages inclusives, week-ends pontés
  ["2026-09-07", "2026-09-07", "formation", NOTE_FORMATION],
  ["2026-09-14", "2026-10-02", "formation", NOTE_FORMATION],
  ["2026-10-08", "2026-10-09", "formation", NOTE_FORMATION],
  ["2026-10-15", "2026-10-16", "formation", NOTE_FORMATION],
  ["2026-10-22", "2026-10-23", "formation", NOTE_FORMATION],
  ["2026-11-05", "2026-11-06", "formation", NOTE_FORMATION],
  ["2026-11-12", "2026-11-13", "formation", NOTE_FORMATION],
  ["2026-11-19", "2026-11-20", "formation", NOTE_FORMATION],
  ["2026-11-26", "2026-11-27", "formation", NOTE_FORMATION],
  ["2026-12-03", "2026-12-04", "formation", NOTE_FORMATION],
  ["2026-12-10", "2026-12-11", "formation", NOTE_FORMATION],
  ["2026-12-17", "2026-12-18", "formation", NOTE_FORMATION],
  ["2027-01-04", "2027-01-15", "formation", NOTE_FORMATION],
  ["2027-01-22", "2027-01-22", "formation", NOTE_FORMATION],
  ["2027-01-29", "2027-01-29", "formation", NOTE_FORMATION],
  ["2027-02-05", "2027-02-05", "formation", NOTE_FORMATION],
  ["2027-02-26", "2027-02-26", "formation", NOTE_FORMATION],
  ["2027-03-05", "2027-03-05", "formation", NOTE_FORMATION],
  ["2027-03-12", "2027-03-12", "formation", NOTE_FORMATION],
  ["2027-03-19", "2027-03-19", "formation", NOTE_FORMATION],
  ["2027-03-26", "2027-03-26", "formation", NOTE_FORMATION],
  ["2027-04-02", "2027-04-02", "formation", NOTE_FORMATION],
  ["2027-06-02", "2027-06-04", "formation", NOTE_FORMATION],
  ["2027-06-17", "2027-06-18", "formation", NOTE_FORMATION],
  ["2027-07-01", "2027-07-01", "formation", "Révision examens M2 FLES — UPEC/CFA"],
  ["2027-08-20", "2027-08-20", "conge", "Jour non travaillé (calendrier CFA, août 2027)"],
  ["2027-08-30", "2027-08-31", "conge", "Jours non travaillés (calendrier CFA, août 2027)"],
  ["2027-09-07", "2027-09-07", "formation", "Dernier jour de formation M2 FLES — UPEC/CFA"],
];

const TRAINEES = [
  ["Marie", "TREGARO"],
  ["Marie Joelle", "GRACIAS"],
];

const client = new pg.Client({ connectionString: process.env.PGURL, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  const { rows: [org] } = await client.query("select id from organizations where slug = 'pef'");
  if (!org) throw new Error("organisation pef introuvable");

  for (const [firstName, lastName] of TRAINEES) {
    const { rows: [trainer] } = await client.query(
      "select id, first_name, last_name from trainers where org_id = $1 and upper(last_name) = $2",
      [org.id, lastName],
    );
    if (!trainer) {
      console.log(`⚠️  ${firstName} ${lastName} introuvable — ignorée`);
      continue;
    }
    let added = 0, skipped = 0;
    for (const [from, to, kind, note] of RANGES) {
      const { rows: overlap } = await client.query(
        "select 1 from trainer_absences where trainer_id = $1 and daterange(starts_on, ends_on, '[]') && daterange($2::date, $3::date, '[]')",
        [trainer.id, from, to],
      );
      if (overlap.length) { skipped += 1; continue; }
      await client.query(
        "insert into trainer_absences (org_id, trainer_id, starts_on, ends_on, kind, note) values ($1, $2, $3, $4, $5, $6)",
        [org.id, trainer.id, from, to, kind, note],
      );
      added += 1;
    }
    console.log(`${trainer.first_name} ${trainer.last_name} : ${added} plage(s) ajoutée(s), ${skipped} déjà couverte(s)`);

    // Séances déjà planifiées qui tombent sur une absence (rien n'est supprimé, on signale)
    const { rows: conflicts } = await client.query(
      `select s.id, g.name as group_name,
              (s.starts_at at time zone 'Europe/Paris') as local_start
       from sessions s
       join groups g on g.id = s.group_id
       join trainer_absences a on a.trainer_id = s.trainer_id
        and (s.starts_at at time zone 'Europe/Paris')::date between a.starts_on and a.ends_on
       where s.org_id = $1 and s.trainer_id = $2 and s.starts_at >= now() and s.status <> 'annulee'
       order by s.starts_at`,
      [org.id, trainer.id],
    );
    if (conflicts.length) {
      console.log(`  ⚠️  ${conflicts.length} séance(s) planifiée(s) pendant une absence :`);
      for (const c of conflicts) {
        console.log(`     - ${c.local_start.toISOString().slice(0, 16).replace("T", " ")} · ${c.group_name}`);
      }
    } else {
      console.log("  ✅ aucune séance planifiée en conflit");
    }
  }
} finally {
  await client.end();
}
