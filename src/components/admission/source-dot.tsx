import { sourceStyle, sourceTitle } from "@/lib/admission/sources";
import { cn } from "@/lib/utils";

// Pastille de provenance (« Nous a contactés par ») : couleur fixe par canal, libellé au
// survol et pour les lecteurs d'écran. Composant serveur, sans état.
export function SourceDot({
  code,
  detail,
  className,
  size = "md",
}: {
  code: string | null | undefined;
  detail?: string | null;
  className?: string;
  size?: "sm" | "md";
}) {
  const style = sourceStyle(code);
  const title = sourceTitle(code, detail);
  return (
    <span
      role="img"
      aria-label={title}
      title={title}
      className={cn("inline-block shrink-0 rounded-full", size === "sm" ? "h-2 w-2" : "h-2.5 w-2.5", className)}
      style={style.hollow ? { border: `2px solid ${style.color}` } : { backgroundColor: style.color }}
    />
  );
}

/** Pastille + libellé, pour les légendes et les listes déroulantes. */
export function SourceChip({ code, className }: { code: string | null | undefined; className?: string }) {
  const style = sourceStyle(code);
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <SourceDot code={code} />
      <span className={style.hollow ? "text-muted-foreground" : undefined}>{style.label}</span>
    </span>
  );
}
