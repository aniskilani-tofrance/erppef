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
  const isReset = searchParams.get("mode") === "reset";
  const [ready, setReady] = useState<"loading" | "ok" | "invalid">("loading");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const supabase = createClient();
    const code = searchParams.get("code");
    const tokenHash = searchParams.get("token_hash");
    const otpType = searchParams.get("type"); // recovery | invite (templates personnalisés)
    let settled = false;
    const settle = (state: "ok" | "invalid") => {
      if (!settled) {
        settled = true;
        setReady(state);
      }
    };

    // La session peut arriver de façon asynchrone (fragment #access_token consommé
    // par le client) : on écoute plutôt que de vérifier une seule fois.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) settle("ok");
    });

    (async () => {
      // Lien robuste (templates personnalisés) : marche quel que soit le navigateur.
      if (tokenHash) {
        const { error } = await supabase.auth.verifyOtp({
          type: otpType === "invite" ? "invite" : "recovery",
          token_hash: tokenHash,
        });
        settle(error ? "invalid" : "ok");
        return;
      }
      // Flux PKCE : nécessite le même navigateur que la demande.
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        settle(error ? "invalid" : "ok");
        return;
      }
      // Flux à fragment : laisser le temps au client de le consommer.
      for (let i = 0; i < 10 && !settled; i++) {
        const { data } = await supabase.auth.getSession();
        if (data.session) {
          settle("ok");
          return;
        }
        await new Promise((r) => setTimeout(r, 300));
      }
      settle("invalid");
    })();

    return () => sub.subscription.unsubscribe();
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
          <h1 className="text-2xl font-semibold tracking-tight">
            {isReset ? "Réinitialisation" : "Bienvenue !"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isReset
              ? "Choisissez un nouveau mot de passe pour votre compte."
              : "Choisissez votre mot de passe pour accéder à l'ERP ParlerEmploi Formation."}
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
                {isReset
                  ? "Lien invalide ou expiré. Refaites une demande depuis « Mot de passe oublié »."
                  : "Lien d'invitation invalide ou expiré. Demandez à votre administrateur de renvoyer l'invitation."}
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
