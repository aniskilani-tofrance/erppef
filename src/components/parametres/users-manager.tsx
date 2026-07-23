"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { UserPlus } from "lucide-react";
import { inviteMember, updateMemberRole } from "@/app/(app)/parametres/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
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
};

const ROLES = [
  { value: "admin", label: "Administrateur" },
  { value: "coordinator", label: "Coordinateur" },
  { value: "trainer", label: "Formateur" },
  { value: "viewer", label: "Lecture seule" },
] as const;

export function UsersManager({ members }: { members: Member[] }) {
  const [pending, startTransition] = useTransition();

  function changeRole(membershipId: string, role: Member["role"]) {
    startTransition(async () => {
      const result = await updateMemberRole({ membershipId, role });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Rôle mis à jour. Il s'appliquera à sa prochaine connexion.");
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
              {m.email && <p className="truncate text-xs text-muted-foreground">{m.email}</p>}
            </div>
            {m.trainerLinked && <Badge variant="outline">Fiche formateur liée</Badge>}
            <div className="ml-auto">
              <Select
                value={m.role}
                onValueChange={(v) => changeRole(m.membershipId, v as Member["role"])}
                disabled={pending || m.isSelf}
              >
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </li>
        ))}
      </ul>
      <InviteDialog />
      <p className="text-xs text-muted-foreground">
        L&apos;invité reçoit un email avec un lien pour définir son mot de passe. Un changement
        de rôle prend effet à la prochaine connexion de l&apos;utilisateur.
      </p>
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
