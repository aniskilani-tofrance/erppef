import { fetchSheet } from "./actions";
import { SignSheet } from "@/components/emargement/sign-sheet";
import { utcToLocalTime } from "@/lib/dates";

export const metadata = { title: "Émargement — PEF" };

// Page publique tablette : accessible uniquement via le token de séance.
export default async function EmargementPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const sheet = await fetchSheet(token);

  if (!sheet) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-2 p-6 text-center">
        <h1 className="text-xl font-semibold">Émargement indisponible</h1>
        <p className="text-sm text-muted-foreground">
          Ce lien est invalide, expiré ou la feuille a été clôturée. Rapprochez-vous de votre formateur.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-2xl space-y-6 p-4 sm:p-6">
      <header className="space-y-1 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">{sheet.groupName}</h1>
        <p className="text-sm text-muted-foreground">
          {new Date(sheet.date).toLocaleDateString("fr-FR", {
            weekday: "long", day: "numeric", month: "long", year: "numeric",
            timeZone: "Europe/Paris",
          })}{" "}
          · {utcToLocalTime(sheet.startsAt)} – {utcToLocalTime(sheet.endsAt)}
        </p>
        <p className="text-sm">Touchez votre nom puis signez pour confirmer votre présence.</p>
      </header>
      <SignSheet token={token} learners={sheet.learners} />
    </main>
  );
}
