import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { AdmissionBadge } from "@/components/admission/admission-badge";
import { InvitationActions } from "@/components/admission/invitation-actions";
import { InviteLearnersDialog, type Candidate } from "@/components/admission/invite-learners-dialog";
import { MeetingFormDialog } from "@/components/admission/meeting-form-dialog";
import { OralTestDialog } from "@/components/admission/oral-test-dialog";
import { SendPendingEmailsButton } from "@/components/admission/send-pending-emails-button";
import {
  buildMeetingInvitationMessage,
  buildMeetingReminderMessage,
  formatMeetingWhen,
} from "@/lib/admission/messages";
import { formatPhone } from "@/lib/admission/phone";
import { invitationBadgeClass, invitationLabel } from "@/lib/admission/status";
import { utcToLocalDate, utcToLocalTime } from "@/lib/dates";
import { learnerRef } from "@/lib/refs";

// Page d'une réunion d'information : la liste des convoqués et, pour chacun, l'envoi
// WhatsApp en un clic, la confirmation, la présence et le test oral.

type InvitationRow = {
  id: string;
  status: string;
  channel: string | null;
  sent_at: string | null;
  learners: {
    id: string;
    first_name: string;
    last_name: string;
    learner_no: number | null;
    phone: string | null;
    email: string | null;
    admission_status: string;
    level_assessed: string | null;
    oral_test_on: string | null;
    oral_test_level: string | null;
    oral_test_evaluator: string | null;
    oral_test_comment: string | null;
  } | null;
};

const CANDIDATE_ORDER: Record<string, number> = {
  contacte: 0, injoignable: 1, nouveau: 2, convoque: 3, evalue: 4, sans_suite: 5, inscrit: 6,
};

export default async function MeetingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { userId } = await requireRole(["admin", "coordinator"]);
  const supabase = await createClient();

  const [{ data: meeting }, { data: invitationRows }, { data: learners }, { data: rooms }, { data: profile }] = await Promise.all([
    supabase.from("info_meetings").select("*, rooms:room_id(name)").eq("id", id).single(),
    supabase
      .from("info_meeting_invitations")
      .select("id, status, channel, sent_at, learners(id, first_name, last_name, learner_no, phone, email, admission_status, level_assessed, oral_test_on, oral_test_level, oral_test_evaluator, oral_test_comment)")
      .eq("meeting_id", id),
    supabase
      .from("learners")
      .select("id, first_name, last_name, learner_no, phone, admission_status, level_assessed")
      .order("last_name")
      .order("first_name"),
    supabase.from("rooms").select("id, name").eq("is_active", true).order("name"),
    supabase.from("profiles").select("full_name").eq("id", userId).single(),
  ]);
  if (!meeting) notFound();

  const senderFirstName = profile?.full_name?.trim().split(/\s+/)[0] ?? null;
  const roomName = (meeting.rooms as unknown as { name: string } | null)?.name ?? null;
  const place = roomName ? `${roomName}${meeting.location ? ` — ${meeting.location}` : ""}` : meeting.location;
  const when = { startsAt: meeting.starts_at as string, endsAt: meeting.ends_at as string | null, place };
  const upcoming = new Date(meeting.starts_at).getTime() >= new Date().getTime() - 6 * 3600_000;
  const meetingDay = utcToLocalDate(meeting.starts_at);

  const invitations = ((invitationRows ?? []) as unknown as InvitationRow[])
    .filter((i) => i.learners)
    .sort((a, b) => `${a.learners!.last_name} ${a.learners!.first_name}`.localeCompare(`${b.learners!.last_name} ${b.learners!.first_name}`, "fr"));
  const invitedIds = new Set(invitations.map((i) => i.learners!.id));
  const count = (codes: string[]) => invitations.filter((i) => codes.includes(i.status)).length;
  const pendingWithEmail = invitations.filter((i) => i.status === "a_envoyer" && i.learners?.email).length;

  const candidates: Candidate[] = (learners ?? [])
    .filter((l) => !invitedIds.has(l.id))
    .map((l) => ({
      id: l.id,
      name: `${l.first_name} ${l.last_name}`,
      ref: learnerRef(l.learner_no),
      phone: l.phone,
      status: l.admission_status ?? "nouveau",
      level: l.level_assessed,
    }))
    .sort((a, b) => (CANDIDATE_ORDER[a.status] ?? 9) - (CANDIDATE_ORDER[b.status] ?? 9) || a.name.localeCompare(b.name, "fr"));

  const fmtSent = (iso: string | null, channel: string | null) =>
    iso
      ? `le ${new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", timeZone: "Europe/Paris" })}${channel ? ` · ${channel === "whatsapp" ? "WhatsApp" : channel}` : ""}`
      : "";

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <Link href="/apprenants/admission" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline">
          <ArrowLeft className="h-3.5 w-3.5" />
          Apprenants · Admission
        </Link>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{meeting.title}</h1>
          <p className="text-sm">{formatMeetingWhen(when)}</p>
          <p className="text-sm text-muted-foreground">{place ?? "Lieu à préciser (modifier la réunion)"}</p>
          {meeting.notes && <p className="mt-1 whitespace-pre-line text-xs text-muted-foreground">{meeting.notes}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <MeetingFormDialog
            rooms={rooms ?? []}
            invitedCount={invitations.length}
            initial={{
              id: meeting.id,
              title: meeting.title,
              date: meetingDay,
              startTime: utcToLocalTime(meeting.starts_at),
              endTime: meeting.ends_at ? utcToLocalTime(meeting.ends_at) : "",
              roomId: meeting.room_id ?? "none",
              location: meeting.location ?? "",
              capacity: meeting.capacity ? String(meeting.capacity) : "",
              notes: meeting.notes ?? "",
            }}
          />
          <SendPendingEmailsButton meetingId={meeting.id} count={pendingWithEmail} />
          <InviteLearnersDialog meetingId={meeting.id} candidates={candidates} />
        </div>
      </div>

      <div className="flex flex-wrap gap-2 text-sm">
        <Badge variant="outline">
          {invitations.length} convoqué{invitations.length > 1 ? "s" : ""}{meeting.capacity ? ` / ${meeting.capacity} places` : ""}
        </Badge>
        <Badge variant="outline" className={invitationBadgeClass("a_envoyer")}>À envoyer · {count(["a_envoyer"])}</Badge>
        <Badge variant="outline" className={invitationBadgeClass("envoyee")}>Envoyées · {count(["envoyee"])}</Badge>
        <Badge variant="outline" className={invitationBadgeClass("confirmee")}>Confirmés · {count(["confirmee"])}</Badge>
        <Badge variant="outline" className={invitationBadgeClass("presente")}>Présents · {count(["presente"])}</Badge>
        <Badge variant="outline" className={invitationBadgeClass("absente")}>Absents · {count(["absente", "excusee"])}</Badge>
      </div>

      <div className="rounded-lg border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Apprenant</TableHead>
              <TableHead className="hidden md:table-cell">Téléphone</TableHead>
              <TableHead>Convocation</TableHead>
              <TableHead>Test oral</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invitations.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  Aucun convoqué. « Ajouter des convoqués », puis envoyez chaque message WhatsApp en un clic.
                </TableCell>
              </TableRow>
            )}
            {invitations.map((inv) => {
              const l = inv.learners!;
              const name = `${l.first_name} ${l.last_name}`;
              return (
                <TableRow key={inv.id}>
                  <TableCell className="font-medium">
                    {name}
                    <span className="block font-mono text-[11px] font-normal text-muted-foreground">
                      {learnerRef(l.learner_no)}{l.level_assessed ? ` · ${l.level_assessed}` : ""}
                    </span>
                    <AdmissionBadge status={l.admission_status} className="mt-1 md:hidden" />
                  </TableCell>
                  <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
                    {formatPhone(l.phone)}
                    {l.email && <span className="block text-xs">{l.email}</span>}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={invitationBadgeClass(inv.status)}>{invitationLabel(inv.status)}</Badge>
                    {inv.sent_at && <span className="block text-xs text-muted-foreground">{fmtSent(inv.sent_at, inv.channel)}</span>}
                  </TableCell>
                  <TableCell>
                    <OralTestDialog
                      learnerId={l.id}
                      learnerName={name}
                      meetingId={meeting.id}
                      defaultOn={meetingDay}
                      defaultEvaluator={profile?.full_name ?? null}
                      initial={
                        l.oral_test_on
                          ? { on: l.oral_test_on, level: l.oral_test_level, evaluator: l.oral_test_evaluator, comment: l.oral_test_comment }
                          : null
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <InvitationActions
                      invitation={{ id: inv.id, status: inv.status }}
                      learner={{ id: l.id, name, phone: l.phone, email: l.email }}
                      messages={{
                        invite: buildMeetingInvitationMessage({ learnerFirstName: l.first_name, senderFirstName, meeting: when }),
                        reminder: buildMeetingReminderMessage({ learnerFirstName: l.first_name, senderFirstName, meeting: when }),
                      }}
                      meetingUpcoming={upcoming}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-muted-foreground">
        Pendant la réunion : passez chaque personne en « Présent(e) », puis « Test oral » pour noter le niveau en 20 secondes — il remplit la fiche et le dossier d&apos;entrée PDF.
      </p>
    </div>
  );
}
