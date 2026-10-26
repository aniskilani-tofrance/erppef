"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, CloudUpload, Copy, FileDown, RefreshCw } from "lucide-react";
import {
  closeAttendanceSheet,
  depositSheetToDrive,
  excuseClosedAbsence,
  openAttendanceSheet,
  reopenAttendanceSheet,
  setAttendanceStatus,
} from "@/app/(app)/seances/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SignaturePad } from "./signature-pad";
import { ExcuseEditor, EXCUSE_BUTTON_CLASS } from "./excuse-editor";
import { ATTENDANCE_STATUS_LABELS, EXCUSE_UNAVAILABLE, type AttendanceStatus } from "@/lib/attendance-status";

export type LearnerRow = {
  id: string;
  name: string;
  status: AttendanceStatus | null;
  signedAt: string | null;
  hasSignature: boolean;
  excuseReason?: string | null; // motif de l'absence excusée (facultatif)
  excuseTrace?: string | null; // « excusé le 26/10 par Nadia »
};

const STATUS_VARIANTS: Record<AttendanceStatus, { variant: "default" | "secondary" | "outline" | "destructive"; className?: string }> = {
  present: { variant: "default" },
  retard: { variant: "secondary" },
  absent: { variant: "destructive" },
  // Bleu : une absence prévenue n'est pas une alerte (pas le rouge de l'absence)
  excuse: { variant: "outline", className: "border-sky-300 bg-sky-50 text-sky-800" },
};

export function AttendanceManager({
  sessionId,
  learners,
  isOpen,
  closedAt,
  trainerSignature,
  canReopen,
  canExcuseClosed = false,
  excuseAvailable = true,
  publicUrl,
  qrDataUrl,
}: {
  sessionId: string;
  learners: LearnerRow[];
  isOpen: boolean;
  closedAt: string | null;
  trainerSignature: string | null;
  canReopen: boolean;
  canExcuseClosed?: boolean; // admin et coordination : excuser une absence après la clôture
  excuseAvailable?: boolean; // false tant que la base n'a pas le statut « Excusé »
  publicUrl: string | null;
  qrDataUrl: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [closing, setClosing] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);
  const [driveLink, setDriveLink] = useState<string | null>(null);
  // Ligne dont on saisit le motif d'excuse (un seul champ ouvert à la fois)
  const [excusing, setExcusing] = useState<string | null>(null);

  function startExcuse(learnerId: string) {
    if (!excuseAvailable) {
      toast.error(EXCUSE_UNAVAILABLE);
      return;
    }
    setExcusing(learnerId);
  }

  function saveExcuse(l: LearnerRow, reason: string) {
    const action = closedAt
      ? () => excuseClosedAbsence({ sessionId, learnerId: l.id, excused: true, reason })
      : () => setAttendanceStatus({ sessionId, learnerId: l.id, status: "excuse", excuseReason: reason });
    run(action, `${l.name} : absence excusée.`, () => setExcusing(null));
  }

  function deposit() {
    startTransition(async () => {
      const result = await depositSheetToDrive(sessionId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setDriveLink(result.link);
      toast.success("Feuille déposée sur le Drive.");
    });
  }

  // Les signatures arrivent depuis la tablette : on rafraîchit la liste régulièrement.
  useEffect(() => {
    if (!isOpen) return;
    const timer = setInterval(() => router.refresh(), 10_000);
    return () => clearInterval(timer);
  }, [isOpen, router]);

  function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>, success?: string, after?: () => void) {
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      if (success) toast.success(success);
      after?.();
      router.refresh();
    });
  }

  const signedCount = learners.filter((l) => l.signedAt).length;
  const missing = learners.filter((l) => !l.signedAt && !l.status);

  if (!isOpen && !closedAt) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <p className="text-sm text-muted-foreground">
            La feuille n&apos;est pas encore ouverte. Ouvrez-la puis faites circuler la tablette
            (ou scannez le QR code avec elle).
          </p>
          <Button onClick={() => run(() => openAttendanceSheet(sessionId))} disabled={pending}>
            {pending ? "Ouverture…" : "Ouvrir l'émargement"}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {isOpen && qrDataUrl && publicUrl && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Feuille ouverte — à scanner avec la tablette</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-6">
            {/* eslint-disable-next-line @next/next/no-img-element -- data URL locale */}
            <img src={qrDataUrl} alt="QR code d'émargement" className="h-40 w-40 rounded-md border" />
            <div className="min-w-0 flex-1 space-y-2">
              <p className="break-all font-mono text-xs text-muted-foreground">{publicUrl}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(publicUrl);
                  toast.success("Lien copié.");
                }}
              >
                <Copy className="mr-2 h-3.5 w-3.5" />
                Copier le lien
              </Button>
              <p className="text-xs text-muted-foreground">
                Le lien reste valable jusqu&apos;à la clôture (au plus tard 24 h après la fin de séance).
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">
            Présences ({signedCount} signature{signedCount > 1 ? "s" : ""} / {learners.length})
          </CardTitle>
          {isOpen && (
            <Button variant="ghost" size="sm" onClick={() => router.refresh()}>
              <RefreshCw className="mr-2 h-3.5 w-3.5" />
              Actualiser
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {learners.length === 0 && (
              <li className="text-sm text-muted-foreground">Aucun apprenant inscrit à ce groupe.</li>
            )}
            {learners.map((l) => (
              <li key={l.id} className="rounded-md border px-3 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{l.name}</span>
                  {l.signedAt && (
                    <span className="inline-flex items-center gap-1 text-xs text-green-700">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      signé à {new Date(l.signedAt).toLocaleTimeString("fr-FR", {
                        hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris",
                      })}
                    </span>
                  )}
                  {l.status && (
                    <Badge
                      variant={STATUS_VARIANTS[l.status]?.variant ?? "outline"}
                      className={STATUS_VARIANTS[l.status]?.className}
                      title={l.status === "excuse" && l.excuseReason ? `Motif : ${l.excuseReason}` : undefined}
                    >
                      {ATTENDANCE_STATUS_LABELS[l.status] ?? l.status}
                    </Badge>
                  )}
                  {!closedAt && (
                    <span className="ml-auto flex flex-wrap gap-1">
                      {!l.signedAt && (
                        <Button
                          variant="outline" size="sm" disabled={pending}
                          onClick={() => run(() => setAttendanceStatus({ sessionId, learnerId: l.id, status: "present" }))}
                        >
                          Présent
                        </Button>
                      )}
                      <Button
                        variant="outline" size="sm" disabled={pending}
                        onClick={() => run(() => setAttendanceStatus({ sessionId, learnerId: l.id, status: "retard" }))}
                      >
                        Retard
                      </Button>
                      <Button
                        variant="outline" size="sm" disabled={pending}
                        className="text-destructive"
                        onClick={() => run(() => setAttendanceStatus({ sessionId, learnerId: l.id, status: "absent" }), l.hasSignature ? "Signature effacée, apprenant marqué absent." : undefined)}
                      >
                        Absent
                      </Button>
                      {!l.signedAt && (
                        <Button
                          variant="outline" size="sm" disabled={pending}
                          className={EXCUSE_BUTTON_CLASS}
                          title="Absence prévenue (rendez-vous, enfant malade…) : pas de relance"
                          onClick={() => startExcuse(l.id)}
                        >
                          Excusé
                        </Button>
                      )}
                    </span>
                  )}
                  {closedAt && canExcuseClosed && l.status === "absent" && excusing !== l.id && (
                    <span className="ml-auto">
                      <Button
                        variant="outline" size="sm" disabled={pending}
                        className={EXCUSE_BUTTON_CLASS}
                        title="La personne avait prévenu : l'absence devient justifiée, sans rouvrir la feuille"
                        onClick={() => startExcuse(l.id)}
                      >
                        Excuser
                      </Button>
                    </span>
                  )}
                  {closedAt && canExcuseClosed && l.status === "excuse" && excusing !== l.id && (
                    <span className="ml-auto flex flex-wrap gap-1">
                      <Button variant="ghost" size="sm" disabled={pending} onClick={() => startExcuse(l.id)}>
                        Modifier le motif
                      </Button>
                      <Button
                        variant="ghost" size="sm" disabled={pending}
                        className="text-destructive"
                        onClick={() => run(() => excuseClosedAbsence({ sessionId, learnerId: l.id, excused: false }), `${l.name} : remis(e) « Absent ».`)}
                      >
                        Remettre « Absent »
                      </Button>
                    </span>
                  )}
                </div>
                {l.status === "excuse" && (l.excuseReason || l.excuseTrace) && excusing !== l.id && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {l.excuseReason && <span>Motif : {l.excuseReason}</span>}
                    {l.excuseReason && l.excuseTrace && " · "}
                    {l.excuseTrace && <span>{l.excuseTrace}</span>}
                  </p>
                )}
                {excusing === l.id && (
                  <ExcuseEditor
                    initialReason={l.status === "excuse" ? (l.excuseReason ?? "") : ""}
                    pending={pending}
                    onSave={(reason) => saveExcuse(l, reason)}
                    onCancel={() => setExcusing(null)}
                  />
                )}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {isOpen && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Clôturer la feuille</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!closing ? (
              <>
                <p className="text-sm text-muted-foreground">
                  {missing.length > 0
                    ? `${missing.length} apprenant${missing.length > 1 ? "s" : ""} sans signature ni statut ser${missing.length > 1 ? "ont" : "a"} marqué${missing.length > 1 ? "s" : ""} absent${missing.length > 1 ? "s" : ""} à la clôture.`
                    : "Tous les apprenants ont une signature ou un statut."}
                </p>
                <Button onClick={() => setClosing(true)}>Contre-signer et clôturer</Button>
              </>
            ) : (
              <>
                <p className="text-sm">Signature du formateur :</p>
                <SignaturePad onChange={setSignature} height={140} />
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => { setClosing(false); setSignature(null); }} disabled={pending}>
                    Retour
                  </Button>
                  <Button
                    disabled={pending || !signature}
                    onClick={() =>
                      run(
                        () => closeAttendanceSheet({ sessionId, trainerSignature: signature! }),
                        "Feuille d'émargement clôturée.",
                      )
                    }
                  >
                    {pending ? "Clôture…" : "Clôturer définitivement"}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {closedAt && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Feuille clôturée</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Clôturée le{" "}
              {new Date(closedAt).toLocaleDateString("fr-FR", {
                day: "numeric", month: "long", year: "numeric",
                hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris",
              })}
              .
            </p>
            {trainerSignature && (
              <div>
                <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Signature du formateur</p>
                {/* eslint-disable-next-line @next/next/no-img-element -- data URL locale */}
                <img src={trainerSignature} alt="Signature du formateur" className="h-20 rounded-md border bg-white" />
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <Button asChild variant="outline">
                <a href={`/seances/${sessionId}/emargement/pdf`}>
                  <FileDown className="mr-2 h-4 w-4" />
                  Télécharger le PDF
                </a>
              </Button>
              <Button onClick={deposit} disabled={pending}>
                <CloudUpload className="mr-2 h-4 w-4" />
                {pending ? "Dépôt…" : "Déposer sur le Drive"}
              </Button>
              {canReopen && (
                <Button
                  variant="ghost"
                  disabled={pending}
                  onClick={() => run(() => reopenAttendanceSheet(sessionId), "Feuille rouverte : nouveau lien généré.")}
                >
                  Rouvrir pour correction
                </Button>
              )}
            </div>
            {driveLink && (
              <a href={driveLink} target="_blank" rel="noreferrer" className="block text-sm text-muted-foreground hover:underline">
                Voir le fichier sur le Drive →
              </a>
            )}
            <p className="text-xs text-muted-foreground">
              {canExcuseClosed
                ? "Une personne avait prévenu de son absence ? « Excuser » sur sa ligne : l'absence devient justifiée, sans rouvrir la feuille. Une présence ne se change qu'en rouvrant la feuille."
                : "Une personne avait prévenu de son absence ? La coordination peut l'excuser sans rouvrir la feuille."}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
