import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isDenied, moduleOfPath } from "@/lib/modules";
import { stagiairePathAllowed } from "@/lib/stagiaire-paths";

// Rafraîchit la session Supabase (cookies) et redirige les non-connectés vers /login.
// La vraie protection (rôles, org) vit dans les layouts et les Server Actions (requireRole).
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isAuthRoute =
    request.nextUrl.pathname.startsWith("/login") ||
    request.nextUrl.pathname.startsWith("/auth") ||
    // Page de signature publique : le token d'émargement est le secret, pas de compte.
    request.nextUrl.pathname.startsWith("/emargement") ||
    // Enquête de satisfaction anonyme : même principe.
    request.nextUrl.pathname.startsWith("/enquete") ||
    // Test de positionnement : lien personnel à jeton.
    request.nextUrl.pathname.startsWith("/test") ||
    // Adhésion, contrat, règlement : lien personnel à jeton (WhatsApp ou tablette).
    request.nextUrl.pathname.startsWith("/signer/") ||
    // Inscription rapide (lien envoyé sur WhatsApp) : formulaire public, sans compte.
    request.nextUrl.pathname === "/inscription" ||
    request.nextUrl.pathname.startsWith("/inscription/") ||
    // Contacts d'un groupe (.vcf) ouverts sur le téléphone : jeton à usage unique, 15 min.
    request.nextUrl.pathname.startsWith("/vcf/") ||
    // Crons Vercel : protégés par CRON_SECRET dans la route elle-même.
    request.nextUrl.pathname.startsWith("/api/cron") ||
    // Webhook des leads restaurateurs (Brevo, Make/Meta, Calendly) : jeton d'organisation dans la route.
    request.nextUrl.pathname.startsWith("/api/leads/inbound") ||
    // Webhook lemlist (prospection sortante) : secret LEMLIST_WEBHOOK_SECRET vérifié dans la route.
    request.nextUrl.pathname === "/api/prospection/lemlist" ||
    request.nextUrl.pathname === "/api/leads/lemlist-webhook" ||
    // API Leads (agents du QG, imports) : jeton de service Bearer PEF_LEADS_API_TOKEN vérifié dans chaque route.
    request.nextUrl.pathname === "/api/leads" ||
    request.nextUrl.pathname === "/api/leads/import" ||
    // API de veille Qualiopi (collecteur Manus) : jeton de service Bearer vérifié dans chaque route.
    request.nextUrl.pathname.startsWith("/api/veille") ||
    // API du collecteur de veille des financements : même jeton de service, vérifié dans la route.
    request.nextUrl.pathname.startsWith("/api/financements/opportunites");

  if (!user && !isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Stagiaire : seulement ses pages (groupes, planning, émargement, formation, aide).
  // Les pages publiques (/emargement, /enquete, /test, /inscription) restent hors de ce contrôle.
  if (user && !isAuthRoute && request.method === "GET") {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (jwtRole(session?.access_token) === "stagiaire" && !stagiairePathAllowed(request.nextUrl.pathname)) {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  // Module retiré à cette personne (Paramètres → Utilisateurs) : ses pages, ses exports et
  // les actions lancées depuis ses pages sont refusés. La base refuse aussi (migration 0062).
  const moduleKey = user && !isAuthRoute ? moduleOfPath(request.nextUrl.pathname) : null;
  if (user && moduleKey) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const orgId = jwtClaim(session?.access_token, "org_id");
    if (orgId) {
      const { data: membership } = await supabase.from("memberships").select("denied_modules").eq("user_id", user.id).eq("org_id", orgId).maybeSingle();
      if (isDenied(membership?.denied_modules as string[] | null | undefined, moduleKey)) {
        if (request.method !== "GET") return new NextResponse("Accès refusé à ce module.", { status: 403 });
        const url = request.nextUrl.clone();
        url.pathname = "/dashboard";
        url.search = "";
        return NextResponse.redirect(url);
      }
    }
  }

  return response;
}

function jwtClaim(token: string | undefined, key: "app_role" | "org_id"): string | null {
  if (!token) return null;
  try {
    const payload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return (JSON.parse(atob(payload)) as Record<string, string | undefined>)[key] ?? null;
  } catch {
    return null;
  }
}

function jwtRole(token: string | undefined): string | null {
  return jwtClaim(token, "app_role");
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mp3|ico)$).*)"],
};
