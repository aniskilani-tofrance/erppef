import { HandCoins } from "lucide-react";
import { requireFinancements } from "@/lib/financements/acces";
import { FinancementsNav } from "@/components/financements/financements-nav";

export const metadata = { title: "Financements — ERP PEF" };

// Module « Financements » (lot 1) : admin et coordination seulement. Toutes les pages
// du dossier passent par ce layout (garde de rôle + onglets).
export default async function FinancementsLayout({ children }: { children: React.ReactNode }) {
  await requireFinancements();
  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <HandCoins className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-semibold tracking-tight">Financements</h1>
      </div>
      <FinancementsNav />
      {children}
    </div>
  );
}
