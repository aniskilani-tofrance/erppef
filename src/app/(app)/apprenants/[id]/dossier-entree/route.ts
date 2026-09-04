import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { buildEntryFilePdf, entryFileName } from "@/lib/reports/entry-file-pdf";

// Dossier d'entrée PDF d'un apprenant (Qualiopi ind. 4).
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  await requireRole(["admin", "coordinator"]);
  const supabase = await createClient();

  const [{ data: learner }, { data: tests }] = await Promise.all([
    supabase
      .from("learners")
      .select(
        "learner_no, first_name, last_name, birth_date, first_language, city, prescriber, activity_status, entry_goal, entry_need, entry_interview_on, level_assessed",
      )
      .eq("id", id)
      .single(),
    supabase
      .from("placement_tests")
      .select("status, level, score, completed_at, created_at")
      .eq("learner_id", id)
      .eq("status", "fait")
      .order("created_at", { ascending: false })
      .limit(1),
  ]);
  if (!learner) return new Response("Apprenant introuvable", { status: 404 });

  const test = tests?.[0];
  const pdf = await buildEntryFilePdf({
    learnerNo: learner.learner_no,
    firstName: learner.first_name,
    lastName: learner.last_name,
    birthDate: learner.birth_date,
    firstLanguage: learner.first_language,
    city: learner.city,
    prescriber: learner.prescriber,
    activityStatus: learner.activity_status,
    entryGoal: learner.entry_goal,
    entryNeed: learner.entry_need,
    entryInterviewOn: learner.entry_interview_on,
    levelAssessed: learner.level_assessed,
    lastTest: test
      ? {
          doneAt: test.completed_at ?? test.created_at,
          level: test.level,
          score: test.score === null ? null : Number(test.score),
        }
      : null,
  });

  return new Response(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${entryFileName({ firstName: learner.first_name, lastName: learner.last_name })}"`,
    },
  });
}
