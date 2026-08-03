import { fetchTest } from "./actions";
import { TestPlayer } from "@/components/placement/test-player";

export const metadata = { title: "Test de positionnement — PEF" };

// Page publique du test de positionnement (lien personnel de l'apprenant).
export default async function TestPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const test = await fetchTest(token);

  if (!test) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-2 p-6 text-center">
        <h1 className="text-xl font-semibold">Lien invalide</h1>
        <p className="text-sm text-muted-foreground">
          Ce lien de test n&apos;est pas reconnu. Rapprochez-vous de votre centre de formation.
        </p>
      </main>
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
