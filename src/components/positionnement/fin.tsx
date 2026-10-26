import { SIGNUP_CONTACT } from "@/lib/inscription/i18n";
import { Bilingue } from "./traduit";

// Fin du test (décision d'Anis du 23/10) : écran simple, SANS niveau. « Merci ! Votre test est
// enregistré. Nous vous contactons dès que possible. » + le contact de l'association
// (téléphone et WhatsApp). Le résultat détaillé n'est visible que par l'équipe, sur la fiche.
// `deja` : la personne rouvre un lien déjà utilisé (« Test déjà passé »).
export function FinTest({ langue, prenom = "", deja = false }: { langue: string; prenom?: string; deja?: boolean }) {
  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-md flex-col justify-center gap-5 px-4 py-8 text-lg">
      {/* eslint-disable-next-line @next/next/no-img-element -- asset statique, page légère */}
      <img src="/logo-pef.png" alt="ParlerEmploi Formation" className="mx-auto h-12 w-auto" />
      <div className="flex flex-col items-center gap-5 rounded-3xl bg-white p-5 text-center shadow-[0_12px_40px_-24px_rgba(0,80,78,0.45)] ring-1 ring-[#00504E]/10" role="status">
        <span aria-hidden className="grid size-20 place-items-center rounded-full bg-[#32CF8A]/20">
          <span className="grid size-14 place-items-center rounded-full bg-[#00504E] text-3xl font-bold text-white">✓</span>
        </span>
        <h1 className="text-[2rem] leading-tight font-bold text-[#00504E] [font-family:var(--font-test-title),inherit]">
          <Bilingue cle={deja ? "dejaFait" : "merci"} langue={langue} className="items-center gap-1" />
        </h1>
        <p className="text-2xl font-medium">
          <Bilingue cle={deja ? "dejaFaitTexte" : "enregistre"} langue={langue} prenom={prenom} className="items-center gap-1" />
        </p>
        <p className="text-2xl font-medium">
          <Bilingue cle="contact" langue={langue} className="items-center gap-1" />
        </p>
        <div className="mt-2 w-full space-y-3 rounded-2xl bg-[#F3FAF7] p-4 ring-1 ring-[#00504E]/10">
          <div className="space-y-0.5 text-lg">
            <p className="font-semibold text-[#00504E]">{SIGNUP_CONTACT.name}</p>
            <p dir="ltr" className="font-medium">📞 {SIGNUP_CONTACT.phone}</p>
          </div>
          <a
            href={`https://wa.me/${SIGNUP_CONTACT.whatsapp}`}
            className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#00504E] px-6 text-lg font-semibold text-white shadow-[0_10px_24px_-12px_rgba(0,80,78,0.8)] transition hover:bg-[#003D3B]"
          >
            <span aria-hidden>💬</span>
            <Bilingue cle="ecrire" langue={langue} className="items-center" />
          </a>
        </div>
      </div>
    </main>
  );
}
