import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { TRAINING_MODULES } from "@/lib/training-content";
import { ModulePlayer } from "@/components/formation/module-player";

// Lecteur d'un module : leçons à valider une à une, puis quiz de fin.
export default async function ModulePage({ params }: { params: Promise<{ moduleId: string }> }) {
  const { moduleId } = await params;
  await requireSession();

  const trainingModule = TRAINING_MODULES.find((m) => m.id === moduleId);
  if (!trainingModule) notFound();

  return <ModulePlayer module={trainingModule} />;
}
