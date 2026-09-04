import Link from "next/link";
import { cn } from "@/lib/utils";

// Onglets de la page Apprenants : la liste, et l'admission (à contacter, réunions,
// origine des demandes). Une seule entrée de menu, tout au même endroit.
export function LearnersTabs({
  active,
  toContact,
}: {
  active: "liste" | "admission";
  toContact: number;
}) {
  const tabs = [
    { key: "liste", href: "/apprenants", label: "Tous les apprenants" },
    { key: "admission", href: "/apprenants/admission", label: "Admission", badge: toContact },
  ] as const;
  return (
    <nav className="flex gap-1 border-b" aria-label="Sections apprenants">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          className={cn(
            "-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
            active === t.key
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
          )}
          aria-current={active === t.key ? "page" : undefined}
        >
          {t.label}
          {"badge" in t && t.badge > 0 && (
            <span
              className={cn(
                "rounded-full px-1.5 text-[11px] font-semibold",
                active === t.key ? "bg-amber-100 text-amber-800" : "bg-muted text-muted-foreground",
              )}
              title={`${t.badge} à contacter`}
            >
              {t.badge}
            </span>
          )}
        </Link>
      ))}
    </nav>
  );
}
