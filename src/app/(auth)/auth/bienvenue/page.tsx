"use client";

import { Suspense, useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Atterrissage du lien d'invitation : l'utilisateur définit son mot de passe.
export default function BienvenuePage() {
  return (
    <Suspense>
      <BienvenueInner />
    </Suspense>
  );
}

function BienvenueInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [ready, setReady] = useState<"loading" | "ok" | "invalid">("loading");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const supabase = createClient();
    const code = searchParams.get("code");
    (async () => {
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        setReady(error ? "invalid" : "ok");
        return;
      }
      // Flux à fragment (#access_token…) : le client le consomme automatiquement.
      const { data } = await supabase.auth.getSession();
      setReady(data.session ? "ok" : "invalid");
    })();
  }, [searchParams]);

  function submit() {
    if (password.length < 8) {
      setError("Le mot de passe doit faire au moins 8 caractères.");
      return;
    }
    if (password !== confirm) {
      setError("Les deux mots de passe ne correspondent pas.");
      return;
    }
    startTransition(async () => {
      const { error } = await createClient().auth.updateUser({ password });
      if (error) {
        setError(error.message);
        return;
      }
      router.push("/dashboard");
      router.refresh();
    });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element -- asset statique */}
          <img src="/logo-pef.png" alt="" className="mx-auto mb-4 h-20 w-auto" />
          <h1 className="text-2xl font-semibold tracking-tight">Bienvenue !</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Choisissez votre mot de passe pour accéder à l&apos;ERP ParlerEmploi Formation.
          </p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Définir mon mot de passe</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {ready === "loading" && <p className="text-sm text-muted-foreground">Vérification du lien…</p>}
            {ready === "invalid" && (
              <p className="text-sm text-destructive">
                Lien d&apos;invitation invalide ou expiré. Demandez à votre administrateur de
                renvoyer l&apos;invitation.
              </p>
            )}
            {ready === "ok" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="pw">Mot de passe (8 caractères minimum)</Label>
                  <Input id="pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pw2">Confirmez le mot de passe</Label>
                  <Input id="pw2" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
                <Button className="w-full" onClick={submit} disabled={pending || !password || !confirm}>
                  {pending ? "Enregistrement…" : "Accéder à l'ERP"}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
