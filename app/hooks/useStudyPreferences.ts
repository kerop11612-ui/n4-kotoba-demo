"use client";

import { useEffect, useState } from "react";

export type StudyDisplayPreferences = {
  showMeaning: boolean;
  showReading: boolean;
  showExample: boolean;
  showExampleTranslation: boolean;
  blurTranslations: boolean;
};

const STORAGE_KEY = "n4-kotoba-study-display-preferences-v1";

const defaults: StudyDisplayPreferences = {
  showMeaning: true,
  showReading: true,
  showExample: true,
  showExampleTranslation: true,
  blurTranslations: true,
};

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

function readPreferences(): StudyDisplayPreferences {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return defaults;
    const stored = value as Partial<StudyDisplayPreferences>;
    return {
      showMeaning: isBoolean(stored.showMeaning) ? stored.showMeaning : defaults.showMeaning,
      showReading: isBoolean(stored.showReading) ? stored.showReading : defaults.showReading,
      showExample: isBoolean(stored.showExample) ? stored.showExample : defaults.showExample,
      showExampleTranslation: isBoolean(stored.showExampleTranslation)
        ? stored.showExampleTranslation
        : defaults.showExampleTranslation,
      blurTranslations: isBoolean(stored.blurTranslations) ? stored.blurTranslations : defaults.blurTranslations,
    };
  } catch {
    return defaults;
  }
}

export function useStudyPreferences() {
  const [preferences, setPreferences] = useState<StudyDisplayPreferences>(defaults);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPreferences(readPreferences());
      setReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
    } catch {
      // Preferences are optional; a full or restricted storage should not block learning.
    }
  }, [preferences, ready]);

  return { preferences, setPreferences };
}
