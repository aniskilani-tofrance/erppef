"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { UserPlus } from "lucide-react";
import { enrollLearners } from "@/app/(app)/apprenants/actions";
import { DISTRICTS } from "@/components/apprenants/learner-form-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

// Un candidat à l'inscription, avec toute sa typologie pour le filtrage.
export type PickerLearner = {
  id: string;
  name: string;
  ref: string; // A-0001
  level: string | null;
  language: string | null;
  city: string | null;
  district: string | null;
  qpv: boolean | null;
  gender: string | null;
  activity: string | null;
  education: string | null;
  prescriber: string | null;
  birthDate: string | null;
};

import { ACTIVITIES as REF_ACTIVITIES, EDUCATION as REF_EDUCATION, GENDERS as REF_GENDERS } from "@/lib/referentiels";
const toLabels = (entries: readonly { code: string; label: string }[]) =>
  Object.fromEntries(entries.map((e) => [e.code, e.label]));
const ACTIVITY_LABELS = toLabels(REF_ACTIVITIES);
const EDUCATION_LABELS = toLabels(REF_EDUCATION);
const GENDER_LABELS = toLabels(REF_GENDERS);

function ageBucket(birthDate: string | null): string | null {
  if (!birthDate) return null;
  const age = Math.floor((Date.now() - new Date(`${birthDate}T12:00:00Z`).getTime()) / (365.25 * 86_400_000));
  if (age < 18) return "Moins de 18 ans";
  if (age <= 25) return "18-25 ans";
  if (age <= 44) return "26-44 ans";
  return "45 ans et plus";
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Sélecteur d'inscription : recherche + filtres sur TOUS les critères de la fiche,
// cases à cocher, inscription en lot.
export function EnrollmentPicker({
  groupId,
  available,
  suggestedLevel,
}: {
  groupId: string;
  available: PickerLearner[];
  suggestedLevel?: string | null; // niveau d'entrée du dispositif : pré-filtre proposé
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();

  // Options de chaque filtre = valeurs réellement présentes chez les candidats
  const options = useMemo(() => {
    const collect = (key: (l: PickerLearner) => string | null, labels?: Record<string, string>) => {
      const values = [...new Set(available.map(key).filter((v): v is string => Boolean(v)))].sort();
      return values.map((v) => ({ value: v, label: labels?.[v] ?? v }));
    };
    const observedDistricts = new Set(available.map((l) => l.district).filter(Boolean) as string[]);
    return {
      level: collect((l) => l.level),
      language: collect((l) => l.language),
      district: [...new Set([...DISTRICTS, ...observedDistricts])].map((d) => ({ value: d, label: d })),
      city: collect((l) => l.city),
      gender: collect((l) => l.gender, GENDER_LABELS),
      activity: collect((l) => l.activity, ACTIVITY_LABELS),
      education: collect((l) => l.education, EDUCATION_LABELS),
      prescriber: collect((l) => l.prescriber),
      age: collect((l) => ageBucket(l.birthDate)),
    };
  }, [available]);

  const filtered = useMemo(() => {
    return available.filter((l) => {
      if (query.trim()) {
        const hay = norm(`${l.name} ${l.ref}`);
        if (!query.trim().split(/\s+/).every((w) => hay.includes(norm(w)))) return false;
      }
      const checks: [string, string | null][] = [
        ["level", l.level], ["language", l.language], ["district", l.district],
        ["city", l.city], ["gender", l.gender], ["activity", l.activity],
        ["education", l.education], ["prescriber", l.prescriber],
        ["age", ageBucket(l.birthDate)],
        ["qpv", l.qpv == null ? null : l.qpv ? "oui" : "non"],
      ];
      return checks.every(([key, value]) => !filters[key] || filters[key] === value);
    });
  }, [available, query, filters]);

  function setFilter(key: string, value: string) {
    setFilters((f) => {
      const next = { ...f };
      if (value === "tous") delete next[key];
      else next[key] = value;
      return next;
    });
  }

  function submit() {
    startTransition(async () => {
      const result = await enrollLearners({ groupId, learnerIds: [...checked] });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`${result.enrolled} apprenant${result.enrolled > 1 ? "s" : ""} inscrit${result.enrolled > 1 ? "s" : ""}.`);
      setOpen(false);
      setChecked(new Set());
    });
  }

  const filterDefs: { key: string; placeholder: string; opts: { value: string; label: string }[] }[] = [
    { key: "level", placeholder: "Niveau", opts: options.level },
    { key: "language", placeholder: "Langue", opts: options.language },
    { key: "district", placeholder: "Quartier", opts: options.district },
    { key: "city", placeholder: "Commune", opts: options.city },
    { key: "qpv", placeholder: "QPV", opts: [{ value: "oui", label: "En QPV" }, { value: "non", label: "Hors QPV" }] },
    { key: "gender", placeholder: "Sexe", opts: options.gender },
    { key: "age", placeholder: "Âge", opts: options.age },
    { key: "activity", placeholder: "Situation", opts: options.activity },
    { key: "education", placeholder: "Scolarisation", opts: options.education },
    { key: "prescriber", placeholder: "Prescripteur", opts: options.prescriber },
  ];

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o && suggestedLevel && options.level.some((x) => x.value === suggestedLevel)) {
          setFilters({ level: suggestedLevel });
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <UserPlus className="mr-2 h-4 w-4" />
          Inscrire des apprenants…
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Inscrire des apprenants</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            placeholder="Rechercher par nom ou référence (A-0042)…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {filterDefs
              .filter((f) => f.opts.length > 0)
              .map((f) => (
                <Select key={f.key} value={filters[f.key] ?? "tous"} onValueChange={(v) => setFilter(f.key, v)}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder={f.placeholder} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tous">{f.placeholder} : tous</SelectItem>
                    {f.opts.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ))}
          </div>

          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {filtered.length} apprenant{filtered.length > 1 ? "s" : ""} — {checked.size} coché{checked.size > 1 ? "s" : ""}
            </span>
            <button
              type="button"
              className="text-xs underline-offset-2 hover:underline"
              onClick={() => {
                const allChecked = filtered.every((l) => checked.has(l.id));
                setChecked((prev) => {
                  const next = new Set(prev);
                  for (const l of filtered) allChecked ? next.delete(l.id) : next.add(l.id);
                  return next;
                });
              }}
            >
              {filtered.length > 0 && filtered.every((l) => checked.has(l.id))
                ? "Tout décocher"
                : "Cocher tous les filtrés"}
            </button>
          </div>

          <div className="max-h-72 space-y-0.5 overflow-y-auto rounded-md border p-2">
            {filtered.length === 0 && (
              <p className="py-4 text-center text-sm text-muted-foreground">
                Aucun apprenant ne correspond aux filtres.
              </p>
            )}
            {filtered.map((l) => (
              <label key={l.id} className="flex items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-muted/50">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-primary"
                  checked={checked.has(l.id)}
                  onChange={(e) => {
                    setChecked((prev) => {
                      const next = new Set(prev);
                      if (e.target.checked) next.add(l.id);
                      else next.delete(l.id);
                      return next;
                    });
                  }}
                />
                <span className="font-mono text-[11px] text-muted-foreground">{l.ref}</span>
                <span>{l.name}</span>
                <span className="ml-auto flex gap-2 text-xs text-muted-foreground">
                  {l.level && <span>{l.level}</span>}
                  {l.language && <span>{l.language}</span>}
                  {l.district && <span>{l.district}</span>}
                </span>
              </label>
            ))}
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Annuler
            </Button>
            <Button onClick={submit} disabled={pending || checked.size === 0}>
              {pending ? "Inscription…" : `Inscrire ${checked.size} apprenant${checked.size > 1 ? "s" : ""}`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
