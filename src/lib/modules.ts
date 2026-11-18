// Modules que l'administration peut retirer à UNE personne, en plus de ce que son rôle
// autorise (Paramètres → Utilisateurs → « Modules retirés »). Logique PURE : partagée
// par le filtre des requêtes (proxy), le menu, les nouveautés, l'aide et la base
// (migration 0062, colonne memberships.denied_modules).

export const RESTRICTABLE_MODULES = ["financements", "leads", "prospection", "candidats_poei"] as const;
export type ModuleKey = (typeof RESTRICTABLE_MODULES)[number];

export const MODULE_LABELS: Record<ModuleKey, string> = {
  financements: "Financements",
  leads: "Leads resto",
  prospection: "Prospection",
  candidats_poei: "Candidats POEI",
};

// Racine des pages de chaque module (les routes /api à jeton de service ne sont pas
// des pages de session : elles ne passent pas par ce contrôle).
export const MODULE_ROOTS: Record<ModuleKey, string> = {
  financements: "/financements",
  leads: "/leads",
  prospection: "/prospection",
  candidats_poei: "/candidats-poei",
};

// Module dont dépend un chemin, ou null. « /financements » ne doit pas attraper « /finance ».
export function moduleOfPath(pathname: string): ModuleKey | null {
  for (const key of RESTRICTABLE_MODULES) {
    const root = MODULE_ROOTS[key];
    if (pathname === root || pathname.startsWith(`${root}/`)) return key;
  }
  return null;
}

export function isModuleKey(v: unknown): v is ModuleKey {
  return typeof v === "string" && (RESTRICTABLE_MODULES as readonly string[]).includes(v);
}

// Liste propre (valeurs connues, sans doublon, dans l'ordre de référence) depuis la base ou un formulaire.
export function cleanDeniedModules(raw: unknown): ModuleKey[] {
  if (!Array.isArray(raw)) return [];
  return RESTRICTABLE_MODULES.filter((m) => raw.includes(m));
}

export function isDenied(denied: readonly string[] | null | undefined, module: ModuleKey | null | undefined): boolean {
  return !!module && !!denied && denied.includes(module);
}
