"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarClock, FolderKanban, Home, Landmark, Radar } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/financements", label: "Ma semaine", icon: Home, exact: true },
  { href: "/financements/veille", label: "Veille", icon: Radar },
  { href: "/financements/dossiers", label: "Dossiers", icon: FolderKanban },
  { href: "/financements/calendrier", label: "Calendrier", icon: CalendarClock },
  { href: "/financements/financeurs", label: "Financeurs", icon: Landmark },
] as const;

// Onglets du module : défilent horizontalement sur téléphone.
export function FinancementsNav() {
  const pathname = usePathname();
  return (
    <nav className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0" aria-label="Rubriques Financements">
      <div className="flex w-max gap-1 rounded-lg border bg-background p-1">
        {TABS.map((t) => {
          const active = "exact" in t && t.exact ? pathname === t.href : pathname.startsWith(t.href);
          return (
            <Link
              key={t.href}
              href={t.href}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors",
                active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <t.icon className="h-4 w-4" />
              {t.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
