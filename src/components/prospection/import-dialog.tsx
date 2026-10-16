"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileSpreadsheet } from "lucide-react";
import { importProspects } from "@/app/(app)/prospection/actions";
import { parseProspectImport } from "@/lib/prospection/import";
import { segmentLabel } from "@/lib/leads/status";
import { formatPhone } from "@/lib/admission/phone";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

const BATCH = 500;
const NEW_LIST = "__nouvelle__";

// Import par collage depuis Excel : sélectionner les lignes (avec la ligne d'en-têtes),
// copier, coller. Envoi par paquets de 500 ; les SIRET déjà connus sont ignorés.
export function ProspectImportDialog({ lists }: { lists: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [target, setTarget] = useState(NEW_LIST);
  const [name, setName] = useState("");
  const [progress, setProgress] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const rows = parseProspectImport(text);
  const withPhone = rows.filter((r) => r.phone).length;

  function submit() {
    startTransition(async () => {
      let listId = target === NEW_LIST ? null : target;
      let imported = 0;
      let skipped = 0;
      for (let i = 0; i < rows.length; i += BATCH) {
        setProgress(`${Math.min(i + BATCH, rows.length)} / ${rows.length}`);
        const r = await importProspects({ listId, listName: listId ? null : name, rows: rows.slice(i, i + BATCH) });
        if (!r.ok) {
          toast.error(r.error);
          setProgress(null);
          if (imported) router.refresh();
          return;
        }
        listId = r.listId;
        imported += r.imported;
        skipped += r.skipped;
      }
      setProgress(null);
      toast.success(
        `${imported} restaurant${imported > 1 ? "s" : ""} importé${imported > 1 ? "s" : ""}` +
          (skipped ? ` · ${skipped} déjà connu${skipped > 1 ? "s" : ""} (même SIRET), ignoré${skipped > 1 ? "s" : ""}` : "") +
          ".",
      );
      setOpen(false);
      setText("");
      setName("");
      router.push(`/prospection/${listId}`);
    });
  }

  const canSubmit = rows.length > 0 && (target !== NEW_LIST || name.trim().length > 0);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><FileSpreadsheet className="mr-2 h-4 w-4" />Importer une liste</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader><DialogTitle>Importer une liste d&apos;appels</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="prospect-import-target">Liste</Label>
              <Select value={target} onValueChange={setTarget}>
                <SelectTrigger id="prospect-import-target"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NEW_LIST}>Nouvelle liste</SelectItem>
                  {lists.map((l) => <SelectItem key={l.id} value={l.id}>Ajouter à « {l.name} »</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {target === NEW_LIST && (
              <div className="space-y-1">
                <Label htmlFor="prospect-import-name">Nom de la liste</Label>
                <Input id="prospect-import-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ouvertures 2026 — priorité 1 — 93" />
              </div>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Dans Excel, sélectionnez les lignes avec la ligne d&apos;en-têtes, copiez, puis collez ici.
            Colonnes reconnues : Nom / enseigne, Type, Date de création, Adresse, CP, Commune, Dépt, Téléphone, E-mail, Site web, SIRET.
            Les restaurants fermés sont écartés.
          </p>
          <Textarea id="prospect-import-text" value={text} onChange={(e) => setText(e.target.value)} rows={7} placeholder={"Nom / enseigne\tType\tDate de création\tAdresse\tCP\tCommune\tDépt\tTéléphone\tE-mail\tSite web\tSIRET"} />
          {rows.length > 0 && (
            <div className="rounded-md border">
              <p className="border-b px-3 py-1.5 text-xs font-medium text-muted-foreground">
                Aperçu — {rows.length} restaurant{rows.length > 1 ? "s" : ""}, dont {withPhone} avec un numéro
              </p>
              <div className="max-h-56 overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Restaurant</TableHead><TableHead>Type</TableHead><TableHead>Ville</TableHead><TableHead>Téléphone</TableHead><TableHead>Ouvert le</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.slice(0, 30).map((r, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{r.company}</TableCell>
                        <TableCell>{segmentLabel(r.segment)}</TableCell>
                        <TableCell>{r.city ?? "—"}</TableCell>
                        <TableCell>{r.phone ? formatPhone(r.phone) : "—"}</TableCell>
                        <TableCell>{r.openedOn?.split("-").reverse().join("/") ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
          <div className="flex items-center justify-end gap-2">
            {progress && <span className="text-xs text-muted-foreground">Envoi {progress}…</span>}
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>Annuler</Button>
            <Button onClick={submit} disabled={pending || !canSubmit}>{pending ? "Import…" : `Importer ${rows.length || ""}`}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
