import { fetchClassSheet } from "./actions";
import { ClassSigning } from "@/components/documents-apprenant/class-signing";
import { SigningShell, SigningUnavailable } from "@/components/documents-apprenant/signing-shell";

export const metadata = { title: "Documents à signer en classe — ParlerEmploi Formation", robots: { index: false, follow: false } };

// Page publique qui circule en classe, comme la feuille d'émargement (même jeton) : bulletin
// d'adhésion, contrat de formation et règlement intérieur, lus en classe, signés au doigt.
export default async function ClassSigningPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const sheet = await fetchClassSheet(token);
  if (!sheet.ok) return <SigningUnavailable message={sheet.error} />;
  return (
    <SigningShell>
      <ClassSigning token={token} sheet={sheet} />
    </SigningShell>
  );
}
