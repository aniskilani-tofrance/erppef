"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { FileSpreadsheet, Upload } from "lucide-react";
import { importLearners } from "@/app/(app)/apprenants/actions";
import { parseImportText } from "@/lib/learner-import";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

export function LearnerImportDialog({ groups }: { groups: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [groupId, setGroupId] = useState("none");
  const [pending, startTransition] = useTransition();

  const rows = parseImportText(text);
  const fileRef = useRef<HTMLInputElement>(null);

  // Fichier Excel (.xlsx) → mêmes colonnes que le collage : converti en texte « ; »
  // et injecté dans l'aperçu (la bibliothèque n'est chargée qu'à ce moment-là).
  async function handleExcel(file: File) {
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer(), { cellDates: false });
      const sheetName = wb.SheetNames.find((n) => n.toLowerCase().includes("apprenant")) ?? wb.SheetNames[0];
      const csv = XLSX.utils.sheet_to_csv(wb.Sheets[sheetName], { FS: ";", blankrows: false });
      // Retirer les lignes d'exemple du modèle (marquées par des prénoms d'exemple en italique impossible à détecter :
      // on garde tout — l'utilisateur les a supprimées comme l'indique la notice)
      setText(csv.trim());
      toast.success(`Fichier lu : feuille « ${sheetName} » — vérifiez l'aperçu puis importez.`);
    } catch {
      toast.error("Fichier illisible : utilisez le modèle Excel fourni (.xlsx) ou le copier-coller.");
    }
  }

  function submit() {
    startTransition(async () => {
      const result = await importLearners({
        rows,
        enrollGroupId: groupId === "none" ? null : groupId,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(
        `${result.imported} apprenant${result.imported > 1 ? "s" : ""} importé${result.imported > 1 ? "s" : ""}` +
          (result.enrolled ? ` et inscrit${result.enrolled > 1 ? "s" : ""} au groupe.` : "."),
      );
      setOpen(false);
      setText("");
      setGroupId("none");
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <FileSpreadsheet className="mr-2 h-4 w-4" />
          Importer une liste
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Importer des apprenants (CSV)</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              <Upload className="mr-2 h-3.5 w-3.5" />
              Choisir un fichier Excel (.xlsx)
            </Button>
            <span className="text-xs text-muted-foreground">…ou collez vos lignes ci-dessous</span>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleExcel(f);
                e.target.value = "";
              }}
            />
          </div>
          <div className="space-y-2">
            <Label>Collez votre liste (une ligne par personne)</Label>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={7}
              placeholder={"Prénom;Nom;Téléphone;Email;Langue;Niveau\nAhmed;Karimi;0612345678;;dari;A1\nOlena;Kovalenko;;olena@mail.com;ukrainien;A2"}
              className="font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">
              Colonnes dans l&apos;ordre : Prénom ; Nom ; Téléphone ; Email ; Langue ; Niveau ;
              Naissance (JJ/MM/AAAA) ; Sexe ; Adresse ; Commune ; CP ; Situation ; QPV (oui/non) ;
              RQTH (oui/non) ; Scolarisation ; Prescripteur ; Quartier — seuls Prénom et Nom sont obligatoires.
              La typologie alimente directement les bilans financeurs. Copier-coller depuis Excel fonctionne.
            </p>
          </div>

          {rows.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">{rows.length} apprenant{rows.length > 1 ? "s" : ""} détecté{rows.length > 1 ? "s" : ""} :</p>
              <div className="max-h-40 overflow-y-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Prénom</TableHead>
                      <TableHead>Nom</TableHead>
                      <TableHead>Téléphone</TableHead>
                      <TableHead>Langue</TableHead>
                      <TableHead>Niveau</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.slice(0, 8).map((r, i) => (
                      <TableRow key={i}>
                        <TableCell>{r.firstName}</TableCell>
                        <TableCell>{r.lastName}</TableCell>
                        <TableCell>{r.phone ?? "—"}</TableCell>
                        <TableCell>{r.firstLanguage ?? "—"}</TableCell>
                        <TableCell>{r.levelAssessed ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {rows.length > 8 && (
                  <p className="px-3 py-1 text-xs text-muted-foreground">… et {rows.length - 8} de plus</p>
                )}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label>Inscrire tout le monde dans un groupe</Label>
            <Select value={groupId} onValueChange={setGroupId}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Pas d&apos;inscription pour l&apos;instant</SelectItem>
                {groups.map((g) => (
                  <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Annuler
            </Button>
            <Button onClick={submit} disabled={pending || rows.length === 0}>
              {pending ? "Import…" : `Importer ${rows.length || ""}`.trim()}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
