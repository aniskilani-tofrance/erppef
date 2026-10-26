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
import { SourceDot } from "@/components/admission/source-dot";
import { DotsLegend, GroupDot } from "@/components/admission/group-dot";
import { groupsByLearner } from "@/lib/admission/group-colors";
import { loadActiveGroupRefs } from "@/lib/admission/load-groups";
import { InvitationActions } from "@/components/admission/invitation-actions";
import { InviteLearnersDialog, type Candidate } from "@/components/admission/invite-learners-dialog";
import { MeetingFormDialog } from "@/components/admission/meeting-form-dialog";
import { MeetingSignupCard } from "@/components/admission/meeting-signup-card";
import { ConvocationTimeButton } from "@/components/admission/convocation-time-button";
import { MeetingSlotsCard } from "@/components/admission/meeting-slots-card";
import { PrepareTestsButton } from "@/components/admission/prepare-tests-button";
import { CopyTestLinkButton } from "@/components/admission/copy-test-link-button";
import { SEATED_STATUSES, slotOfferState } from "@/lib/inscription/meeting";
import { loadConvocationTests } from "@/lib/placement/convocation-test-server";
import { SpaceConvocationsDialog } from "@/components/admission/space-convocations-dialog";
import { staggerSummary, whenForInvitation } from "@/lib/admission/convocation";
import { OralTestDialog } from "@/components/admission/oral-test-dialog";
import { SendPendingEmailsButton } from "@/components/admission/send-pending-emails-button";
import {
  buildMeetingInvitationMessage,
  buildMeetingReminderMessage,
  buildMissedMeetingMessage,
  formatMeetingWhen,
} from "@/lib/admission/messages";
import { loadTemplates } from "@/lib/admission/load-templates";
import { formatPhone } from "@/lib/admission/phone";
import { invitationBadgeClass, invitationLabel } from "@/lib/admission/status";
import { utcToLocalDate, utcToLocalTime } from "@/lib/dates";
import { learnerRef } from "@/lib/refs";

// Page d'une réunion d'information : la liste des convoqués et, pour chacun, l'envoi
// WhatsApp en un clic, la confirmation, la présence et l'entretien oral.

type InvitationRow = {
  id: string;
  status: string;
  channel: string | null;
  sent_at: string | null;
  signed_up_online: boolean;
  convocation_at: string | null; // heure propre à la personne (null = celle de la réunion)
  created_at: string;
  learners: {
    id: string;
    first_name: string;
    last_name: string;
    learner_no: number | null;
    phone: string | null;
    email: string | null;
    admission_status: string;
    level_assessed: string | null;
    contact_source: string | null;
    contact_source_detail: string | null;
    prescriber: string | null;
    oral_test_on: string | null;
    oral_test_level: string | null;
    oral_test_evaluator: string | null;
    oral_test_comment: string | null;
  } | null;
};

const CANDIDATE_ORDER: Record<string, number> = {
  contacte: 0, injoignable: 1, nouveau: 2, convoque: 3, evalue: 4, liste_attente: 5, sans_suite: 6, inscrit: 7,
};

export default async function MeetingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { userId, orgId } = await requireRole(["admin", "coordinator"]);
  const supabase = await createClient();

  const [{ data: meeting }, { data: invitationRows }, { data: learners }, { data: rooms }, { data: profile }, templates] = await Promise.all([
    supabase.from("info_meetings").select("*, rooms:room_id(name, address, access_notes)").eq("id", id).single(),
    supabase
      .from("info_meeting_invitations")
      .select("id, status, channel, sent_at, signed_up_online, convocation_at, created_at, learners(id, first_name, last_name, learner_no, phone, email, admission_status, level_assessed, contact_source, contact_source_detail, prescriber, oral_test_on, oral_test_level, oral_test_evaluator, oral_test_comment)")
      .eq("meeting_id", id),
    supabase
      .from("learners")
      .select("id, first_name, last_name, learner_no, phone, admission_status, level_assessed, contact_source, contact_source_detail, prescriber")
      .order("last_name")
      .order("first_name"),
    supabase.from("rooms").select("id, name").eq("is_active", true).order("name"),
    supabase.from("profiles").select("full_name").eq("id", userId).single(),
    loadTemplates(supabase),
  ]);
  if (!meeting) notFound();
  // Créneaux du même lien (jeton commun) : chacun est une réunion à part entière.
  const { data: siblingRows } = meeting.series_token
    ? await supabase
        .from("info_meetings")
        .select("id, starts_at, ends_at, capacity, signup_open, info_meeting_invitations(status)")
        .eq("series_token", meeting.series_token)
        .order("starts_at")
    : { data: null };
  // Pastilles provenance + groupe (convoqués et candidats)
  const [{ data: enrollmentRows }, groupRefs] = await Promise.all([
    supabase.from("enrollments").select("learner_id, group_id, status, groups(name, trainers:trainer_id(color))").eq("status", "inscrit"),
    loadActiveGroupRefs(supabase),
  ]);
  const groupsOf = groupsByLearner(
    (enrollmentRows ?? []).map((e) => ({ learner_id: e.learner_id, group_id: e.group_id, status: e.status, groups: e.groups as unknown as { name: string; trainers?: { color: string | null } | null } | null })),
  );

  const senderFirstName = profile?.full_name?.trim().split(/\s+/)[0] ?? null;
  const meetingRoom = meeting.rooms as unknown as { name: string; address: string | null; access_notes: string | null } | null;
  const roomName = meetingRoom?.name ?? null;
  const place = roomName ? `${roomName}${meeting.location ? ` — ${meeting.location}` : meetingRoom?.address ? ` — ${meetingRoom.address}` : ""}` : meeting.location;
  const when = { startsAt: meeting.starts_at as string, endsAt: meeting.ends_at as string | null, place, access: meetingRoom?.access_notes ?? null };
  const upcoming = new Date(meeting.starts_at).getTime() >= new Date().getTime() - 6 * 3600_000;
  const meetingDay = utcToLocalDate(meeting.starts_at);

  const invitations = ((invitationRows ?? []) as unknown as InvitationRow[])
    .filter((i) => i.learners)
    .sort((a, b) => `${a.learners!.last_name} ${a.learners!.first_name}`.localeCompare(`${b.learners!.last_name} ${b.learners!.first_name}`, "fr"));
  const invitedIds = new Set(invitations.map((i) => i.learners!.id));
  // Test de niveau dans la convocation : pour chaque convoqué, SON lien s'il ne l'a pas fait
  // (un test est créé POUR un apprenant : son résultat remplit le niveau de la bonne fiche).
  const tests = await loadConvocationTests(supabase, orgId, [...invitedIds]);
  const active = invitations.filter((i) => !["excusee", "absente"].includes(i.status));
  const testsToPrepare = active.filter((i) => tests.missing.includes(i.learners!.id)).length;
  const count = (codes: string[]) => invitations.filter((i) => codes.includes(i.status)).length;
  const pendingWithEmail = invitations.filter((i) => i.status === "a_envoyer" && i.learners?.email).length;
  // Premier inscrit, premier servi (fonction SQL signup_for_info_meeting, 0057) : seules les personnes
  // confirmées (ou présentes) occupent une place ; une convocation sans réponse n'en prend pas.
  const taken = invitations.filter((i) => SEATED_STATUSES.includes(i.status)).length;
  const waiting = invitations.filter((i) => ["a_envoyer", "envoyee"].includes(i.status)).length;
  const onlineCount = invitations.filter((i) => i.signed_up_online).length;
  // Heures de convocation : celle de la réunion par défaut, une par personne si l'équipe en fixe.
  const meetingTime = utcToLocalTime(meeting.starts_at);
  const toPlace = invitations.filter((i) => ["a_envoyer", "envoyee", "confirmee"].includes(i.status)).length;
  const confirmedToPlace = invitations.filter((i) => i.status === "confirmee").length;
  const customCount = invitations.filter((i) => i.convocation_at).length;
  // Créneaux du lien et ce que la page du lien en fait (proposé, complet, fermé, passé).
  const slotSource = siblingRows?.length
    ? siblingRows.map((s) => ({
        id: s.id as string,
        startsAt: s.starts_at as string,
        endsAt: (s.ends_at as string | null) ?? null,
        signupOpen: Boolean(s.signup_open),
        capacity: (s.capacity as number | null) ?? null,
        taken: ((s.info_meeting_invitations as unknown as { status: string }[] | null) ?? []).filter((i) => SEATED_STATUSES.includes(i.status)).length,
      }))
    : [{ id: meeting.id as string, startsAt: meeting.starts_at as string, endsAt: (meeting.ends_at as string | null) ?? null, signupOpen: Boolean(meeting.signup_open), capacity: (meeting.capacity as number | null) ?? null, taken }];
  const slotRows = slotSource.map((s) => ({
    id: s.id,
    whenText: formatMeetingWhen({ startsAt: s.startsAt, endsAt: s.endsAt }),
    taken: s.taken,
    capacity: s.capacity,
    state: slotOfferState(s),
    current: s.id === meeting.id,
  }));
  const started = new Date(meeting.starts_at).getTime() <= new Date().getTime();

  const candidates: Candidate[] = (learners ?? [])
    .filter((l) => !invitedIds.has(l.id))
    .map((l) => ({
      id: l.id,
      name: `${l.first_name} ${l.last_name}`,
      ref: learnerRef(l.learner_no),
      phone: l.phone,
      status: l.admission_status ?? "nouveau",
      level: l.level_assessed,
      contact_source: l.contact_source,
      contact_source_detail: l.contact_source_detail,
      prescriber: l.prescriber,
      groups: groupsOf.get(l.id) ?? [],
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
          {meeting.stagger_minutes && (
            <p className="mt-1 text-sm font-medium text-teal-800">
              🕒 Accueil échelonné : {staggerSummary(meeting.stagger_minutes, meeting.stagger_parallel ?? 1).toLowerCase()} — chaque inscrit par le lien reçoit son heure.
            </p>
          )}
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
              signupOpen: Boolean(meeting.signup_open),
              oralTestIncluded: meeting.oral_test_included ?? true,
              staggerMinutes: meeting.stagger_minutes ? String(meeting.stagger_minutes) : "",
              staggerParallel: String(meeting.stagger_parallel ?? 1),
            }}
          />
          <PrepareTestsButton meetingId={meeting.id} count={testsToPrepare} />
          <SpaceConvocationsDialog
            meetingId={meeting.id}
            meetingTime={meetingTime}
            count={toPlace}
            confirmedCount={confirmedToPlace}
            customCount={customCount}
            defaultMinutes={meeting.stagger_minutes ?? 15}
            defaultParallel={meeting.stagger_parallel ?? 1}
          />
          <SendPendingEmailsButton meetingId={meeting.id} count={pendingWithEmail} />
          <InviteLearnersDialog meetingId={meeting.id} candidates={candidates} />
        </div>
      </div>

      <DotsLegend groups={groupRefs} />

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

      <MeetingSignupCard
        meetingId={meeting.id}
        token={meeting.series_token ?? meeting.signup_token}
        template={templates.lien_reunion}
        signupOpen={Boolean(meeting.signup_open)}
        capacity={meeting.capacity ?? null}
        taken={taken}
        waiting={waiting}
        onlineCount={onlineCount}
        started={started}
        whenText={formatMeetingWhen(when)}
        place={place}
        oralTest={meeting.oral_test_included ?? true}
        slotCount={slotRows.length}
        proposedCount={slotRows.filter((s) => s.state === "propose").length}
      />

      <MeetingSlotsCard
        meetingId={meeting.id}
        slots={slotRows}
        defaults={{ startTime: meetingTime, endTime: meeting.ends_at ? utcToLocalTime(meeting.ends_at) : "", capacity: meeting.capacity ? String(meeting.capacity) : "" }}
      />

      <div className="rounded-lg border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Apprenant</TableHead>
              <TableHead className="hidden md:table-cell">Téléphone</TableHead>
              <TableHead>Convocation</TableHead>
              <TableHead>Entretien oral</TableHead>
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
              // Date et heure vues par CETTE personne (son heure de convocation si elle en a une)
              const personWhen = whenForInvitation(when, inv.convocation_at);
              const testUrl = tests.urls.get(l.id) ?? null; // null : test déjà fait (ou lien à préparer)
              const testState = tests.done.has(l.id) ? "fait" : testUrl ? "à faire" : "à préparer";
              return (
                <TableRow key={inv.id}>
                  <TableCell className="font-medium">
                    <span className="inline-flex items-center gap-1.5">
                      <SourceDot learner={l} />
                      <GroupDot groups={groupsOf.get(l.id) ?? []} />
                      {name}
                    </span>
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
                    {inv.signed_up_online && <span className="block text-xs text-muted-foreground">inscrit(e) par le lien</span>}
                    <span className="flex flex-wrap items-center gap-x-1">
                      <span
                        className={testState === "à préparer" ? "text-xs text-amber-700" : "text-xs text-muted-foreground"}
                        title={testState === "fait" ? "Niveau déjà connu ou test fait : aucun lien dans la convocation" : testState === "à faire" ? "Son lien personnel est dans la convocation et le rappel" : "« Préparer les tests de niveau » crée son lien"}
                      >
                        📝 test de niveau : {testState}
                      </span>
                      {testUrl && <CopyTestLinkButton url={testUrl} learnerName={name} />}
                    </span>
                    <ConvocationTimeButton
                      invitationId={inv.id}
                      learnerName={name}
                      meetingTime={meetingTime}
                      custom={inv.convocation_at ? utcToLocalTime(inv.convocation_at) : null}
                    />
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
                        invite: buildMeetingInvitationMessage({ learnerFirstName: l.first_name, senderFirstName, meeting: personWhen, testUrl, templates }),
                        reminder: buildMeetingReminderMessage({ learnerFirstName: l.first_name, senderFirstName, meeting: personWhen, testUrl, templates }),
                        missed: buildMissedMeetingMessage({ learnerFirstName: l.first_name, senderFirstName, meeting: personWhen, templates }),
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
        Pendant la réunion : passez chaque personne en « Présent(e) », puis « Entretien oral » pour noter le niveau en 20 secondes — il remplit la fiche, la date de l&apos;entretien d&apos;entrée et le dossier d&apos;entrée PDF.
      </p>
    </div>
  );
}
