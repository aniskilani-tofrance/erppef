import { fetchTest } from "./actions";
import { ouvrirPositionnement } from "./positionnement-actions";
import { TestPlayer } from "@/components/placement/test-player";
import { FinTest } from "@/components/positionnement/fin";
import { PassationPositionnement } from "@/components/positionnement/passation";
import { TestShell } from "@/components/positionnement/shell";
import { langueValide } from "@/lib/positionnement/etat";

export const metadata = { title: "Test de positionnement — PEF" };

// Page publique d'un test par lien personnel. Aiguillage par purpose :
// - « positionnement » → nouvelle version (ToFrance : parcours adaptatif, oral au micro du
//   téléphone avec repli à l'écrit, fin sans niveau affiché, ?lang= pour les consignes) ;
// - « mi_parcours » / « finale » → ancien lecteur et ancienne notation, inchangés.
export default async function TestPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ lang?: string | string[] }>;
}) {
  const { token } = await params;
  const { lang } = await searchParams;
  const test = await fetchTest(token);

  if (!test) return <LienInvalide />;

  if (test.purpose === "positionnement") {
    const langue = langueValide(Array.isArray(lang) ? lang[0] : lang);
    const etape = test.status === "fait" ? null : await ouvrirPositionnement(token);
    if (test.status === "en_attente" && !etape) return <LienInvalide />;
    return (
      <TestShell>
        {etape && etape.statut === "en_cours" ? (
          <PassationPositionnement token={token} etapeInitiale={etape} langue={langue} />
        ) : (
          // « Test déjà passé » : sans niveau (la personne ne le voit pas, l'équipe oui).
          <FinTest langue={langue} prenom={test.learnerFirstName} deja />
        )}
      </TestShell>
    );
  }

  if (test.status === "fait") {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-3 p-6 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element -- asset statique */}
        <img src="/logo-pef.png" alt="" className="h-16 w-auto" />
        <h1 className="text-xl font-semibold">Test déjà passé ✓</h1>
        <p className="text-sm text-muted-foreground">
          Merci {test.learnerFirstName} ! Votre test a bien été enregistré
          {test.level ? ` (niveau ${test.level})` : ""}. Votre centre de formation
          reviendra vers vous.
        </p>
      </main>
    );
  }

  return <TestPlayer token={token} firstName={test.learnerFirstName} questions={test.questions} />;
}

function LienInvalide() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-2 p-6 text-center">
      <h1 className="text-xl font-semibold">Lien invalide</h1>
      <p className="text-sm text-muted-foreground">
        Ce lien de test n&apos;est pas reconnu. Rapprochez-vous de votre centre de formation.
      </p>
    </main>
  );
}
