"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { openLearnerSigning, type ClassLearner, type ClassSheet, type OpenLearnerResult } from "@/app/signer/classe/[token]/actions";
import { signDocuments } from "@/app/signer/[token]/actions";
import { SignaturePad } from "@/components/emargement/signature-pad";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DOCUMENT_LABELS, type SignedDocumentKind } from "@/lib/documents-apprenant/regles";
import { DocumentReader } from "./document-reader";
import { primaryClass, secondaryClass, titleClass } from "./signing-shell";

type Sheet = Extract<ClassSheet, { ok: true }>;
type Opened = Extract<OpenLearnerResult, { ok: true }> & { learnerId: string };

const dayFr = (d: string) =>
  new Date(`${d.slice(0, 10)}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Paris" });
const timeFr = (iso: string) => new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }).replace(":", "h");

function LearnerAvatar({ learner }: { learner: ClassLearner }) {
  return (
    <Avatar className="h-10 w-10">
      {learner.photoUrl && <AvatarImage src={learner.photoUrl} alt="" className="object-cover" />}
      <AvatarFallback className="text-sm">
        {learner.name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("")}
      </AvatarFallback>
    </Avatar>
  );
}

// Documents lus en classe, signés en faisant circuler le téléphone (comme la feuille
// d'émargement) : liste des inscrits → la personne touche son nom → coche chaque document
// (« Relire » au besoin) → signe au doigt → « Personne suivante ». Le serveur refait tous les
// contrôles à chaque étape.
export function ClassSigning({ token, sheet }: { token: string; sheet: Sheet }) {
  const router = useRouter();
  const [opened, setOpened] = useState<Opened | null>(null);
  const [signedNow, setSignedNow] = useState<Set<string>>(new Set());
  const [listError, setListError] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const backToList = () => {
    setOpened(null);
    window.scrollTo({ top: 0 });
    router.refresh();
  };

  if (opened) {
    return <LearnerStep opened={opened} onBack={backToList} onSigned={(id) => setSignedNow((prev) => new Set(prev).add(id))} />;
  }

  const isDone = (l: ClassLearner) => l.pending === 0 || signedNow.has(l.id);
  const done = sheet.learners.filter(isDone).length;

  const open = (l: ClassLearner) => {
    setListError(null);
    setLoadingId(l.id);
    startTransition(async () => {
      const res = await openLearnerSigning({ token, learnerId: l.id });
      setLoadingId(null);
      if (!res.ok) {
        setListError(res.error);
        return;
      }
      setOpened({ ...res, learnerId: l.id });
      window.scrollTo({ top: 0 });
    });
  };

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <h1 className={titleClass}>Documents à signer</h1>
        <p className="text-base text-zinc-600">
          {sheet.groupName} · {dayFr(sheet.startsAt)} · {timeFr(sheet.startsAt)} – {timeFr(sheet.endsAt)}
        </p>
        <p>Les documents ont été lus en classe. Touchez votre nom, cochez, puis signez avec votre doigt. Ensuite, donnez le téléphone à la personne suivante.</p>
      </div>
      <p className="w-fit rounded-full bg-[#E8F6F0] px-3 py-1 text-base font-semibold text-[#00504E]">
        {done} / {sheet.learners.length} ont tout signé
      </p>
      {listError && (
        <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 font-medium text-red-800">
          {listError}
        </p>
      )}
      <ul className="space-y-2">
        {sheet.learners.map((l) => (
          <li key={l.id}>
            {isDone(l) ? (
              <div className="flex items-center gap-3 rounded-2xl bg-zinc-100 px-4 py-3 text-zinc-500">
                <LearnerAvatar learner={l} />
                <span className="font-semibold">{l.name}</span>
                <span className="ml-auto text-base font-semibold text-emerald-700">✓ Signé</span>
              </div>
            ) : (
              <button
                type="button"
                className="flex w-full items-center gap-3 rounded-2xl bg-white px-4 py-3 text-left font-semibold ring-2 ring-zinc-200 transition hover:ring-[#00504E] disabled:opacity-60"
                onClick={() => open(l)}
                disabled={pending}
              >
                <LearnerAvatar learner={l} />
                <span>{l.name}</span>
                <span className="ml-auto text-base font-normal text-zinc-500">{loadingId === l.id ? "Ouverture…" : "Signer"}</span>
              </button>
            )}
          </li>
        ))}
      </ul>
      <a className="block text-center text-base text-[#00504E] underline underline-offset-4" href={`/emargement/${token}`}>
        Retour à la feuille d&apos;émargement
      </a>
    </div>
  );
}

function LearnerStep({ opened, onBack, onSigned }: { opened: Opened; onBack: () => void; onSigned: (learnerId: string) => void }) {
  const { page, signingToken } = opened;
  const [accepted, setAccepted] = useState<Set<SignedDocumentKind>>(new Set());
  const [reading, setReading] = useState<SignedDocumentKind | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();
  const allChecked = page.texts.every((t) => accepted.has(t.kind));

  if (done) {
    return (
      <div className="space-y-5 text-center">
        <p aria-hidden className="text-5xl">✅</p>
        <h1 className={titleClass}>C&apos;est signé. Merci{page.firstName ? ` ${page.firstName}` : ""} !</h1>
        <p>L&apos;association garde une copie de chaque document dans votre dossier.</p>
        <p className="rounded-2xl bg-[#E8F6F0] px-4 py-3 text-xl font-semibold text-[#00504E]">Donnez le téléphone à la personne suivante.</p>
        <button type="button" className={`${primaryClass} w-full`} onClick={onBack}>
          Personne suivante
        </button>
      </div>
    );
  }

  const submit = () => {
    if (!signature || !allChecked) return;
    startTransition(async () => {
      const res = await signDocuments({ token: signingToken, accepted: [...accepted], signature });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onSigned(opened.learnerId);
      setDone(true);
      window.scrollTo({ top: 0 });
    });
  };

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <h1 className={titleClass}>{page.fullName}</h1>
        <p>Ces documents ont été lus en classe. Cochez chaque document :</p>
      </div>
      <ul className="space-y-3">
        {page.texts.map((t) => (
          <li key={t.kind} className="space-y-2">
            <label className="flex cursor-pointer items-start gap-4 rounded-2xl border-2 border-zinc-200 bg-white p-4 text-lg font-medium has-[:checked]:border-[#00504E] has-[:checked]:bg-[#E8F6F0]">
              <input
                type="checkbox"
                className="mt-1 size-7 shrink-0 accent-[#00504E]"
                checked={accepted.has(t.kind)}
                onChange={(e) =>
                  setAccepted((prev) => {
                    const n = new Set(prev);
                    if (e.target.checked) n.add(t.kind);
                    else n.delete(t.kind);
                    return n;
                  })
                }
              />
              <span>
                <span className="block text-base font-semibold text-[#00504E]">{DOCUMENT_LABELS[t.kind]}</span>
                {t.acceptLabel}
              </span>
            </label>
            <button
              type="button"
              className="text-base text-[#00504E] underline underline-offset-4"
              onClick={() => setReading(reading === t.kind ? null : t.kind)}
              aria-expanded={reading === t.kind}
            >
              {reading === t.kind ? "Fermer le texte" : "Relire le texte"}
            </button>
            {reading === t.kind && (
              <div className="rounded-2xl bg-zinc-50 p-4 ring-1 ring-zinc-200">
                <DocumentReader text={t} />
              </div>
            )}
          </li>
        ))}
      </ul>
      {page.retractationUntil && (
        <p className="rounded-2xl bg-[#E8F6F0] px-4 py-3">
          Vous pouvez changer d&apos;avis jusqu&apos;au <strong>{dayFr(page.retractationUntil)}</strong>.
        </p>
      )}
      <p className="font-semibold">Signez avec votre doigt dans le cadre :</p>
      <SignaturePad onChange={setSignature} height={200} />
      <p className="text-base text-zinc-600">La date et l&apos;heure sont enregistrées.</p>
      {error && (
        <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 font-medium text-red-800">
          {error}
        </p>
      )}
      <div className="flex gap-3">
        <button type="button" className={secondaryClass} onClick={onBack} disabled={pending}>
          Retour
        </button>
        <button type="button" className={`${primaryClass} flex-1`} onClick={submit} disabled={!signature || !allChecked || pending}>
          {pending ? "Enregistrement…" : "Je signe"}
        </button>
      </div>
    </div>
  );
}
