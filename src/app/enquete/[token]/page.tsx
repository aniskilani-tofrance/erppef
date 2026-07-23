import { fetchSurvey } from "./actions";
import { SurveyForm } from "@/components/enquete/survey-form";

export const metadata = { title: "Votre avis — PEF" };

// Page publique et anonyme : questionnaire de satisfaction à chaud.
export default async function EnquetePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const survey = await fetchSurvey(token);

  if (!survey) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-2 p-6 text-center">
        <h1 className="text-xl font-semibold">Enquête indisponible</h1>
        <p className="text-sm text-muted-foreground">
          Ce lien est invalide ou l&apos;enquête est clôturée.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-lg space-y-6 p-4 sm:p-6">
      <header className="space-y-1 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element -- asset statique */}
        <img src="/logo-pef.png" alt="" className="mx-auto mb-2 h-16 w-auto" />
        <h1 className="text-2xl font-semibold tracking-tight">Votre avis compte</h1>
        <p className="text-sm text-muted-foreground">
          {survey.groupName}
          {survey.programName ? ` · ${survey.programName}` : ""}
        </p>
        <p className="text-sm">Questionnaire anonyme — 1 minute.</p>
      </header>
      <SurveyForm token={token} />
    </main>
  );
}
