"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { depositReportToDrive } from "@/app/(app)/rapports/actions";
import { Button } from "@/components/ui/button";
import { CloudUpload } from "lucide-react";

export function DepositReportButton({
  funderId,
  from,
  to,
}: {
  funderId: string;
  from: string;
  to: string;
}) {
  const [pending, startTransition] = useTransition();

  function deposit() {
    startTransition(async () => {
      const result = await depositReportToDrive({ funderId, from, to });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Bilan déposé sur le Drive (dossier « Bilans financeurs »).");
    });
  }

  return (
    <Button variant="outline" size="sm" onClick={deposit} disabled={pending}>
      <CloudUpload className="mr-2 h-4 w-4" />
      {pending ? "Dépôt…" : "Déposer sur le Drive"}
    </Button>
  );
}
