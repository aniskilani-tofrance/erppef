// Couleur d'un groupe = couleur de sa formatrice (la même que sur le planning), pour que
// la pastille « groupe » d'un apprenant et la couleur de ses séances racontent la même chose.
// Sans formatrice ou sans couleur : couleur de secours stable, dérivée de l'identifiant du
// groupe (identique sur toutes les pages, sans dépendre de l'ordre d'une liste).

export const PALETTE = ["#0ea5e9", "#14b8a6", "#a855f7", "#f59e0b", "#ef4444", "#22c55e", "#6366f1", "#ec4899", "#84cc16", "#f97316"];

export type GroupRef = { id: string; name: string; color: string };

export function hashColor(id: string): string {
  let h = 5381;
  for (let i = 0; i < id.length; i++) h = ((h << 5) + h + id.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export function groupColor(group: { id: string; trainerColor?: string | null }): string {
  const c = group.trainerColor?.trim();
  return c && /^#[0-9a-fA-F]{6}$/.test(c) ? c : hashColor(group.id);
}

// Lignes d'inscriptions (jointure groups → trainers) → groupes par apprenant, sans doublon.
export type EnrollmentRow = {
  learner_id: string;
  group_id: string;
  status?: string | null;
  groups: { name: string; trainers?: { color: string | null } | null } | null;
};

export function groupsByLearner(rows: EnrollmentRow[] | null | undefined): Map<string, GroupRef[]> {
  const out = new Map<string, GroupRef[]>();
  for (const r of rows ?? []) {
    if (r.status && r.status !== "inscrit") continue;
    if (!r.groups) continue;
    const list = out.get(r.learner_id) ?? [];
    if (list.some((g) => g.id === r.group_id)) continue;
    list.push({ id: r.group_id, name: r.groups.name, color: groupColor({ id: r.group_id, trainerColor: r.groups.trainers?.color ?? null }) });
    out.set(r.learner_id, list);
  }
  for (const list of out.values()) list.sort((a, b) => a.name.localeCompare(b.name, "fr"));
  return out;
}
