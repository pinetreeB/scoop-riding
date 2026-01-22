import { useEffect, useRef, useCallback } from "react";
import NetInfo, { NetInfoState } from "@react-native-community/netinfo";
import { syncAllToCloud, getRidingRecords } from "@/lib/riding-store";
import { trpc } from "@/lib/trpc";

export interface NetworkSyncState {
  isConnected: boolean;
  isSyncing: boolean;
  unsyncedCount: number;
  lastSyncResult: { synced: number; failed: number } | null;
}

/**
 * Hook to monitor network connectivity and auto-sync unsynced records
 * when network becomes available
 */
export function useNetworkSync() {
  const trpcUtils = trpc.useUtils();
  const isSyncingRef = useRef(false);
  const lastSyncTimeRef = useRef<number>(0);
  const MIN_SYNC_INTERVAL = 30000; // 30 seconds minimum between syncs

  const syncUnsyncedRecords = useCallback(async () => {
    // Prevent concurrent syncs
    if (isSyncingRef.current) {
      console.log("[NetworkSync] Sync already in progress, skipping");
      return null;
    }

    // Rate limiting
    const now = Date.now();
    if (now - lastSyncTimeRef.current < MIN_SYNC_INTERVAL) {
      console.log("[NetworkSync] Rate limited, skipping sync");
      return null;
    }

    try {
      isSyncingRef.current = true;
      lastSyncTimeRef.current = now;

      // Check if there are unsynced records
      const records = await getRidingRecords();
      const unsyncedCount = records.filter((r) => !r.synced).length;

      if (unsyncedCount === 0) {
        console.log("[NetworkSync] No unsynced records");
        return { synced: 0, failed: 0 };
      }

      console.log(`[NetworkSync] Syncing ${unsyncedCount} unsynced records...`);
      const result = await syncAllToCloud(trpcUtils);
      console.log(`[NetworkSync] Sync complete: ${result.synced} synced, ${result.failed} failed`);

      return result;
    } catch (error) {
      console.error("[NetworkSync] Sync error:", error);
      return null;
    } finally {
      isSyncingRef.current = false;
    }
  }, [trpcUtils]);

  useEffect(() => {
    // Subscribe to network state changes
    const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      console.log("[NetworkSync] Network state changed:", {
        isConnected: state.isConnected,
        type: state.type,
      });

      // When network becomes available, try to sync
      if (state.isConnected) {
        syncUnsyncedRecords();
      }
    });

    // Initial sync check on mount
    NetInfo.fetch().then((state: NetInfoState) => {
      if (state.isConnected) {
        syncUnsyncedRecords();
      }
    });

    return () => {
      unsubscribe();
    };
  }, [syncUnsyncedRecords]);

  return {
    syncNow: syncUnsyncedRecords,
  };
}

/**
 * Get current network connectivity status
 */
export async function isNetworkConnected(): Promise<boolean> {
  try {
    const state = await NetInfo.fetch();
    return state.isConnected ?? false;
  } catch {
    return false;
  }
}
