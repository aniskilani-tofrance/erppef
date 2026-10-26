"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ClipboardCheck } from "lucide-react";
import { prepareMeetingTests } from "@/app/(app)/apprenants/admission/actions";
import { Button } from "@/components/ui/button";

// « Préparer les tests de niveau (n) » : crée le lien de test personnel des convoqués qui n'ont ni
// niveau connu ni test fait et n'ont pas encore de lien. Il entre alors dans leur convocation et leur
// rappel. Affiché seulement s'il y en a (les personnes ajoutées à la réunion reçoivent le leur seules).
export function PrepareTestsButton({ meetingId, count }: { meetingId: string; count: number }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  if (count === 0) return null;

  function run() {
    startTransition(async () => {
      const result = await prepareMeetingTests(meetingId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`${result.created ?? 0} test${(result.created ?? 0) > 1 ? "s" : ""} de niveau préparé${(result.created ?? 0) > 1 ? "s" : ""} : les liens sont dans les convocations.`);
      router.refresh();
    });
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={run}
      disabled={pending}
      title="Crée le lien du test de niveau de chaque convoqué qui ne l'a pas encore fait"
    >
      <ClipboardCheck className="mr-1.5 h-4 w-4" />
      {pending ? "Préparation…" : `Préparer les tests de niveau (${count})`}
    </Button>
  );
}
