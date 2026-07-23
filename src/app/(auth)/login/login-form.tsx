"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Petit bonjour audio après connexion (fichiers générés une fois via
// scripts/generate-greetings.mjs). Déclenché par le clic : l'autoplay est autorisé,
// et l'objet Audio survit à la navigation client. Silencieux si les fichiers manquent.
function playGreeting() {
  try {
    const n = 1 + Math.floor(Math.random() * 4);
    const audio = new Audio(`/audio/greeting-${n}.mp3`);
    audio.volume = 0.6;
    audio.play().catch(() => {});
  } catch {
    // jamais bloquant pour la connexion
  }
}

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError("Identifiants incorrects.");
      setLoading(false);
      return;
    }
    playGreeting();
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Mot de passe</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Connexion…" : "Se connecter"}
          </Button>
          <p className="text-center">
            <Link href="/auth/mot-de-passe-oublie" className="text-sm text-muted-foreground hover:underline">
              Mot de passe oublié ?
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
