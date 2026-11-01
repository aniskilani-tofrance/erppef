import { randomUUID } from "node:crypto";

// Base Supabase simulée en mémoire pour les tests des documents de l'apprenant : aucune
// requête ne part vers la vraie base. Les colonnes demandées sont ignorées (les lignes des
// jeux d'essai contiennent déjà leurs relations imbriquées) ; les filtres sont appliqués.

export type Row = Record<string, unknown>;
export type DbError = { code?: string; message: string };

export type FakeDb = {
  tables: Record<string, Row[]>;
  errors: Record<string, DbError>; // table → erreur renvoyée par toute requête (migration absente…)
  files: Map<string, Uint8Array>; // "bucket/chemin" → contenu
  writes: { table: string; op: string; values: Row }[];
  unique?: (table: string, row: Row, rows: Row[]) => boolean; // true = doublon (23505)
};

export function newDb(tables: Record<string, Row[]> = {}): FakeDb {
  return { tables, errors: {}, files: new Map(), writes: [] };
}

export function fakeClient(db: FakeDb) {
  return {
    from(table: string) {
      let op: "select" | "insert" | "update" | "upsert" = "select";
      let values: Row | Row[] = {};
      let onConflict: string[] = [];
      let single = false;
      let limit = Infinity;
      const filters: ((r: Row) => boolean)[] = [];
      const run = (): { data: unknown; error: DbError | null } => {
        if (db.errors[table]) return { data: null, error: db.errors[table] };
        const all = (db.tables[table] ??= []);
        if (op === "insert" || op === "upsert") {
          const list = Array.isArray(values) ? values : [values];
          const out: Row[] = [];
          for (const v of list) {
            const row: Row = { id: randomUUID(), ...(table === "learner_signature_links" ? { token: randomUUID() } : {}), ...v };
            if (op === "upsert" && onConflict.length) {
              const existing = all.find((r) => onConflict.every((c) => r[c] === row[c]));
              if (existing) {
                Object.assign(existing, v);
                db.writes.push({ table, op: "upsert-update", values: { ...v } });
                out.push(existing);
                continue;
              }
            }
            if (db.unique?.(table, row, all)) return { data: null, error: { code: "23505", message: "duplicate key value" } };
            all.push(row);
            db.writes.push({ table, op, values: { ...row } });
            out.push(row);
          }
          return { data: single ? out[0] : out, error: null };
        }
        const rows = all.filter((r) => filters.every((f) => f(r)));
        if (op === "update") {
          for (const r of rows) {
            Object.assign(r, values);
            db.writes.push({ table, op, values: { ...(values as Row), id: r.id } });
          }
          return { data: null, error: null };
        }
        return { data: rows.slice(0, limit).map((r) => ({ ...r })), error: null };
      };
      const q = {
        select() {
          return q;
        },
        insert(v: Row | Row[]) {
          op = "insert";
          values = v;
          return q;
        },
        upsert(v: Row | Row[], opts?: { onConflict?: string }) {
          op = "upsert";
          values = v;
          onConflict = (opts?.onConflict ?? "").split(",").map((c) => c.trim()).filter(Boolean);
          return q;
        },
        update(v: Row) {
          op = "update";
          values = v;
          return q;
        },
        eq(c: string, v: unknown) {
          filters.push((r) => r[c] === v);
          return q;
        },
        neq(c: string, v: unknown) {
          filters.push((r) => r[c] !== v);
          return q;
        },
        in(c: string, v: unknown[]) {
          filters.push((r) => v.includes(r[c]));
          return q;
        },
        order() {
          return q;
        },
        limit(n: number) {
          limit = n;
          return q;
        },
        async maybeSingle() {
          const res = run();
          const data = Array.isArray(res.data) ? (res.data[0] ?? null) : res.data;
          return { data, error: res.error };
        },
        async single() {
          single = true;
          const res = run();
          const data = Array.isArray(res.data) ? (res.data[0] ?? null) : res.data;
          return { data, error: res.error ?? (data ? null : { code: "PGRST116", message: "no rows" }) };
        },
        then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
          return Promise.resolve(run()).then(resolve, reject);
        },
      };
      return q;
    },
    storage: {
      from(bucket: string) {
        return {
          async upload(path: string, bytes: Uint8Array) {
            if (db.files.has(`${bucket}/${path}`)) return { data: null, error: { message: "exists" } };
            db.files.set(`${bucket}/${path}`, bytes);
            return { data: { path }, error: null };
          },
          async remove(paths: string[]) {
            for (const p of paths) db.files.delete(`${bucket}/${p}`);
            return { data: null, error: null };
          },
          async download(path: string) {
            const bytes = db.files.get(`${bucket}/${path}`);
            return bytes ? { data: new Blob([Buffer.from(bytes)]), error: null } : { data: null, error: { message: "not found" } };
          },
        };
      },
    },
  };
}

// ── Jeux d'essai ─────────────────────────────────────────────────────────────

export const ORG = "a0000000-0000-4000-8000-000000000001";
export const OTHER_ORG = "76115778-08b4-457b-ba61-2d48dd404426";
export const GROUP_PEF = "11111111-1111-4111-8111-111111111111";
export const GROUP_MUNI = "22222222-2222-4222-8222-222222222222";
export const LEARNER = "33333333-3333-4333-8333-333333333333";
export const OTHER_LEARNER = "44444444-4444-4444-8444-444444444444";
export const STRANGER = "55555555-5555-4555-8555-555555555555"; // autre organisme
export const TRAINER = "66666666-6666-4666-8666-666666666666";

const pefFunder = { code: "PEF" };
export const groupPef: Row = {
  id: GROUP_PEF,
  org_id: ORG,
  name: "PEF A1 — 2026-27",
  starts_on: "2026-10-05",
  ends_on: "2027-06-14",
  total_hours: 300,
  capacity: 15,
  weekly_pattern: [{ weekday: 1, start: "09:30", end: "12:30" }, { weekday: 4, start: "09:30", end: "12:30" }],
  trainer_id: TRAINER,
  co_trainer_id: null,
  funders: pefFunder,
  programs: { code: "PEF_A1", name: "PEF A1", level: "A2", entry_level: "A1", default_funder: pefFunder },
  rooms: { name: "Salle 12", address: "14 rue Alexandre Bachelet, 93400 Saint-Ouen-sur-Seine" },
  trainers: { first_name: "Marie", last_name: "Exemple" },
};
export const groupMuni: Row = {
  ...groupPef,
  id: GROUP_MUNI,
  name: "Cours municipaux A1 — Cordon",
  funders: { code: "STOBOP104" },
  programs: { code: "CMSTOA1", name: "Cours municipaux A1", level: "A2", entry_level: null, default_funder: { code: "STOBOP104" } },
};

export const learnerRow = (over: Row = {}): Row => ({
  id: LEARNER,
  org_id: ORG,
  first_name: "Prénom",
  last_name: "Exemple",
  birth_date: "1990-03-14",
  gender: "femme",
  address: "1 rue de l'Exemple",
  postal_code: "93400",
  city: "Saint-Ouen-sur-Seine",
  phone: "06 00 00 00 01",
  email: null,
  learner_no: 42,
  ...over,
});

export function world(): FakeDb {
  const db = newDb({
    learners: [
      learnerRow(),
      learnerRow({ id: OTHER_LEARNER, first_name: "Voisine", last_name: "Secrète", phone: "06 99 99 99 99", learner_no: 43 }),
      learnerRow({ id: STRANGER, org_id: OTHER_ORG, first_name: "Théo", last_name: "Bacasable", learner_no: 42 }),
    ],
    groups: [groupPef, groupMuni],
    enrollments: [
      { id: "e1", org_id: ORG, group_id: GROUP_PEF, learner_id: LEARNER, status: "inscrit", learners: { first_name: "Prénom", last_name: "Exemple", phone: "06 00 00 00 01" }, groups: groupPef },
      { id: "e2", org_id: ORG, group_id: GROUP_PEF, learner_id: OTHER_LEARNER, status: "inscrit", learners: { first_name: "Voisine", last_name: "Secrète", phone: "06 99 99 99 99" }, groups: groupPef },
      { id: "e3", org_id: ORG, group_id: GROUP_MUNI, learner_id: LEARNER, status: "inscrit", learners: { first_name: "Prénom", last_name: "Exemple", phone: "06 00 00 00 01" }, groups: groupMuni },
      { id: "e4", org_id: OTHER_ORG, group_id: GROUP_PEF, learner_id: STRANGER, status: "inscrit", learners: { first_name: "Théo", last_name: "Bacasable", phone: null }, groups: groupPef },
    ],
    sessions: [],
    memberships: [],
    learner_signature_links: [],
    learner_signed_documents: [],
    learner_memberships: [],
    learner_contacts: [],
    organizations: [{ id: ORG, settings: {} }],
    profiles: [],
  });
  // Mêmes index uniques que la migration 0059
  db.unique = (table, row, rows) =>
    table === "learner_signed_documents" &&
    rows.some((r) =>
      r.learner_id === row.learner_id &&
      r.kind === row.kind &&
      r.text_version === row.text_version &&
      (row.kind === "contrat_formation" ? r.group_id === row.group_id : r.membership_year === row.membership_year),
    );
  return db;
}

export function addLink(db: FakeDb, over: Row = {}): string {
  const token = randomUUID();
  db.tables.learner_signature_links.push({
    id: randomUUID(),
    org_id: ORG,
    learner_id: LEARNER,
    group_id: GROUP_PEF,
    token,
    channel: "lien",
    expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    completed_at: null,
    ...over,
  });
  return token;
}

/** Texte lisible d'un PDF pdf-lib (polices standard : chaînes hexadécimales WinAnsi). */
export async function pdfText(bytes: Uint8Array): Promise<string> {
  const { PDFDocument, PDFRawStream, decodePDFRawStream, PDFArray, PDFRef } = await import("pdf-lib");
  const doc = await PDFDocument.load(bytes);
  let out = "";
  for (const page of doc.getPages()) {
    const contents = page.node.Contents();
    const refs = contents instanceof PDFArray ? contents.asArray() : [contents];
    for (const ref of refs) {
      const obj = ref instanceof PDFRef ? doc.context.lookup(ref) : ref;
      if (!(obj instanceof PDFRawStream)) continue;
      const raw = Buffer.from(decodePDFRawStream(obj).decode()).toString("latin1");
      for (const m of raw.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)) out += Buffer.from(m[1], "hex").toString("latin1") + "\n";
    }
  }
  return out.replace(/\x80/g, "€").replace(/\x92/g, "'").replace(/\x96/g, "–").replace(/\x97/g, "—").replace(/\xab/g, "«").replace(/\xbb/g, "»");
}
