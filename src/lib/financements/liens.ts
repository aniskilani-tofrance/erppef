// Où mène un clic sur une échéance : le dossier d'abord, sinon l'opportunité, sinon le financeur.
export type DeadlineLinks = {
  application_id: string | null;
  opportunity_id: string | null;
  funder_id: string | null;
};

export function deadlineHref(d: DeadlineLinks): string {
  if (d.application_id) return `/financements/dossiers/${d.application_id}`;
  if (d.opportunity_id) return `/financements/veille/${d.opportunity_id}`;
  if (d.funder_id) return `/financements/financeurs/${d.funder_id}`;
  return "/financements/calendrier";
}

export function formatEuros(n: number | string | null | undefined): string {
  if (n === null || n === undefined || n === "") return "—";
  const v = typeof n === "string" ? Number(n) : n;
  if (!Number.isFinite(v)) return "—";
  return v.toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
}

export function formatAmountRange(min: number | string | null, max: number | string | null): string | null {
  const a = min === null || min === "" ? null : Number(min);
  const b = max === null || max === "" ? null : Number(max);
  if (a === null && b === null) return null;
  if (a !== null && b !== null) return a === b ? formatEuros(a) : `${formatEuros(a)} à ${formatEuros(b)}`;
  if (a !== null) return `à partir de ${formatEuros(a)}`;
  return `jusqu'à ${formatEuros(b)}`;
}

export function formatDueAt(iso: string, withTime = true): string {
  const d = new Date(iso);
  const day = d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Paris" });
  if (!withTime) return day;
  const time = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }).replace(":", "h");
  return `${day} à ${time}`;
}

export function formatDay(day: string | null | undefined): string {
  if (!day) return "—";
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Paris" });
}
