"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function MotDePasseOubliePage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    // Toujours afficher le même message, que le compte existe ou non
    // (ne pas révéler quels emails ont un compte).
    await createClient().auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/bienvenue?mode=reset`,
    });
    setSent(true);
    setLoading(false);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element -- asset statique */}
          <img src="/logo-pef.png" alt="" className="mx-auto mb-4 h-20 w-auto" />
          <h1 className="text-2xl font-semibold tracking-tight">Mot de passe oublié</h1>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Réinitialiser mon mot de passe</CardTitle>
          </CardHeader>
          <CardContent>
            {sent ? (
              <p className="text-sm text-muted-foreground">
                Si un compte existe pour <span className="font-medium">{email}</span>, un email
                de réinitialisation vient de lui être envoyé. Pensez à vérifier les spams.
              </p>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email de votre compte</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading || !email}>
                  {loading ? "Envoi…" : "Envoyer le lien de réinitialisation"}
                </Button>
              </form>
            )}
            <p className="mt-4 text-center">
              <Link href="/login" className="text-sm text-muted-foreground hover:underline">
                ← Retour à la connexion
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
