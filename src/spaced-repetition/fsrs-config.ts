import { fsrs } from "ts-fsrs";

import type { FSRSParameters } from "ts-fsrs";
import { CURRENT_FSRS_PROFILE, createSchedulerForProfile } from "./scheduler-profile.ts";

export const DESIRED_RETENTION = CURRENT_FSRS_PROFILE.requestRetention;
export const FSRS_SCHEMA_VERSION = 1;

/**
 * FSRS tuning is kept in one place so scheduling experiments do not require
 * changing the adapter or the UI.
 */
export const FSRS_TUNING = {
  request_retention: CURRENT_FSRS_PROFILE.requestRetention,
  maximum_interval: CURRENT_FSRS_PROFILE.maximumInterval,
  enable_fuzz: CURRENT_FSRS_PROFILE.enableFuzz,
  enable_short_term: CURRENT_FSRS_PROFILE.enableShortTerm,
  learning_steps: [...CURRENT_FSRS_PROFILE.learningSteps],
  relearning_steps: [...CURRENT_FSRS_PROFILE.relearningSteps],
} satisfies Partial<FSRSParameters>;

export function createFsrsScheduler(
  tuning: Partial<FSRSParameters> = FSRS_TUNING,
) {
  return fsrs(tuning);
}

export const fsrsScheduler = createSchedulerForProfile(CURRENT_FSRS_PROFILE);

export const FSRS_TEST_TUNING = {
  ...FSRS_TUNING,
  enable_fuzz: false,
} satisfies Partial<FSRSParameters>;

