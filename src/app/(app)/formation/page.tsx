import { requireSession } from "@/lib/auth";
import { loadDeniedModules } from "@/lib/module-access";
import { TrainingHub } from "@/components/formation/training-hub";
import { WhatsNew } from "@/components/formation/whats-new";

export const metadata = { title: "Formation — ERP PEF" };

// Parcours de formation interactifs : modules courts, exercices réels, quiz.
export default async function FormationPage() {
  const { role, userId, orgId } = await requireSession();
  const deniedModules = await loadDeniedModules(userId, orgId);
  return <TrainingHub role={role} whatsNew={<WhatsNew role={role} deniedModules={deniedModules} />} />;
}
