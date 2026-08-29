"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BookUser, DoorOpen, Search, Users, UsersRound } from "lucide-react";
import { searchGlobal, type SearchHit } from "@/app/(app)/recherche/actions";
import {
  Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";

const KIND_LABELS = { apprenant: "Apprenants", groupe: "Groupes", formateur: "Formateurs", salle: "Salles" } as const;
const KIND_ICONS = { apprenant: BookUser, groupe: UsersRound, formateur: Users, salle: DoorOpen } as const;

// Recherche globale : ⌘K / Ctrl+K partout, ou le bouton loupe de la barre latérale.
export function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    if (query.trim().length < 2) {
      setHits([]);
      return;
    }
    setLoading(true);
    debounce.current = setTimeout(async () => {
      try {
        setHits(await searchGlobal(query));
      } finally {
        setLoading(false);
      }
    }, 250);
  }, [query]);

  function go(href: string) {
    setOpen(false);
    setQuery("");
    router.push(href);
  }

  const kinds = [...new Set(hits.map((h) => h.kind))];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        title="Recherche (⌘K)"
      >
        <Search className="h-4 w-4" />
        Rechercher…
        <kbd className="ml-auto rounded border bg-muted px-1.5 text-[10px] text-muted-foreground">⌘K</kbd>
      </button>

      <CommandDialog open={open} onOpenChange={setOpen} title="Recherche">
        {/* shouldFilter=false : le filtrage est fait côté serveur (téléphones, etc.) */}
        <Command shouldFilter={false}>
        <CommandInput
          placeholder="Apprenant, groupe, formateur, salle…"
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          <CommandEmpty>
            {query.trim().length < 2
              ? "Tapez au moins 2 caractères."
              : loading
                ? "Recherche…"
                : "Aucun résultat."}
          </CommandEmpty>
          {kinds.map((kind) => {
            const Icon = KIND_ICONS[kind];
            return (
              <CommandGroup key={kind} heading={KIND_LABELS[kind]}>
                {hits
                  .filter((h) => h.kind === kind)
                  .map((h, i) => (
                    <CommandItem key={`${kind}-${i}`} value={`${h.label}-${i}`} onSelect={() => go(h.href)}>
                      <Icon className="mr-2 h-4 w-4 text-muted-foreground" />
                      <span>{h.label}</span>
                      {h.sublabel && <span className="ml-2 text-xs text-muted-foreground">{h.sublabel}</span>}
                    </CommandItem>
                  ))}
              </CommandGroup>
            );
          })}
        </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
