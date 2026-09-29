// Faux client Supabase en mémoire pour tester le moteur de séquences sans base.
//
// Il ne couvre que les opérations utilisées par le module Leads : select avec filtres
// (eq, neq, in, is, not … is null, lt, lte, gt, gte, ilike), order, limit, single,
// maybeSingle, count ; insert ; update ; delete. Les valeurs de dates sont comparées
// comme des instants quand les deux côtés ressemblent à des dates ISO, comme le fait
// Postgres avec un timestamptz.

import { randomUUID } from "node:crypto";

type Row = Record<string, unknown>;
type Filter = (row: Row) => boolean;

function isIsoDate(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v) && Number.isFinite(Date.parse(v));
}

function same(a: unknown, b: unknown): boolean {
  if (isIsoDate(a) && isIsoDate(b)) return Date.parse(a) === Date.parse(b);
  return a === b;
}

function compare(a: unknown, b: unknown): number {
  if (isIsoDate(a) && isIsoDate(b)) return Date.parse(a) - Date.parse(b);
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b));
}

function ilike(value: unknown, pattern: string): boolean {
  const re = new RegExp(`^${pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*").replace(/_/g, ".")}$`, "is");
  return typeof value === "string" && re.test(value);
}

class Query implements PromiseLike<{ data: unknown; error: null; count: number | null }> {
  private filters: Filter[] = [];
  private orderBy: { column: string; ascending: boolean } | null = null;
  private limitTo: number | null = null;
  private mode: "select" | "insert" | "update" | "delete" = "select";
  private payload: Row | Row[] | null = null;
  private wantSingle = false;
  private wantMaybe = false;
  private wantCount = false;
  private headOnly = false;

  constructor(private readonly db: FakeSupabase, private readonly table: string) {}

  select(_columns?: string, opts?: { count?: "exact"; head?: boolean }) {
    if (this.mode === "select") {
      this.wantCount = opts?.count === "exact";
      this.headOnly = Boolean(opts?.head);
    }
    return this;
  }
  insert(rows: Row | Row[]) { this.mode = "insert"; this.payload = rows; return this; }
  update(patch: Row) { this.mode = "update"; this.payload = patch; return this; }
  delete() { this.mode = "delete"; return this; }

  eq(column: string, value: unknown) { this.filters.push((r) => same(r[column], value)); return this; }
  neq(column: string, value: unknown) { this.filters.push((r) => !same(r[column], value)); return this; }
  in(column: string, values: unknown[]) { this.filters.push((r) => values.some((v) => same(r[column], v))); return this; }
  is(column: string, value: null | boolean) { this.filters.push((r) => (value === null ? r[column] == null : r[column] === value)); return this; }
  not(column: string, op: string, value: unknown) {
    if (op === "is" && value === null) this.filters.push((r) => r[column] != null);
    else if (op === "eq") this.filters.push((r) => !same(r[column], value));
    else throw new Error(`not(${op}) non pris en charge par le faux client`);
    return this;
  }
  lt(column: string, value: unknown) { this.filters.push((r) => r[column] != null && compare(r[column], value) < 0); return this; }
  lte(column: string, value: unknown) { this.filters.push((r) => r[column] != null && compare(r[column], value) <= 0); return this; }
  gt(column: string, value: unknown) { this.filters.push((r) => r[column] != null && compare(r[column], value) > 0); return this; }
  gte(column: string, value: unknown) { this.filters.push((r) => r[column] != null && compare(r[column], value) >= 0); return this; }
  ilike(column: string, pattern: string) { this.filters.push((r) => ilike(r[column], pattern)); return this; }
  order(column: string, opts?: { ascending?: boolean }) { this.orderBy = { column, ascending: opts?.ascending ?? true }; return this; }
  limit(n: number) { this.limitTo = n; return this; }
  maybeSingle() { this.wantMaybe = true; return this; }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  single(): any { this.wantSingle = true; return this; }

  private matching(): Row[] {
    let rows = this.db.rows(this.table).filter((r) => this.filters.every((f) => f(r)));
    if (this.orderBy) {
      const { column, ascending } = this.orderBy;
      rows = [...rows].sort((a, b) => (ascending ? 1 : -1) * compare(a[column], b[column]));
    }
    if (this.limitTo != null) rows = rows.slice(0, this.limitTo);
    return rows;
  }

  private run(): { data: unknown; error: null; count: number | null } {
    this.db.log.push({ table: this.table, mode: this.mode });
    let result: Row[];
    if (this.mode === "insert") {
      const rows = (Array.isArray(this.payload) ? this.payload : [this.payload!]).map((r) => ({
        id: randomUUID(),
        created_at: this.db.now().toISOString(),
        ...(this.table === "employer_lead_events" ? { at: this.db.now().toISOString() } : {}),
        ...r,
      }));
      this.db.rows(this.table).push(...rows);
      this.db.afterInsert(this.table, rows);
      result = rows;
    } else if (this.mode === "update") {
      result = this.matching();
      for (const row of result) Object.assign(row, this.payload, { updated_at: this.db.now().toISOString() });
    } else if (this.mode === "delete") {
      result = this.matching();
      const ids = new Set(result.map((r) => r.id));
      this.db.tables.set(this.table, this.db.rows(this.table).filter((r) => !ids.has(r.id)));
    } else {
      result = this.matching();
    }
    const count = this.wantCount ? result.length : null;
    if (this.headOnly) return { data: null, error: null, count };
    const copy = result.map((r) => ({ ...r }));
    if (this.wantSingle || this.wantMaybe) return { data: copy[0] ?? null, error: null, count };
    return { data: copy, error: null, count };
  }

  then<R1 = unknown, R2 = never>(
    onfulfilled?: ((value: { data: unknown; error: null; count: number | null }) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return Promise.resolve().then(() => this.run()).then(onfulfilled, onrejected);
  }
}

export class FakeSupabase {
  tables = new Map<string, Row[]>();
  log: { table: string; mode: string }[] = [];
  private clock: () => Date;

  constructor(clock: () => Date = () => new Date()) {
    this.clock = clock;
  }

  now(): Date { return this.clock(); }
  setClock(clock: () => Date) { this.clock = clock; }

  rows(table: string): Row[] {
    if (!this.tables.has(table)) this.tables.set(table, []);
    return this.tables.get(table)!;
  }

  seed(table: string, rows: Row[]) {
    this.rows(table).push(...rows.map((r) => ({ id: randomUUID(), ...r })));
    return this;
  }

  from(table: string) { return new Query(this, table); }

  // Reproduit le trigger private.bump_employer_lead_contact : un appel, un SMS, un e-mail
  // ou un WhatsApp au journal compte comme une tentative de contact sur la fiche.
  afterInsert(table: string, rows: Row[]) {
    if (table !== "employer_lead_events") return;
    for (const e of rows) {
      if (!["appel", "sms", "email", "whatsapp"].includes(String(e.kind))) continue;
      const lead = this.rows("employer_leads").find((l) => l.id === e.lead_id);
      if (!lead) continue;
      lead.attempts = Number(lead.attempts ?? 0) + 1;
      lead.first_contact_at = lead.first_contact_at ?? e.at;
      lead.last_contact_at = e.at;
    }
  }

  // Raccourci de lecture pour les assertions.
  lead(id: string): Row { return this.rows("employer_leads").find((l) => l.id === id)!; }
  eventsOf(leadId: string): Row[] { return this.rows("employer_lead_events").filter((e) => e.lead_id === leadId); }
  notesOf(leadId: string): string[] { return this.eventsOf(leadId).map((e) => String(e.note ?? "")); }
}

// Le type SupabaseClient est bien plus large que ce faux client ; les tests le passent
// aux fonctions du module Leads via ce cast unique et assumé.
export function asSupabase(fake: FakeSupabase) {
  return fake as unknown as import("@supabase/supabase-js").SupabaseClient;
}
