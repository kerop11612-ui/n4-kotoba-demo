"use client";

import { useMemo } from "react";
import {
  buildHomeRecommendation,
  buildUnitRecommendation,
  type LearningRecommendationViewModel,
  type StudyOverview,
} from "../../src/spaced-repetition/study-session.ts";
import type { UnitStats } from "../../src/spaced-repetition/types.ts";

export function useLearningRecommendation({
  scope,
  overview,
  unitStats,
}: {
  scope: "home" | "unit";
  overview?: StudyOverview | null;
  unitStats?: UnitStats | null;
}): {
  recommendation: LearningRecommendationViewModel | null;
  source: "local";
  generatedAt: string | null;
} {
  const recommendation = useMemo(() => {
    if (scope === "home") return overview ? buildHomeRecommendation(overview) : null;
    return unitStats ? buildUnitRecommendation({ stats: unitStats }) : null;
  }, [overview, scope, unitStats]);

  return {
    recommendation,
    source: "local",
    generatedAt: null,
  };
}
