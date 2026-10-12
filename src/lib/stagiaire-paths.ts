// Pages ouvertes au rôle « stagiaire » (contrôle d'URL dans src/proxy.ts, en plus de la
// RLS qui ne lui montre que ses groupes). Fichier sans dépendance serveur : testable.

const ALLOWED_PREFIXES = ["/dashboard", "/groupes", "/planning", "/seances", "/formation", "/aide", "/compte"];

// Sous-pages d'un groupe réservées à l'équipe : évaluations et attestations d'acquis
// (pédagogie), création de groupe.
const BLOCKED_PATTERNS = [/^\/groupes\/nouveau(\/|$)/, /^\/groupes\/[^/]+\/evaluations(\/|$)/, /^\/groupes\/[^/]+\/attestation\//];

export function stagiairePathAllowed(pathname: string): boolean {
  if (BLOCKED_PATTERNS.some((re) => re.test(pathname))) return false;
  return ALLOWED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
