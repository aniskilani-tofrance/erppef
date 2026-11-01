"use client";

import { useState, useTransition } from "react";
import { signDocuments, type SigningPage } from "@/app/signer/[token]/actions";
import { SignaturePad } from "@/components/emargement/signature-pad";
import { DOCUMENT_LABELS, type SignedDocumentKind } from "@/lib/documents-apprenant/regles";
import { DocumentReader } from "./document-reader";
import { primaryClass, secondaryClass, titleClass } from "./signing-shell";

type Page = Extract<SigningPage, { ok: true }>;

const dayFr = (d: string) =>
  new Date(`${d.slice(0, 10)}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Paris" });

// Parcours de signature, un écran à la fois : bonjour → chaque document (lire, cocher
// « J'ai lu ») → une signature au doigt → c'est signé. Le serveur refait tous les contrôles.
export function SigningFlow({ token, page }: { token: string; page: Page }) {
  const total = page.texts.length;
  const [step, setStep] = useState(-1); // -1 : accueil ; 0..total-1 : documents ; total : signature
  const [accepted, setAccepted] = useState<Set<SignedDocumentKind>>(new Set());
  const [signature, setSignature] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<SignedDocumentKind[] | null>(null);
  const [pending, startTransition] = useTransition();

  const go = (n: number) => {
    setStep(n);
    setError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (done || total === 0) {
    const copies = done ? [...page.signedKinds, ...done] : page.signedKinds;
    return (
      <div className="space-y-5 text-center">
        <p aria-hidden className="text-5xl">✅</p>
        <h1 className={titleClass}>{done ? "C'est signé. Merci" : "Tout est déjà signé"}{page.firstName ? ` ${page.firstName}` : ""} !</h1>
        <p>L&apos;association garde une copie de chaque document dans votre dossier.</p>
        {page.channel === "sur_place" ? (
          <p className="rounded-2xl bg-[#E8F6F0] px-4 py-3 text-xl font-semibold text-[#00504E]">Rendez la tablette à l&apos;équipe.</p>
        ) : copies.length ? (
          <div className="space-y-2 text-start">
            <p className="font-semibold">Votre copie (PDF) :</p>
            <ul className="space-y-2">
              {copies.map((k) => (
                <li key={k}>
                  <a className="text-[#00504E] underline underline-offset-4" href={`/signer/${token}/copie/${k}`} target="_blank" rel="noreferrer">
                    {DOCUMENT_LABELS[k]}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <p className="text-base text-zinc-600">Une question ? Écrivez à l&apos;équipe sur WhatsApp.</p>
      </div>
    );
  }

  if (step === -1) {
    return (
      <div className="space-y-6">
        <div className="space-y-3">
          <h1 className={titleClass}>Bonjour{page.firstName ? ` ${page.firstName}` : ""} 👋</h1>
          <p>
            Pour le groupe <strong>{page.groupName}</strong>, vous devez lire et signer {total === 1 ? "un document" : `${total} documents`} :
          </p>
          <ol className="space-y-2">
            {page.texts.map((t, i) => (
              <li key={t.kind} className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 ring-1 ring-zinc-200">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#00504E] font-bold text-white">{i + 1}</span>
                <span className="font-semibold">{DOCUMENT_LABELS[t.kind]}</span>
              </li>
            ))}
          </ol>
          <p>Lisez bien. À la fin, vous signez avec votre doigt. C&apos;est rapide : 5 minutes.</p>
        </div>
        <button type="button" className={`${primaryClass} w-full`} onClick={() => go(0)}>
          Commencer
        </button>
      </div>
    );
  }

  if (step < total) {
    const t = page.texts[step];
    const ok = accepted.has(t.kind);
    return (
      <div className="space-y-6">
        <DocumentReader text={t} step={step + 1} total={total} />
        <label className="flex cursor-pointer items-start gap-4 rounded-2xl border-2 border-zinc-200 bg-white p-4 text-lg font-medium has-[:checked]:border-[#00504E] has-[:checked]:bg-[#E8F6F0]">
          <input
            type="checkbox"
            className="mt-1 size-7 shrink-0 accent-[#00504E]"
            checked={ok}
            onChange={(e) =>
              setAccepted((prev) => {
                const n = new Set(prev);
                if (e.target.checked) n.add(t.kind);
                else n.delete(t.kind);
                return n;
              })
            }
          />
          <span>{t.acceptLabel}</span>
        </label>
        <div className="flex gap-3">
          <button type="button" className={secondaryClass} onClick={() => go(step - 1)}>
            Retour
          </button>
          <button type="button" className={`${primaryClass} flex-1`} disabled={!ok} onClick={() => go(step + 1)}>
            {step + 1 < total ? "Document suivant" : "Signer"}
          </button>
        </div>
      </div>
    );
  }

  const submit = () => {
    if (!signature) return;
    startTransition(async () => {
      const res = await signDocuments({ token, accepted: [...accepted], signature });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setDone(res.signed);
      window.scrollTo({ top: 0 });
    });
  };

  return (
    <div className="space-y-5">
      <h1 className={titleClass}>Votre signature</h1>
      <ul className="space-y-1">
        {page.texts.map((t) => (
          <li key={t.kind} className="flex gap-2">
            <span aria-hidden className="text-[#00504E]">✓</span>
            <span>
              J&apos;ai lu et j&apos;accepte : {DOCUMENT_LABELS[t.kind].toLowerCase()}
            </span>
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
      <p className="text-base text-zinc-600">{page.fullName} · la date et l&apos;heure sont enregistrées.</p>
      {error && (
        <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 font-medium text-red-800">
          {error}
        </p>
      )}
      <div className="flex gap-3">
        <button type="button" className={secondaryClass} onClick={() => go(total - 1)} disabled={pending}>
          Retour
        </button>
        <button type="button" className={`${primaryClass} flex-1`} onClick={submit} disabled={!signature || pending}>
          {pending ? "Enregistrement…" : "Je signe"}
        </button>
      </div>
    </div>
  );
}
