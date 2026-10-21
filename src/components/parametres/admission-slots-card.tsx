"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarRange, Plus, Trash2 } from "lucide-react";
import {
  addAdmissionSlotBlock,
  deleteAdmissionSlotBlock,
  saveAdmissionSlotRules,
} from "@/app/(app)/parametres/actions";
import {
  BLOCK_PARTS,
  SLOT_DURATIONS,
  SLOT_HORIZON_DAYS,
  WEEKDAYS,
  validateSlotRule,
  type BlockPart,
} from "@/lib/admission/slots";
import { utcToLocalDate, utcToLocalTime } from "@/lib/dates";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

export type SlotRuleView = { weekday: number; startTime: string; endTime: string; isActive: boolean };
export type SlotBlockView = { id: string; startsAt: string; endsAt: string; reason: string | null };

type EditableRule = SlotRuleView & { key: number };

let nextKey = 0;
const withKey = (r: SlotRuleView): EditableRule => ({ ...r, key: nextKey++ });

// Paramètres → « Créneaux d'admission » : les plages de la semaine où l'on reçoit en RDV
// d'admission, la durée d'un créneau, et les périodes bloquées. Pensé pour le téléphone.
export function AdmissionSlotsCard({
  rules: initialRules,
  slotMinutes: initialMinutes,
  isDefault,
  blocks,
  freeCount,
}: {
  rules: SlotRuleView[];
  slotMinutes: number;
  isDefault: boolean;
  blocks: SlotBlockView[];
  freeCount: number;
}) {
  const [rules, setRules] = useState<EditableRule[]>(() => initialRules.map(withKey));
  const [minutes, setMinutes] = useState(String(initialMinutes));
  const [dirty, setDirty] = useState(false);
  const [blockFrom, setBlockFrom] = useState("");
  const [blockTo, setBlockTo] = useState("");
  const [blockPart, setBlockPart] = useState<BlockPart>("journee");
  const [blockReason, setBlockReason] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function update(key: number, patch: Partial<SlotRuleView>) {
    setRules((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
    setDirty(true);
  }
  function remove(key: number) {
    setRules((rs) => rs.filter((r) => r.key !== key));
    setDirty(true);
  }
  function addRule() {
    const last = rules[rules.length - 1];
    setRules((rs) => [...rs, withKey({ weekday: last?.weekday ?? 2, startTime: "10:00", endTime: "12:00", isActive: true })]);
    setDirty(true);
  }

  const problems = rules.map((r) => validateSlotRule({ ...r, slotMinutes: Number(minutes) }));
  const invalid = problems.some(Boolean);

  function save() {
    startTransition(async () => {
      const result = await saveAdmissionSlotRules({
        slotMinutes: Number(minutes),
        rules: [...rules]
          .sort((a, b) => a.weekday - b.weekday || a.startTime.localeCompare(b.startTime))
          .map(({ weekday, startTime, endTime, isActive }) => ({ weekday, startTime, endTime, isActive })),
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Créneaux enregistrés : le dialogue « RDV » les propose dès maintenant.");
      setDirty(false);
      router.refresh();
    });
  }

  function addBlock() {
    startTransition(async () => {
      const result = await addAdmissionSlotBlock({
        from: blockFrom,
        to: blockTo || blockFrom,
        part: blockPart,
        reason: blockReason.trim() || null,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Période bloquée : plus aucun créneau proposé sur ce moment.");
      setBlockFrom("");
      setBlockTo("");
      setBlockReason("");
      setBlockPart("journee");
      router.refresh();
    });
  }

  function removeBlock(id: string) {
    startTransition(async () => {
      const result = await deleteAdmissionSlotBlock(id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Période débloquée.");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarRange className="h-4 w-4" />
          Créneaux d&apos;admission
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Les plages où l&apos;on reçoit en rendez-vous d&apos;admission. Le dialogue « RDV » de l&apos;onglet Admission
          propose les créneaux libres des {SLOT_HORIZON_DAYS} prochains jours (au moins 2 h à l&apos;avance, hors jours
          fériés, fermetures, périodes bloquées et rendez-vous déjà pris).{" "}
          <b>{freeCount} créneau{freeCount > 1 ? "x" : ""} libre{freeCount > 1 ? "s" : ""}</b> en ce moment.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <section className="space-y-3">
          {isDefault && !dirty && (
            <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800">
              Réglage par défaut (pas encore enregistré)
            </Badge>
          )}
          <ul className="space-y-2">
            {rules.map((r, i) => (
              <li key={r.key} className="rounded-md border p-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Select value={String(r.weekday)} onValueChange={(v) => update(r.key, { weekday: Number(v) })}>
                    <SelectTrigger className="h-10 w-32"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {WEEKDAYS.map((w) => (
                        <SelectItem key={w.value} value={String(w.value)}>{w.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="time"
                    value={r.startTime}
                    onChange={(e) => update(r.key, { startTime: e.target.value })}
                    className="h-10 w-28"
                    aria-label="Début"
                  />
                  <span className="text-muted-foreground">→</span>
                  <Input
                    type="time"
                    value={r.endTime}
                    onChange={(e) => update(r.key, { endTime: e.target.value })}
                    className="h-10 w-28"
                    aria-label="Fin"
                  />
                  <label className="flex items-center gap-2 text-sm">
                    <Switch checked={r.isActive} onCheckedChange={(v) => update(r.key, { isActive: v })} />
                    {r.isActive ? "Active" : "Suspendue"}
                  </label>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="ml-auto h-10 w-10"
                    onClick={() => remove(r.key)}
                    disabled={pending}
                    aria-label="Supprimer la plage"
                  >
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </div>
                {problems[i] && <p className="mt-1 text-xs text-destructive">{problems[i]}</p>}
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-end gap-3">
            <Button variant="outline" onClick={addRule} disabled={pending} className="h-10">
              <Plus className="mr-1 h-4 w-4" />
              Ajouter une plage
            </Button>
            <div className="space-y-1">
              <Label>Durée d&apos;un créneau</Label>
              <Select
                value={minutes}
                onValueChange={(v) => {
                  setMinutes(v);
                  setDirty(true);
                }}
              >
                <SelectTrigger className="h-10 w-28"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[...new Set([...SLOT_DURATIONS.map(String), minutes])].map((m) => (
                    <SelectItem key={m} value={m}>{m} min</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={save} disabled={pending || invalid || !rules.length || (!dirty && !isDefault)} className="h-10">
              {pending ? "Enregistrement…" : "Enregistrer les plages"}
            </Button>
          </div>
        </section>

        <section className="space-y-3">
          <p className="text-sm font-medium">Périodes bloquées</p>
          {blocks.length > 0 ? (
            <ul className="space-y-2 text-sm">
              {blocks.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
                  <span>
                    <span className="font-medium">{blockLabel(b)}</span>
                    {b.reason && <span className="text-muted-foreground"> — {b.reason}</span>}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9"
                    onClick={() => removeBlock(b.id)}
                    disabled={pending}
                    aria-label="Débloquer"
                  >
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Aucune période bloquée à venir.</p>
          )}
          <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-end">
            <div className="space-y-1">
              <Label>Du</Label>
              <Input type="date" value={blockFrom} onChange={(e) => setBlockFrom(e.target.value)} className="h-10 sm:w-40" />
            </div>
            <div className="space-y-1">
              <Label>Au (inclus, optionnel)</Label>
              <Input type="date" value={blockTo} onChange={(e) => setBlockTo(e.target.value)} className="h-10 sm:w-40" />
            </div>
            <div className="space-y-1">
              <Label>Moment</Label>
              <Select value={blockPart} onValueChange={(v) => setBlockPart(v as BlockPart)}>
                <SelectTrigger className="h-10 w-full sm:w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {BLOCK_PARTS.map((p) => (
                    <SelectItem key={p.code} value={p.code}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Motif (optionnel)</Label>
              <Input
                value={blockReason}
                onChange={(e) => setBlockReason(e.target.value)}
                placeholder="Réunion financeur"
                className="h-10 sm:w-48"
              />
            </div>
            <Button onClick={addBlock} disabled={pending || !blockFrom} className="col-span-2 h-10 sm:col-span-1">
              Bloquer
            </Button>
          </div>
        </section>
      </CardContent>
    </Card>
  );
}

// « 21/10 matin », « 21/10 → 24/10 », « 21/10 10h00 → 12h00 » (heure de Paris).
function blockLabel(b: SlotBlockView): string {
  const fmt = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;
  const startDay = utcToLocalDate(b.startsAt);
  const startTime = utcToLocalTime(b.startsAt);
  // Une fin à minuit appartient encore à la veille.
  const endIso = new Date(Date.parse(b.endsAt) - 60_000).toISOString();
  const endDay = utcToLocalDate(endIso);
  const endTime = utcToLocalTime(b.endsAt);
  const h = (t: string) => t.replace(":", "h");
  if (startDay === endDay) {
    if (startTime === "00:00" && endTime === "00:00") return `${fmt(startDay)} journée`;
    if (startTime === "00:00" && endTime === "13:00") return `${fmt(startDay)} matin`;
    if (startTime === "13:00" && endTime === "00:00") return `${fmt(startDay)} après-midi`;
    return `${fmt(startDay)} ${h(startTime)} → ${h(endTime)}`;
  }
  return `${fmt(startDay)} → ${fmt(endDay)}`;
}
