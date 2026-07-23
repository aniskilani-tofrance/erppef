"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { FileSpreadsheet } from "lucide-react";
import { importLearners } from "@/app/(app)/apprenants/actions";
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

type Row = {
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
  firstLanguage: string | null;
  levelAssessed: string | null;
};

// Colonnes attendues, dans l'ordre : Prénom;Nom;Téléphone;Email;Langue;Niveau
// (ligne d'en-têtes optionnelle, séparateur ; , ou tabulation, colonnes 3-6 facultatives).
function parseCsv(text: string): Row[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return [];
  const sep = [";", "\t", ","].find((s) => lines[0].includes(s)) ?? ";";
  const rows = lines.map((l) => l.split(sep).map((c) => c.trim().replace(/^"|"$/g, "")));
  // Ligne d'en-têtes ? (contient « nom » ou « prénom » sans être un vrai nom probable)
  if (/pr[ée]nom|^nom$|t[ée]l[ée]phone|email/i.test(rows[0].join("|"))) rows.shift();
  return rows
    .filter((c) => c[0] && c[1])
    .map((c) => ({
      firstName: c[0],
      lastName: c[1],
      phone: c[2] || null,
      email: c[3] || null,
      firstLanguage: c[4] || null,
      levelAssessed: c[5] || null,
    }));
}

export function LearnerImportDialog({ groups }: { groups: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [groupId, setGroupId] = useState("none");
  const [pending, startTransition] = useTransition();

  const rows = parseCsv(text);

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
              Colonnes dans l&apos;ordre : Prénom ; Nom ; Téléphone ; Email ; Langue ; Niveau —
              seuls Prénom et Nom sont obligatoires. Copier-coller depuis Excel fonctionne.
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
