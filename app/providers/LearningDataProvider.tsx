"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createMemoryRepository } from "../../src/storage/repository-factory";
import type { MemoryRepository } from "../../src/storage/memory-repository";
import { LocalSyncStateStore } from "../../src/sync/local-sync-state";
import { SyncCoordinator, type SyncStatus } from "../../src/sync/sync-coordinator";
import { SupabaseEventStore } from "../../src/sync/supabase-event-store";
import { getSupabaseClient } from "../../src/sync/supabase-client";
import { LearningDataContext, type AuthStatus, type LearningDataContextValue } from "../hooks/useLearningData";

export function LearningDataProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const [guestRepository] = useState<MemoryRepository>(() => createMemoryRepository(undefined, undefined, "guest"));
  const [repository, setRepository] = useState<MemoryRepository>(guestRepository);
  const [user, setUser] = useState<User | null>(null);
  const [authStatus, setAuthStatus] = useState<AuthStatus>("loading");
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(supabase ? "local" : "local");
  const [pendingCount, setPendingCount] = useState(0);
  const stateStoreRef = useRef<LocalSyncStateStore | null>(null);
  const coordinatorRef = useRef<SyncCoordinator | null>(null);
  const switchingUserRef = useRef<string | null>(null);

  const updateSyncState = useCallback((coordinator: SyncCoordinator | null) => {
    setSyncStatus(coordinator?.status ?? "local");
    setPendingCount(coordinator?.pendingCount ?? 0);
  }, []);

  const signOutToGuest = useCallback(async (ownerId?: string) => {
    coordinatorRef.current?.stop();
    coordinatorRef.current = null;
    if (ownerId) {
      stateStoreRef.current?.clear(ownerId);
      if (repository !== guestRepository) await repository.reset().catch(() => undefined);
    }
    const nextGuest = createMemoryRepository(undefined, undefined, "guest");
    await nextGuest.migrate();
    setRepository(nextGuest);
    setUser(null);
    setAuthStatus("signed_out");
    updateSyncState(null);
  }, [guestRepository, repository, updateSyncState]);

  const switchToUser = useCallback(async (nextUser: User) => {
    if (!supabase || switchingUserRef.current === nextUser.id) return;
    switchingUserRef.current = nextUser.id;
    try {
      const ownerRepository = createMemoryRepository(undefined, undefined, `user:${nextUser.id}`);
      await ownerRepository.migrate();
      const guestData = await guestRepository.exportData();
      const ownerData = await ownerRepository.exportData();
      if (!Object.keys(ownerData.memories).length && !ownerData.history.length && !ownerData.events.length
        && (Object.keys(guestData.memories).length || guestData.history.length || guestData.events.length)) {
        await ownerRepository.importData(guestData);
      }
      const stateStore = stateStoreRef.current ?? new LocalSyncStateStore();
      stateStoreRef.current = stateStore;
      const deviceId = stateStore.read(nextUser.id).deviceId;
      const coordinator = new SyncCoordinator({
        cloud: new SupabaseEventStore(supabase),
        stateStore,
        deviceId,
      });
      coordinatorRef.current?.stop();
      coordinatorRef.current = coordinator;
      setRepository(ownerRepository);
      setUser(nextUser);
      setAuthStatus("signed_in");
      setSyncStatus("syncing");
      await coordinator.start(nextUser.id, ownerRepository);
      updateSyncState(coordinator);
      await guestRepository.reset();
    } catch {
      setUser(nextUser);
      setAuthStatus("signed_in");
      updateSyncState(coordinatorRef.current);
    } finally {
      switchingUserRef.current = null;
    }
  }, [guestRepository, supabase, updateSyncState]);

  useEffect(() => {
    let cancelled = false;
    const initialize = async () => {
      await guestRepository.migrate().catch(() => undefined);
      if (cancelled) return;
      if (!supabase) {
        setAuthStatus("signed_out");
        return;
      }
      const { data } = await supabase.auth.getSession();
      if (data.session?.user) await switchToUser(data.session.user);
      else setAuthStatus("signed_out");
    };
    void initialize();
    if (!supabase) return () => { cancelled = true; };
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) void switchToUser(session.user);
      else void signOutToGuest(user?.id);
    });
    return () => {
      cancelled = true;
      listener.subscription.unsubscribe();
      coordinatorRef.current?.stop();
    };
  }, [guestRepository, signOutToGuest, supabase, switchToUser, user?.id]);

  const sendOtp = useCallback(async (email: string) => {
    if (!supabase) throw new Error("同步服務尚未設定");
    const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
    if (error) throw error;
    setAuthStatus("otp_sent");
  }, [supabase]);

  const verifyOtp = useCallback(async (email: string, token: string) => {
    if (!supabase) throw new Error("同步服務尚未設定");
    const { error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
    if (error) throw error;
  }, [supabase]);

  const retrySync = useCallback(async () => {
    const coordinator = coordinatorRef.current;
    if (!coordinator) return;
    setSyncStatus("syncing");
    try {
      await coordinator.syncNow();
    } finally {
      updateSyncState(coordinator);
    }
  }, [updateSyncState]);

  const signOut = useCallback(async () => {
    if (supabase) {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    } else {
      await signOutToGuest(user?.id);
    }
  }, [signOutToGuest, supabase, user?.id]);

  const value = useMemo<LearningDataContextValue>(() => ({
    repository,
    user,
    authStatus,
    syncStatus,
    pendingCount,
    sendOtp,
    verifyOtp,
    retrySync,
    signOut,
  }), [authStatus, pendingCount, repository, retrySync, sendOtp, signOut, syncStatus, user, verifyOtp]);

  return <LearningDataContext.Provider value={value}>{children}</LearningDataContext.Provider>;
}
