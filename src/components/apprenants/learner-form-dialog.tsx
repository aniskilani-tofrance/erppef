"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { detectQpv, upsertLearner } from "@/app/(app)/apprenants/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Pencil } from "lucide-react";
import { PhotoUpload, initials } from "@/components/ui/photo-upload";
import {
  ACTIVITIES as REF_ACTIVITIES,
  DISTRICTS as REF_DISTRICTS,
  EDUCATION as REF_EDUCATION,
  GENDERS as REF_GENDERS,
  LEVELS as REF_LEVELS,
} from "@/lib/referentiels";

export type LearnerFormValues = {
  id?: string;
  photoUrl: string | null;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  firstLanguage: string;
  levelAssessed: string;
  franceTravailId: string;
  notes: string;
  // Typologie (bilans financeurs) — "" ou "nc" = non renseigné
  birthDate: string;
  gender: string;
  nationality: string;
  address: string;
  city: string;
  postalCode: string;
  district: string; // '' = non renseigné
  qpv: string; // 'nc' | 'oui' | 'non'
  activityStatus: string;
  rqth: string; // 'nc' | 'oui' | 'non'
  educationLevel: string;
  prescriber: string;
};

const EMPTY: LearnerFormValues = {
  photoUrl: null,
  firstName: "",
  lastName: "",
  phone: "",
  email: "",
  firstLanguage: "",
  levelAssessed: "",
  franceTravailId: "",
  notes: "",
  birthDate: "",
  gender: "nc",
  nationality: "",
  address: "",
  city: "",
  postalCode: "",
  district: "nc",
  qpv: "nc",
  activityStatus: "nc",
  rqth: "nc",
  educationLevel: "nc",
  prescriber: "",
};

// Listes issues du RÉFÉRENTIEL UNIQUE (src/lib/referentiels.ts) — identiques au
// modèle Excel généré et à l'interprétation des imports.
const GENDER_OPTIONS = [{ value: "nc", label: "Non renseigné" }, ...REF_GENDERS.map((g) => ({ value: g.code, label: g.label }))];
const ACTIVITY_OPTIONS = [{ value: "nc", label: "Non renseignée" }, ...REF_ACTIVITIES.map((a) => ({ value: a.code, label: a.label }))];
const EDUCATION_OPTIONS = [{ value: "nc", label: "Non renseignée" }, ...REF_EDUCATION.map((e) => ({ value: e.code, label: e.label }))];
export const DISTRICTS = [...REF_DISTRICTS];
const DISTRICT_OPTIONS = [
  { value: "nc", label: "Non renseigné / hors Saint-Ouen" },
  ...DISTRICTS.map((d) => ({ value: d, label: d })),
];

// Le champ Quartier ne concerne que les résidents de Saint-Ouen (93400)
function isSaintOuen(city: string, postalCode: string): boolean {
  if (postalCode.trim() === "93400") return true;
  const c = city.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  return /saint[\s-]?ouen/.test(c) && !c.includes("aumone");
}

const YES_NO = [
  { value: "nc", label: "Non renseigné" },
  { value: "oui", label: "Oui" },
  { value: "non", label: "Non" },
];

const LEVELS = ["Non évalué", ...REF_LEVELS];

export function LearnerFormDialog({
  initial,
  groups = [],
  defaultGroupId,
  triggerLabel = "Nouvel apprenant",
}: {
  initial?: LearnerFormValues;
  // Groupes proposés pour l'inscription directe à la création (flux « créer et inscrire »).
  groups?: { id: string; name: string }[];
  defaultGroupId?: string;
  triggerLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<LearnerFormValues>(initial ?? EMPTY);
  const [groupId, setGroupId] = useState(defaultGroupId ?? "none");
  const [pending, startTransition] = useTransition();
  const [qpvChecking, setQpvChecking] = useState(false);
  const isEdit = Boolean(initial?.id);

  function set<K extends keyof LearnerFormValues>(key: K, value: LearnerFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  async function checkQpv() {
    setQpvChecking(true);
    const result = await detectQpv({
      address: values.address.trim(),
      city: values.city.trim(),
      postalCode: values.postalCode.trim(),
    });
    setQpvChecking(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    set("qpv", result.qpv ? "oui" : "non");
    toast.success(
      result.qpv
        ? `Adresse en QPV : ${result.qpvName} (${result.matchedAddress})`
        : `Hors QPV (${result.matchedAddress})`,
    );
  }

  function submit() {
    startTransition(async () => {
      const result = await upsertLearner({
        id: values.id,
        photoUrl: values.photoUrl,
        firstName: values.firstName.trim(),
        lastName: values.lastName.trim(),
        phone: values.phone.trim() || null,
        email: values.email.trim() || null,
        firstLanguage: values.firstLanguage.trim() || null,
        levelAssessed: values.levelAssessed === "Non évalué" || !values.levelAssessed ? null : values.levelAssessed,
        franceTravailId: values.franceTravailId.trim() || null,
        notes: values.notes.trim() || null,
        birthDate: values.birthDate || null,
        gender: values.gender === "nc" ? null : (values.gender as "femme" | "homme" | "autre"),
        nationality: values.nationality.trim() || null,
        address: values.address.trim() || null,
        city: values.city.trim() || null,
        district:
          values.district === "nc" || !isSaintOuen(values.city, values.postalCode)
            ? null
            : values.district,
        postalCode: values.postalCode.trim() || null,
        qpv: values.qpv === "nc" ? null : values.qpv === "oui",
        activityStatus:
          values.activityStatus === "nc"
            ? null
            : (values.activityStatus as "demandeur_emploi" | "rsa" | "salarie" | "scolaire_etudiant" | "inactif_autre"),
        rqth: values.rqth === "nc" ? null : values.rqth === "oui",
        educationLevel:
          values.educationLevel === "nc"
            ? null
            : (values.educationLevel as "non_scolarise" | "primaire" | "secondaire" | "superieur"),
        prescriber: values.prescriber.trim() || null,
        enrollGroupId: !isEdit && groupId !== "none" ? groupId : null,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(
        isEdit
          ? "Apprenant mis à jour."
          : groupId !== "none"
            ? "Apprenant créé et inscrit au groupe."
            : "Apprenant créé.",
      );
      setOpen(false);
      if (!isEdit) {
        setValues(EMPTY);
        setGroupId(defaultGroupId ?? "none");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {isEdit ? (
          <Button variant="ghost" size="icon" className="h-6 w-6">
            <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
        ) : (
          <Button size="sm">
            <Plus className="mr-2 h-4 w-4" />
            {triggerLabel}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Modifier l'apprenant" : "Nouvel apprenant"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <PhotoUpload
            url={values.photoUrl}
            fallback={initials(`${values.firstName} ${values.lastName}`) || "?"}
            folder="apprenants"
            onChange={(url) => set("photoUrl", url)}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Prénom</Label>
              <Input value={values.firstName} onChange={(e) => set("firstName", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Nom</Label>
              <Input value={values.lastName} onChange={(e) => set("lastName", e.target.value)} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Téléphone</Label>
              <Input value={values.phone} onChange={(e) => set("phone", e.target.value)} placeholder="06 12 34 56 78" />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={values.email} onChange={(e) => set("email", e.target.value)} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Langue première</Label>
              <Input value={values.firstLanguage} onChange={(e) => set("firstLanguage", e.target.value)} placeholder="arabe, dari, turc…" />
            </div>
            <div className="space-y-2">
              <Label>Niveau évalué</Label>
              <Select value={values.levelAssessed || "Non évalué"} onValueChange={(v) => set("levelAssessed", v)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LEVELS.map((l) => (
                    <SelectItem key={l} value={l}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Identifiant France Travail</Label>
            <Input value={values.franceTravailId} onChange={(e) => set("franceTravailId", e.target.value)} />
          </div>

          {/* Typologie : alimente les bilans financeurs. Tout est optionnel. */}
          <div className="rounded-md border p-3">
            <p className="mb-3 text-sm font-medium">
              Typologie <span className="font-normal text-muted-foreground">(pour les bilans financeurs — optionnel)</span>
            </p>
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Date de naissance</Label>
                  <Input type="date" value={values.birthDate} onChange={(e) => set("birthDate", e.target.value)} />
                </div>
                <SelectField label="Sexe" value={values.gender} options={GENDER_OPTIONS} onChange={(v) => set("gender", v)} />
              </div>
              <div className="space-y-2">
                <Label>Adresse (rue)</Label>
                <Input value={values.address} onChange={(e) => set("address", e.target.value)} placeholder="12 rue des Rosiers" />
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2 sm:col-span-2">
                  <Label>Commune de résidence</Label>
                  <Input value={values.city} onChange={(e) => set("city", e.target.value)} placeholder="Saint-Ouen-sur-Seine" />
                </div>
                <div className="space-y-2">
                  <Label>Code postal</Label>
                  <Input value={values.postalCode} onChange={(e) => set("postalCode", e.target.value)} placeholder="93400" />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <SelectField label="Réside en QPV" value={values.qpv} options={YES_NO} onChange={(v) => set("qpv", v)} />
                  <button
                    type="button"
                    disabled={qpvChecking || !values.address.trim()}
                    onClick={checkQpv}
                    className="text-xs text-muted-foreground underline-offset-2 hover:underline disabled:opacity-50"
                    title="Vérifie l'adresse contre les périmètres officiels ANCT 2024"
                  >
                    {qpvChecking ? "Vérification…" : "Détecter depuis l'adresse"}
                  </button>
                </div>
                <SelectField label="RQTH (handicap)" value={values.rqth} options={YES_NO} onChange={(v) => set("rqth", v)} />
              </div>
              {isSaintOuen(values.city, values.postalCode) && (
                <SelectField label="Quartier (Saint-Ouen)" value={values.district} options={DISTRICT_OPTIONS} onChange={(v) => set("district", v)} />
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <SelectField label="Situation" value={values.activityStatus} options={ACTIVITY_OPTIONS} onChange={(v) => set("activityStatus", v)} />
                <SelectField label="Scolarisation" value={values.educationLevel} options={EDUCATION_OPTIONS} onChange={(v) => set("educationLevel", v)} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Nationalité</Label>
                  <Input value={values.nationality} onChange={(e) => set("nationality", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Prescripteur</Label>
                  <Input value={values.prescriber} onChange={(e) => set("prescriber", e.target.value)} placeholder="France Travail, mission locale…" />
                </div>
              </div>
            </div>
          </div>
          {!isEdit && groups.length > 0 && (
            <div className="space-y-2">
              <Label>Inscrire directement dans un groupe</Label>
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
          )}
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea value={values.notes} onChange={(e) => set("notes", e.target.value)} rows={2} />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Annuler
            </Button>
            <Button onClick={submit} disabled={pending || !values.firstName || !values.lastName}>
              {pending ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
