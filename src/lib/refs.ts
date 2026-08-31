// Références lisibles des numéros uniques par organisation (A-0001, G-0001).
export function learnerRef(no: number | null | undefined): string {
  return no == null ? "—" : `A-${String(no).padStart(4, "0")}`;
}
export function groupRef(no: number | null | undefined): string {
  return no == null ? "—" : `G-${String(no).padStart(4, "0")}`;
}
