"use client";

import { useCallback, useEffect, useState } from "react";

// Progression de formation, stockée sur l'appareil (localStorage) :
// leçons terminées et quiz réussis, par identifiant "module/lesson".
const KEY = "pef-erp-formation-v1";

type Progress = { lessons: string[]; quizzes: string[] };

function load(): Progress {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Progress;
  } catch {
    // stockage indisponible : progression non persistée
  }
  return { lessons: [], quizzes: [] };
}

export function useTrainingProgress() {
  const [progress, setProgress] = useState<Progress>({ lessons: [], quizzes: [] });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setProgress(load());
    setReady(true);
  }, []);

  const persist = useCallback((next: Progress) => {
    setProgress(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // silencieux
    }
  }, []);

  const completeLesson = useCallback(
    (id: string) => {
      const current = load();
      if (!current.lessons.includes(id)) persist({ ...current, lessons: [...current.lessons, id] });
    },
    [persist],
  );

  const passQuiz = useCallback(
    (moduleId: string) => {
      const current = load();
      if (!current.quizzes.includes(moduleId)) persist({ ...current, quizzes: [...current.quizzes, moduleId] });
    },
    [persist],
  );

  return {
    ready,
    lessonDone: (id: string) => progress.lessons.includes(id),
    quizPassed: (moduleId: string) => progress.quizzes.includes(moduleId),
    completeLesson,
    passQuiz,
  };
}
