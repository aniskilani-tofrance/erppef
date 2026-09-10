"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileSpreadsheet } from "lucide-react";
import { importLeads } from "@/app/(app)/leads/actions";
import { parseLeadsImport } from "@/lib/leads/csv";
import { segmentLabel } from "@/lib/leads/status";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

// Import par collage : depuis le Google Sheet de suivi (en-têtes reconnus) ou une liste simple.
export function LeadImportDialog() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const rows = parseLeadsImport(text);

  function submit() {
    startTransition(async () => {
      const r = await importLeads({ rows });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(`${r.imported} lead${r.imported > 1 ? "s" : ""} importé${r.imported > 1 ? "s" : ""}.`);
      setOpen(false);
      setText("");
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm"><FileSpreadsheet className="mr-2 h-4 w-4" />Importer</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>Importer des leads (collage)</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Copiez les lignes du Google Sheet de suivi (avec la ligne d&apos;en-têtes) ou une liste simple :
            <span className="block font-mono text-xs">Entreprise ; Contact ; Téléphone ; Email ; Ville CP ; Postes ; Nb postes ; Notes</span>
          </p>
          <Textarea id="leads-import-text" value={text} onChange={(e) => setText(e.target.value)} rows={7} placeholder={"Chez Karim;Karim BENALI;06 12 34 56 78;k@chezkarim.fr;Saint-Denis 93200;commis, plongeur;2;ouvert 7/7"} />
          {rows.length > 0 && (
            <div className="rounded-md border">
              <p className="border-b px-3 py-1.5 text-xs font-medium text-muted-foreground">Aperçu — {rows.length} ligne{rows.length > 1 ? "s" : ""}</p>
              <div className="max-h-56 overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Restaurant</TableHead><TableHead>Contact</TableHead><TableHead>Téléphone</TableHead><TableHead>Segment</TableHead><TableHead>Postes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.slice(0, 30).map((r, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{r.company}</TableCell>
                        <TableCell>{r.contactName ?? "—"}</TableCell>
                        <TableCell>{r.phone ?? "—"}</TableCell>
                        <TableCell>{segmentLabel(r.segment ?? "inconnu")}</TableCell>
                        <TableCell>{[r.positions, r.positionsCount ? `× ${r.positionsCount}` : null].filter(Boolean).join(" ") || "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>Annuler</Button>
            <Button onClick={submit} disabled={pending || rows.length === 0}>{pending ? "Import…" : `Importer ${rows.length || ""}`}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
