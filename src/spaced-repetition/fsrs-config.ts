import { fsrs } from "ts-fsrs";

import type { FSRSParameters } from "ts-fsrs";

export const DESIRED_RETENTION = 0.9;
export const FSRS_SCHEMA_VERSION = 1;

/**
 * FSRS tuning is kept in one place so scheduling experiments do not require
 * changing the adapter or the UI.
 */
export const FSRS_TUNING = {
  request_retention: DESIRED_RETENTION,
  maximum_interval: 36500,
  enable_fuzz: true,
  enable_short_term: true,
  learning_steps: ["1m", "10m"],
  relearning_steps: ["10m"],
} satisfies Partial<FSRSParameters>;

export function createFsrsScheduler(
  tuning: Partial<FSRSParameters> = FSRS_TUNING,
) {
  return fsrs(tuning);
}

export const fsrsScheduler = createFsrsScheduler();

export const FSRS_TEST_TUNING = {
  ...FSRS_TUNING,
  enable_fuzz: false,
} satisfies Partial<FSRSParameters>;
