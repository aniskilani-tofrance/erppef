import { requireSession } from "@/lib/auth";
import { TrainingHub } from "@/components/formation/training-hub";

export const metadata = { title: "Formation — ERP PEF" };

// Parcours de formation interactifs : modules courts, exercices réels, quiz.
export default async function FormationPage() {
  const { role } = await requireSession();
  return <TrainingHub role={role} />;
}
