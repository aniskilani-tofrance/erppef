"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BookUser,
  CalendarDays,
  CircleUser,
  DoorOpen,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Settings,
  Users,
  UsersRound,
  Wallet,
  Menu,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import type { AppRole } from "@/lib/auth";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ["admin", "coordinator", "trainer", "viewer"] },
  { href: "/planning", label: "Planning", icon: CalendarDays, roles: ["admin", "coordinator", "trainer", "viewer"] },
  { href: "/groupes", label: "Groupes", icon: UsersRound, roles: ["admin", "coordinator", "trainer", "viewer"] },
  { href: "/apprenants", label: "Apprenants", icon: BookUser, roles: ["admin", "coordinator"] },
  { href: "/formateurs", label: "Formateurs", icon: Users, roles: ["admin", "coordinator"] },
  { href: "/salles", label: "Salles", icon: DoorOpen, roles: ["admin", "coordinator"] },
  { href: "/examens", label: "Examens", icon: GraduationCap, roles: ["admin", "coordinator"], soon: true },
  { href: "/finance", label: "Finance", icon: Wallet, roles: ["admin", "coordinator"], soon: true },
  { href: "/parametres", label: "Paramètres", icon: Settings, roles: ["admin"] },
] as const;

export function AppSidebar({ role, orgName }: { role: AppRole; orgName: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  async function logout() {
    await createClient().auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const items = NAV.filter((item) => (item.roles as readonly string[]).includes(role));

  const footer = (
    <div className="space-y-1 border-t p-3">
      <Button asChild variant="ghost" size="sm" className="w-full justify-start gap-2">
        <Link href="/compte" onClick={() => setOpen(false)}>
          <CircleUser className="h-4 w-4" />
          Mon compte
        </Link>
      </Button>
      <Button variant="ghost" size="sm" className="w-full justify-start gap-2" onClick={logout}>
        <LogOut className="h-4 w-4" />
        Déconnexion
      </Button>
    </div>
  );

  const nav = (
    <nav className="flex flex-1 flex-col gap-1 p-3">
      {items.map((item) => {
        const active = pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={"soon" in item && item.soon ? "#" : item.href}
            onClick={() => setOpen(false)}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
              "soon" in item && item.soon && "cursor-not-allowed opacity-50",
            )}
          >
            <item.icon className="h-4 w-4" />
            {item.label}
            {"soon" in item && item.soon && (
              <span className="ml-auto text-[10px] uppercase tracking-wide">V2</span>
            )}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <>
      {/* Mobile : barre supérieure + tiroir */}
      <div className="fixed inset-x-0 top-0 z-40 flex items-center gap-2 border-b bg-background p-2 md:hidden">
        <Button variant="ghost" size="icon" onClick={() => setOpen(!open)}>
          <Menu className="h-5 w-5" />
        </Button>
        <span className="text-sm font-semibold">{orgName}</span>
      </div>
      {open && (
        <div className="fixed inset-0 z-30 flex flex-col bg-background pt-12 md:hidden">
          {nav}
          {footer}
        </div>
      )}

      {/* Desktop */}
      <aside className="sticky top-0 hidden h-screen w-56 flex-col border-r bg-background md:flex">
        <div className="flex items-center gap-3 border-b p-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- asset statique */}
          <img src="/logo-pef.png" alt="ParlerEmploi Formation" className="h-10 w-auto" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{orgName}</p>
            <p className="text-xs capitalize text-muted-foreground">{roleLabel(role)}</p>
          </div>
        </div>
        {nav}
        {footer}
      </aside>
      {/* Décalage du contenu sous la barre mobile */}
      <div className="h-12 md:hidden" />
    </>
  );
}

function roleLabel(role: AppRole): string {
  return {
    admin: "Administrateur",
    coordinator: "Coordinateur pédagogique",
    trainer: "Formateur",
    viewer: "Lecture seule",
  }[role];
}
