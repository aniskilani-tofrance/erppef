import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatPhone } from "@/lib/admission/phone";
import type { WhatsAppRoster } from "@/lib/groupes/whatsapp-group";
import { WhatsAppGroupActions } from "@/components/groupes/whatsapp-group-actions";

// Groupe WhatsApp de la classe : lien + QR code à montrer en cours, et qui ajouter /
// retirer d'après l'inscription et le consentement de chacun. L'ERP ne peut pas écrire
// dans un groupe WhatsApp : ici on prépare, l'envoi se fait depuis le téléphone.
export function WhatsAppGroupCard({ url, qrDataUrl, roster, canWrite }: { url: string | null; qrDataUrl: string | null; roster: WhatsAppRoster; canWrite: boolean }) {
  const total = roster.toAdd.length + roster.refused.length + roster.notAsked.length;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Groupe WhatsApp de la classe</CardTitle>
        <p className="text-sm text-muted-foreground">
          Pour le collectif (rappels, salle, consignes). Tout ce qui est individuel (absence, place, convocation) reste en message privé, tracé dans le carnet.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {!url ? (
          <p className="text-sm text-muted-foreground">
            Pas encore de lien. Dans WhatsApp, ouvrez le groupe de cette classe (Communauté de l&apos;organisme) → Infos du groupe → « Inviter via un lien » → copier, puis collez-le
            {canWrite ? " via « Modifier » en haut de la page." : " (coordination)."}
          </p>
        ) : (
          <div className="flex flex-wrap items-start gap-4">
            {qrDataUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qrDataUrl} alt="QR code d'invitation au groupe WhatsApp" className="h-28 w-28 rounded border bg-white" />
            )}
            <div className="min-w-0 flex-1 space-y-2 text-sm">
              <p className="break-all font-mono text-xs text-muted-foreground">{url}</p>
              <WhatsAppGroupActions url={url} />
              <p className="text-xs text-muted-foreground">Montrez le QR code au premier cours : chaque personne rejoint elle-même. Le lien est aussi dans le message « Planning » envoyé aux inscrits qui n&apos;ont pas refusé.</p>
            </div>
          </div>
        )}

        {total + roster.toRemove.length > 0 && (
          <div className="grid gap-3 text-sm sm:grid-cols-2">
            <RosterBlock title="À ajouter" hint="inscrits qui ont accepté" items={roster.toAdd} tone="ok" showPhone />
            <RosterBlock title="À retirer du groupe" hint="partis du groupe (abandon, terminé)" items={roster.toRemove} tone="warn" />
            <RosterBlock title="Pas encore demandé" hint="la question est sur la fiche apprenant, bloc « Parcours d'admission »" items={roster.notAsked} tone="muted" />
            <RosterBlock title="Ont refusé" hint="jamais ajoutés, on les prévient en privé" items={roster.refused} tone="muted" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RosterBlock({ title, hint, items, tone, showPhone = false }: { title: string; hint: string; items: WhatsAppRoster["toAdd"]; tone: "ok" | "warn" | "muted"; showPhone?: boolean }) {
  if (!items.length) return null;
  const cls = tone === "ok" ? "border-emerald-300 bg-emerald-50 text-emerald-800" : tone === "warn" ? "border-amber-300 bg-amber-50 text-amber-800" : "";
  return (
    <div className="rounded-md border p-3">
      <p className="mb-1 flex items-center gap-2 font-medium">
        {title}
        <Badge variant="outline" className={cls}>{items.length}</Badge>
      </p>
      <p className="mb-2 text-xs text-muted-foreground">{hint}</p>
      <ul className="space-y-0.5">
        {items.map((m) => (
          <li key={m.learnerId} className="flex flex-wrap items-center gap-x-2">
            <span>{m.name}</span>
            {showPhone && m.phone && <span className="text-xs text-muted-foreground">{formatPhone(m.phone)}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
