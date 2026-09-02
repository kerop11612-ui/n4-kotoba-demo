import { default_w, fsrs, type FSRS, type FSRSParameters } from "ts-fsrs";

export type FsrsStepUnit = `${number}${"m" | "h" | "d"}`;

export interface FsrsSchedulerProfile {
  id: string;
  algorithm: "FSRS-6";
  packageName: "ts-fsrs";
  packageVersion: string;
  parameters: readonly number[];
  requestRetention: number;
  maximumInterval: number;
  enableFuzz: boolean;
  enableShortTerm: boolean;
  learningSteps: readonly FsrsStepUnit[];
  relearningSteps: readonly FsrsStepUnit[];
}

export const LEGACY_FSRS6_PROFILE: FsrsSchedulerProfile = Object.freeze({
  id: "fsrs6-tsfsrs-5.4.1-default-r90-short-v1",
  algorithm: "FSRS-6" as const,
  packageName: "ts-fsrs" as const,
  packageVersion: "5.4.1",
  parameters: Object.freeze([...default_w]),
  requestRetention: 0.9,
  maximumInterval: 36500,
  enableFuzz: true,
  enableShortTerm: true,
  learningSteps: Object.freeze(["1m", "10m"] as const),
  relearningSteps: Object.freeze(["10m"] as const),
});

export const CURRENT_FSRS_PROFILE = LEGACY_FSRS6_PROFILE;

const KNOWN_PROFILES = new Map<string, FsrsSchedulerProfile>([
  [LEGACY_FSRS6_PROFILE.id, LEGACY_FSRS6_PROFILE],
]);

export function getSchedulerProfile(profileId?: string): FsrsSchedulerProfile {
  if (!profileId) return LEGACY_FSRS6_PROFILE;
  const profile = KNOWN_PROFILES.get(profileId);
  if (!profile) {
    throw new Error(`不支援的 FSRS 排程設定檔: ${profileId}`);
  }
  return profile;
}

export function createSchedulerForProfile(profile: FsrsSchedulerProfile): FSRS {
  return fsrs({
    w: [...profile.parameters],
    request_retention: profile.requestRetention,
    maximum_interval: profile.maximumInterval,
    enable_fuzz: profile.enableFuzz,
    enable_short_term: profile.enableShortTerm,
    learning_steps: [...profile.learningSteps],
    relearning_steps: [...profile.relearningSteps],
  });
}
