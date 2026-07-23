import { Skeleton } from "@/components/ui/skeleton";

// Affiché instantanément au clic pendant le rendu serveur de la page cible :
// la navigation répond immédiatement au lieu d'attendre le SSR.
export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Skeleton className="h-8 w-64" />
      <div className="grid gap-4 sm:grid-cols-3">
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
      </div>
      <Skeleton className="h-96" />
    </div>
  );
}
