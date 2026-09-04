import { Badge } from "@/components/ui/badge";
import { admissionBadgeClass, admissionLabel } from "@/lib/admission/status";
import { cn } from "@/lib/utils";

// Pastille du statut d'admission (couleur = étape). Composant serveur, sans état.
export function AdmissionBadge({ status, className }: { status: string | null | undefined; className?: string }) {
  return (
    <Badge variant="outline" className={cn("whitespace-nowrap", admissionBadgeClass(status), className)}>
      {admissionLabel(status)}
    </Badge>
  );
}
