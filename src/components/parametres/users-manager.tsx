"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { MoreHorizontal, UserPlus } from "lucide-react";
import {
  inviteMember,
  removeMember,
  renameMember,
  sendPasswordLink,
  updateMemberRole,
} from "@/app/(app)/parametres/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export type Member = {
  membershipId: string;
  name: string;
  email: string | null;
  role: "admin" | "coordinator" | "trainer" | "viewer";
  isSelf: boolean;
  trainerLinked: boolean;
  lastSignInAt: string | null; // null = jamais connecté
};

const ROLES = [
  { value: "admin", label: "Administrateur" },
  { value: "coordinator", label: "Coordinateur" },
  { value: "trainer", label: "Formateur" },
  { value: "viewer", label: "Lecture seule" },
] as const;

function lastSeen(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days === 0) return "aujourd'hui";
  if (days === 1) return "hier";
  if (days < 30) return `il y a ${days} j`;
  return new Date(iso).toLocaleDateString("fr-FR");
}

export function UsersManager({ members }: { members: Member[] }) {
  const [pending, startTransition] = useTransition();
  const [renaming, setRenaming] = useState<Member | null>(null);
  const [removing, setRemoving] = useState<Member | null>(null);
  const [newName, setNewName] = useState("");

  function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>, success: string) {
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(success);
      setRenaming(null);
      setRemoving(null);
    });
  }

  return (
    <div className="space-y-4">
      <ul className="space-y-2">
        {members.map((m) => (
          <li key={m.membershipId} className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2">
            <div className="min-w-0">
              <p className="text-sm font-medium">
                {m.name}
                {m.isSelf && <span className="ml-2 text-xs text-muted-foreground">(vous)</span>}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {m.email ?? "—"}
                {m.lastSignInAt
                  ? ` · vu ${lastSeen(m.lastSignInAt)}`
                  : ""}
              </p>
            </div>
            {!m.lastSignInAt && <Badge variant="outline">Jamais connecté</Badge>}
            {m.trainerLinked && <Badge variant="outline">Fiche formateur</Badge>}
            <div className="ml-auto flex items-center gap-1">
              <Select
                value={m.role}
                onValueChange={(v) =>
                  run(
                    () => updateMemberRole({ membershipId: m.membershipId, role: v as Member["role"] }),
                    "Rôle mis à jour. Il s'appliquera à sa prochaine connexion.",
                  )
                }
                disabled={pending || m.isSelf}
              >
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8" disabled={pending}>
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() =>
                      run(
                        () => sendPasswordLink(m.membershipId),
                        m.lastSignInAt
                          ? `Lien de réinitialisation envoyé à ${m.email}.`
                          : `Invitation renvoyée à ${m.email}.`,
                      )
                    }
                  >
                    {m.lastSignInAt ? "Envoyer un lien de réinitialisation" : "Renvoyer l'invitation"}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      setNewName(m.name);
                      setRenaming(m);
                    }}
                  >
                    Renommer
                  </DropdownMenuItem>
                  {!m.isSelf && (
                    <DropdownMenuItem className="text-destructive" onClick={() => setRemoving(m)}>
                      Retirer l&apos;accès
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </li>
        ))}
      </ul>
      <InviteDialog />
      <p className="text-xs text-muted-foreground">
        L&apos;invité reçoit un email avec un lien pour définir son mot de passe. Un changement
        de rôle prend effet à la prochaine connexion de l&apos;utilisateur.
      </p>

      {/* Renommer */}
      <Dialog open={renaming !== null} onOpenChange={(o) => !o && setRenaming(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Renommer l&apos;utilisateur</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setRenaming(null)} disabled={pending}>Annuler</Button>
              <Button
                disabled={pending || !newName.trim()}
                onClick={() =>
                  run(
                    () => renameMember({ membershipId: renaming!.membershipId, fullName: newName }),
                    "Nom mis à jour.",
                  )
                }
              >
                Enregistrer
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Retirer l'accès */}
      <Dialog open={removing !== null} onOpenChange={(o) => !o && setRemoving(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Retirer l&apos;accès de {removing?.name} ?</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              La personne ne pourra plus se connecter à l&apos;ERP. Sa fiche formateur, ses
              séances passées et ses émargements sont conservés. Vous pourrez la réinviter
              plus tard si besoin.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setRemoving(null)} disabled={pending}>Annuler</Button>
              <Button
                variant="destructive"
                disabled={pending}
                onClick={() =>
                  run(() => removeMember(removing!.membershipId), "Accès retiré.")
                }
              >
                Retirer l&apos;accès
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function InviteDialog() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<Member["role"]>("coordinator");
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const result = await inviteMember({ email, fullName, role });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Invitation envoyée à ${email}.`);
      setOpen(false);
      setEmail("");
      setFullName("");
      setRole("coordinator");
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <UserPlus className="mr-2 h-4 w-4" />
          Inviter un utilisateur
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Inviter un utilisateur</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Nom complet</Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Joseph Boulange" />
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Rôle</Label>
            <Select value={role} onValueChange={(v) => setRole(v as Member["role"])}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Pour un formateur, préférez la création de sa fiche (page Formateurs) : le compte
              est invité automatiquement et lié à son planning.
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Annuler
            </Button>
            <Button onClick={submit} disabled={pending || !email || !fullName}>
              {pending ? "Envoi…" : "Envoyer l'invitation"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
