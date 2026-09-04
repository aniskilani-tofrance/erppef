"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { UserPlus } from "lucide-react";
import { inviteToMeeting } from "@/app/(app)/admission/actions";
import { AdmissionBadge } from "@/components/admission/admission-badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

export type Candidate = {
  id: string;
  name: string;
  ref: string;
  phone: string | null;
  status: string;
  level: string | null;
};

// Ajout de convoqués à une réunion : recherche + cases à cocher. Par défaut, les
// apprenants déjà inscrits dans un groupe ou « sans suite » sont masqués.
export function InviteLearnersDialog({ meetingId, candidates }: { meetingId: string; candidates: Candidate[] }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const visible = useMemo(() => {
    const words = query.trim().split(/\s+/).filter(Boolean).map(norm);
    return candidates.filter((c) => {
      if (!showAll && (c.status === "inscrit" || c.status === "sans_suite")) return false;
      if (!words.length) return true;
      const hay = norm(`${c.name} ${c.ref} ${c.phone ?? ""}`);
      return words.every((w) => hay.includes(w));
    });
  }, [candidates, query, showAll]);

  function toggle(id: string, on: boolean) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function submit() {
    startTransition(async () => {
      const result = await inviteToMeeting({ meetingId, learnerIds: [...checked] });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`${result.invited} convoqué${result.invited > 1 ? "s" : ""} ajouté${result.invited > 1 ? "s" : ""} — envoyez maintenant les messages WhatsApp.`);
      setChecked(new Set());
      setOpen(false);
      router.refresh();
    });
  }

  const allVisibleOn = visible.length > 0 && visible.every((c) => checked.has(c.id));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <UserPlus className="mr-2 h-4 w-4" />
          Ajouter des convoqués
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Convoquer à la réunion</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Nom, référence A-0001, téléphone…"
              className="flex-1"
            />
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <Checkbox checked={showAll} onCheckedChange={(v) => setShowAll(v === true)} />
              Afficher aussi les inscrits et « sans suite »
            </label>
          </div>
          {visible.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Personne à convoquer avec ce filtre.
            </p>
          ) : (
            <div className="max-h-80 overflow-y-auto rounded-md border">
              <label className="flex items-center gap-2 border-b bg-muted/40 px-3 py-1.5 text-xs">
                <Checkbox
                  checked={allVisibleOn}
                  onCheckedChange={(v) =>
                    setChecked((prev) => {
                      const next = new Set(prev);
                      for (const c of visible) {
                        if (v === true) next.add(c.id);
                        else next.delete(c.id);
                      }
                      return next;
                    })
                  }
                />
                Tout cocher ({visible.length})
              </label>
              <ul className="divide-y">
                {visible.map((c) => (
                  <li key={c.id}>
                    <label className="flex cursor-pointer items-center gap-3 px-3 py-1.5 text-sm hover:bg-muted/40">
                      <Checkbox checked={checked.has(c.id)} onCheckedChange={(v) => toggle(c.id, v === true)} />
                      <span className="min-w-0 flex-1">
                        {c.name}
                        <span className="ml-2 font-mono text-[11px] text-muted-foreground">{c.ref}</span>
                        <span className="block text-xs text-muted-foreground">
                          {c.phone ?? "sans téléphone"}{c.level ? ` · ${c.level}` : ""}
                        </span>
                      </span>
                      <AdmissionBadge status={c.status} />
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>Annuler</Button>
            <Button onClick={submit} disabled={pending || checked.size === 0}>
              {pending ? "Ajout…" : `Convoquer (${checked.size})`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
