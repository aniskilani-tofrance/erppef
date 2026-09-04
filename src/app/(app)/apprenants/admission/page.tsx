import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { AdmissionBadge } from "@/components/admission/admission-badge";
import { ContactDialog, type ContactEntry } from "@/components/admission/contact-dialog";
import { MeetingFormDialog } from "@/components/admission/meeting-form-dialog";
import { LearnersTabs } from "@/components/apprenants/learners-tabs";
import { WhatsAppButton } from "@/components/admission/whatsapp-button";
import { buildFirstContactMessage, formatMeetingWhen } from "@/lib/admission/messages";
import { formatPhone } from "@/lib/admission/phone";
import { ADMISSION_STATUSES, admissionBadgeClass } from "@/lib/admission/status";
import { CONTACT_SOURCES } from "@/lib/referentiels";
import { learnerRef } from "@/lib/refs";

// Parcours d'admission : qui contacter aujourd'hui (WhatsApp en un clic), les réunions
// d'information à venir et où en est chacun (entonnoir).

type MeetingRow = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string | null;
  location: string | null;
  capacity: number | null;
  rooms: { name: string } | null;
  info_meeting_invitations: { status: string }[];
};

type LearnerRow = {
  id: string;
  first_name: string;
  last_name: string;
  learner_no: number | null;
  phone: string | null;
  admission_status: string | null;
  level_assessed: string | null;
  created_at: string;
};

function fmtDay(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", timeZone: "Europe/Paris" }) : "—";
}

// Tableau « à contacter » / « à convoquer » : WhatsApp en un clic + carnet de contact.
function LearnerRows({
  rows,
  empty,
  senderFirstName,
  history,
}: {
  rows: LearnerRow[];
  empty: string;
  senderFirstName: string | null;
  history: Map<string, ContactEntry[]>;
}) {
  if (rows.length === 0) return <p className="py-4 text-sm text-muted-foreground">{empty}</p>;
  const lastContactAt = (id: string) => history.get(id)?.[0]?.contactedAt ?? null;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Nom</TableHead>
          <TableHead>Téléphone</TableHead>
          <TableHead>Statut</TableHead>
          <TableHead className="hidden sm:table-cell">Dernier contact</TableHead>
          <TableHead className="w-40">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.slice(0, 80).map((l) => (
          <TableRow key={l.id}>
            <TableCell className="font-medium">
              {l.first_name} {l.last_name}
              <span className="block font-mono text-[11px] font-normal text-muted-foreground">
                {learnerRef(l.learner_no)}{l.level_assessed ? ` · ${l.level_assessed}` : ""}
              </span>
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">{formatPhone(l.phone)}</TableCell>
            <TableCell><AdmissionBadge status={l.admission_status} /></TableCell>
            <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">
              {lastContactAt(l.id) ? fmtDay(lastContactAt(l.id)) : `arrivé le ${fmtDay(l.created_at)}`}
            </TableCell>
            <TableCell>
              <span className="inline-flex items-center gap-1">
                <WhatsAppButton
                  phone={l.phone}
                  message={buildFirstContactMessage({ learnerFirstName: l.first_name, senderFirstName })}
                  trace={{ kind: "contact", learnerId: l.id, note: "Premier contact WhatsApp" }}
                  label="Écrire"
                  title="Écrire sur WhatsApp — message de premier contact pré-rempli"
                />
                <ContactDialog
                  learnerId={l.id}
                  learnerName={`${l.first_name} ${l.last_name}`}
                  currentStatus={l.admission_status}
                  history={history.get(l.id) ?? []}
                />
              </span>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export default async function AdmissionPage() {
  const { userId } = await requireRole(["admin", "coordinator"]);
  const supabase = await createClient();

  const [{ data: learners }, { data: contacts }, { data: meetingRows }, { data: rooms }, { data: profile }] = await Promise.all([
    supabase
      .from("learners")
      .select("id, first_name, last_name, learner_no, phone, email, admission_status, level_assessed, created_at, contact_source")
      .order("created_at", { ascending: true }),
    supabase
      .from("learner_contacts")
      .select("id, learner_id, contacted_at, channel, outcome, note, profiles:created_by(full_name)")
      .order("contacted_at", { ascending: false })
      .limit(500),
    supabase
      .from("info_meetings")
      .select("id, title, starts_at, ends_at, location, capacity, rooms:room_id(name), info_meeting_invitations(status)")
      .order("starts_at", { ascending: false }),
    supabase.from("rooms").select("id, name").eq("is_active", true).order("name"),
    supabase.from("profiles").select("full_name").eq("id", userId).single(),
  ]);
  const senderFirstName = profile?.full_name?.trim().split(/\s+/)[0] ?? null;

  // Journal : 5 derniers contacts par apprenant + date du dernier
  const historyByLearner = new Map<string, ContactEntry[]>();
  for (const c of contacts ?? []) {
    const list = historyByLearner.get(c.learner_id) ?? [];
    if (list.length < 5) {
      list.push({
        id: c.id,
        contactedAt: c.contacted_at,
        channel: c.channel,
        outcome: c.outcome,
        note: c.note,
        by: (c.profiles as unknown as { full_name: string | null } | null)?.full_name ?? null,
      });
      historyByLearner.set(c.learner_id, list);
    }
  }
  const lastContactAt = (id: string) => historyByLearner.get(id)?.[0]?.contactedAt ?? null;

  // Entonnoir
  const counts: Record<string, number> = {};
  for (const l of learners ?? []) counts[l.admission_status ?? "nouveau"] = (counts[l.admission_status ?? "nouveau"] ?? 0) + 1;

  // À contacter : jamais contactés (les plus anciens d'abord), puis injoignables (relance la plus ancienne d'abord)
  const toContact = (learners ?? [])
    .filter((l) => l.admission_status === "nouveau" || l.admission_status === "injoignable")
    .sort((a, b) => {
      if (a.admission_status !== b.admission_status) return a.admission_status === "nouveau" ? -1 : 1;
      const la = lastContactAt(a.id) ?? a.created_at;
      const lb = lastContactAt(b.id) ?? b.created_at;
      return la.localeCompare(lb);
    });
  // Contactés mais pas encore convoqués : le vivier de la prochaine réunion
  const toInvite = (learners ?? [])
    .filter((l) => l.admission_status === "contacte")
    .sort((a, b) => (lastContactAt(a.id) ?? "").localeCompare(lastContactAt(b.id) ?? ""));

  // D'où viennent les demandes : canal de premier contact (total + 30 derniers jours)
  const since30 = new Date(new Date().getTime() - 30 * 86_400_000).toISOString();
  const sourceRows = [...CONTACT_SOURCES.map((s) => ({ code: s.code as string, label: s.label })), { code: "nc", label: "Non renseigné" }]
    .map((s) => {
      const mine = (learners ?? []).filter((l) => (l.contact_source ?? "nc") === s.code);
      return { ...s, total: mine.length, recent: mine.filter((l) => l.created_at >= since30).length };
    })
    .filter((s) => s.total > 0)
    .sort((a, b) => b.total - a.total);
  const sourceTotal = sourceRows.reduce((acc, s) => acc + s.total, 0);

  const now = new Date().getTime();
  const meetings = ((meetingRows ?? []) as unknown as MeetingRow[]).map((m) => {
    const st = m.info_meeting_invitations ?? [];
    const count = (codes: string[]) => st.filter((i) => codes.includes(i.status)).length;
    return {
      ...m,
      place: m.rooms?.name ? `${m.rooms.name}${m.location ? ` — ${m.location}` : ""}` : m.location,
      invited: st.length,
      toSend: count(["a_envoyer"]),
      confirmed: count(["confirmee", "presente"]),
      present: count(["presente"]),
      upcoming: new Date(m.starts_at).getTime() >= now - 6 * 3600_000,
    };
  });
  const upcoming = meetings.filter((m) => m.upcoming).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const past = meetings.filter((m) => !m.upcoming).slice(0, 8);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Apprenants</h1>
        <MeetingFormDialog rooms={rooms ?? []} />
      </div>

      <LearnersTabs active="admission" toContact={toContact.length} />

      <p className="text-sm text-muted-foreground">
        Prise de contact sur WhatsApp, réunions d&apos;information, test oral — jusqu&apos;à l&apos;inscription.
      </p>

      {/* Entonnoir */}
      <div className="flex flex-wrap gap-2">
        {ADMISSION_STATUSES.map((s) => (
          <Link key={s.code} href={`/apprenants?statut=${s.code}`} title={`${s.hint} — voir la liste`}>
            <Badge variant="outline" className={admissionBadgeClass(s.code)}>
              {s.label} · {counts[s.code] ?? 0}
            </Badge>
          </Link>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Réunions d&apos;information à venir</CardTitle>
        </CardHeader>
        <CardContent>
          {upcoming.length === 0 ? (
            <p className="py-2 text-sm text-muted-foreground">
              Aucune réunion planifiée. « Nouvelle réunion » puis ajoutez les convoqués : chaque message WhatsApp part en un clic.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Quand</TableHead>
                  <TableHead className="hidden sm:table-cell">Lieu</TableHead>
                  <TableHead>Convoqués</TableHead>
                  <TableHead className="hidden sm:table-cell">À envoyer</TableHead>
                  <TableHead>Confirmés</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {upcoming.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="font-medium">
                      <Link href={`/apprenants/reunions/${m.id}`} className="hover:underline">
                        {formatMeetingWhen({ startsAt: m.starts_at, endsAt: m.ends_at })}
                      </Link>
                      {m.title !== "Réunion d'information" && (
                        <span className="block text-xs font-normal text-muted-foreground">{m.title}</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">{m.place ?? "—"}</TableCell>
                    <TableCell>
                      {m.invited}{m.capacity ? ` / ${m.capacity}` : ""}
                      {m.capacity && m.invited > m.capacity && <Badge variant="destructive" className="ml-2">dépassement</Badge>}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {m.toSend > 0 ? <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800">{m.toSend}</Badge> : "—"}
                    </TableCell>
                    <TableCell>{m.confirmed}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {past.length > 0 && (
            <details className="mt-3">
              <summary className="cursor-pointer text-xs text-muted-foreground">Réunions passées ({past.length})</summary>
              <ul className="mt-2 space-y-1 text-sm">
                {past.map((m) => (
                  <li key={m.id}>
                    <Link href={`/apprenants/reunions/${m.id}`} className="hover:underline">
                      {formatMeetingWhen({ startsAt: m.starts_at })}
                    </Link>
                    <span className="text-muted-foreground"> — {m.invited} convoqués, {m.present} présents</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">D&apos;où viennent les demandes</CardTitle>
          <p className="text-xs text-muted-foreground">
            Canal par lequel la personne nous a contactés (champ « Nous a contactés par » de la fiche, colonne « Canal de contact » du tableur).
          </p>
        </CardHeader>
        <CardContent>
          {sourceRows.length === 0 ? (
            <p className="py-2 text-sm text-muted-foreground">Aucun canal renseigné pour l&apos;instant.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Canal</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">Part</TableHead>
                  <TableHead className="text-right">30 derniers jours</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sourceRows.map((s) => (
                  <TableRow key={s.code}>
                    <TableCell className={s.code === "nc" ? "text-muted-foreground" : "font-medium"}>{s.label}</TableCell>
                    <TableCell className="text-right">{s.total}</TableCell>
                    <TableCell className="hidden text-right text-muted-foreground sm:table-cell">
                      {sourceTotal ? Math.round((s.total / sourceTotal) * 100) : 0} %
                    </TableCell>
                    <TableCell className="text-right">{s.recent || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">À contacter ({toContact.length})</CardTitle>
          <p className="text-xs text-muted-foreground">
            Nouveaux (jamais contactés) puis injoignables à relancer. « Écrire » ouvre WhatsApp avec le message de premier contact ; le statut passe à « Contacté » tout seul.
          </p>
        </CardHeader>
        <CardContent>
          <LearnerRows rows={toContact} senderFirstName={senderFirstName} history={historyByLearner} empty="Personne à contacter : tous les nouveaux ont été joints. Les fiches déposées dans le Drive arrivent ici chaque nuit." />
          {toContact.length > 80 && (
            <p className="mt-2 text-xs text-muted-foreground">
              80 premiers affichés — <Link href="/apprenants?statut=nouveau" className="underline">voir tous les nouveaux</Link>.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Contactés, à convoquer ({toInvite.length})</CardTitle>
          <p className="text-xs text-muted-foreground">
            Le vivier de la prochaine réunion : ouvrez la réunion → « Ajouter des convoqués », ou cochez-les dans Apprenants → « Convoquer (n) ».
          </p>
        </CardHeader>
        <CardContent>
          <LearnerRows rows={toInvite} senderFirstName={senderFirstName} history={historyByLearner} empty="Aucun contacté en attente de convocation." />
        </CardContent>
      </Card>
    </div>
  );
}
