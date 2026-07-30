import { fsrs } from "ts-fsrs";

export const DESIRED_RETENTION = 0.9;
export const FSRS_SCHEMA_VERSION = 1;
export const fsrsScheduler = fsrs({ request_retention: DESIRED_RETENTION });

