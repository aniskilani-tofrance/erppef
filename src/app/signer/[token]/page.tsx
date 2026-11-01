import { fetchSigningPage } from "./actions";
import { SigningFlow } from "@/components/documents-apprenant/signing-flow";
import { SigningShell, SigningUnavailable } from "@/components/documents-apprenant/signing-shell";

export const metadata = { title: "Documents à signer — ParlerEmploi Formation", robots: { index: false, follow: false } };

// Page publique : lien personnel (WhatsApp) ou tablette de l'association. Bulletin
// d'adhésion, contrat de formation et règlement intérieur à lire puis signer au doigt.
export default async function SignerPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const page = await fetchSigningPage(token);
  if (!page.ok) return <SigningUnavailable message={page.error} />;
  return (
    <SigningShell>
      <SigningFlow token={token} page={page} />
    </SigningShell>
  );
}
