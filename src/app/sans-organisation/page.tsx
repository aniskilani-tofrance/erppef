export default function NoOrgPage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">Compte sans organisation</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Votre compte n&apos;est rattaché à aucune organisation. Demandez à un
          administrateur de vous inviter, puis déconnectez-vous et reconnectez-vous.
        </p>
      </div>
    </div>
  );
}
