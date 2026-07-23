import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element -- asset statique */}
          <img src="/logo-pef.png" alt="" className="mx-auto mb-4 h-20 w-auto" />
          <h1 className="text-2xl font-semibold tracking-tight">ParlerEmploi Formation</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Pilotage de l&apos;organisme de formation
          </p>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}
