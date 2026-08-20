"use client";

import { createContext, useContext } from "react";
import type { User } from "@supabase/supabase-js";
import type { MemoryRepository } from "../../src/storage/memory-repository";
import type { SyncStatus } from "../../src/sync/sync-coordinator";

export type AuthStatus = "loading" | "signed_out" | "otp_sent" | "signed_in";

export type LearningDataContextValue = {
  repository: MemoryRepository;
  user: User | null;
  authStatus: AuthStatus;
  syncStatus: SyncStatus;
  pendingCount: number;
  sendOtp: (email: string) => Promise<void>;
  verifyOtp: (email: string, token: string) => Promise<void>;
  retrySync: () => Promise<void>;
  signOut: () => Promise<void>;
};

export const LearningDataContext = createContext<LearningDataContextValue | null>(null);

export function useLearningData(): LearningDataContextValue {
  const value = useContext(LearningDataContext);
  if (!value) throw new Error("useLearningData 必須在 LearningDataProvider 內使用");
  return value;
}
