/**
 * Offline Sync Manager
 * Handles automatic synchronization of riding records when network becomes available
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo, { NetInfoState } from "@react-native-community/netinfo";
import { getRidingRecords, syncRecordToCloud, RidingRecord } from "./riding-store";

const PENDING_SYNC_KEY = "scoop_pending_sync_records";
const LAST_SYNC_ATTEMPT_KEY = "scoop_last_sync_attempt";
const SYNC_RETRY_INTERVAL = 30000; // 30 seconds between retry attempts

interface SyncStatus {
  isOnline: boolean;
  pendingCount: number;
  lastSyncAttempt: string | null;
  isSyncing: boolean;
}

let isSyncing = false;
let networkUnsubscribe: (() => void) | null = null;

/**
 * Initialize offline sync manager
 * Sets up network state listener for automatic sync
 */
export async function initOfflineSync(): Promise<void> {
  console.log("[OfflineSync] Initializing offline sync manager");
  
  // Clean up existing listener if any
  if (networkUnsubscribe) {
    networkUnsubscribe();
  }
  
  // Subscribe to network state changes
  networkUnsubscribe = NetInfo.addEventListener(handleNetworkChange);
  
  // Check initial network state
  const state = await NetInfo.fetch();
  if (state.isConnected && state.isInternetReachable) {
    console.log("[OfflineSync] Network available on init, triggering sync");
    await syncPendingRecords();
  }
}

/**
 * Cleanup offline sync manager
 */
export function cleanupOfflineSync(): void {
  if (networkUnsubscribe) {
    networkUnsubscribe();
    networkUnsubscribe = null;
  }
}

/**
 * Handle network state changes
 */
async function handleNetworkChange(state: NetInfoState): Promise<void> {
  console.log("[OfflineSync] Network state changed:", {
    isConnected: state.isConnected,
    isInternetReachable: state.isInternetReachable,
    type: state.type,
  });
  
  if (state.isConnected && state.isInternetReachable) {
    // Network became available, trigger sync
    await syncPendingRecords();
  }
}

/**
 * Add a record to pending sync queue
 * Called when saving a record while offline
 */
export async function addToPendingSync(recordId: string): Promise<void> {
  try {
    const pending = await getPendingSyncIds();
    if (!pending.includes(recordId)) {
      pending.push(recordId);
      await AsyncStorage.setItem(PENDING_SYNC_KEY, JSON.stringify(pending));
      console.log("[OfflineSync] Added record to pending sync:", recordId);
    }
  } catch (error) {
    console.error("[OfflineSync] Failed to add to pending sync:", error);
  }
}

/**
 * Remove a record from pending sync queue
 */
export async function removeFromPendingSync(recordId: string): Promise<void> {
  try {
    const pending = await getPendingSyncIds();
    const updated = pending.filter(id => id !== recordId);
    await AsyncStorage.setItem(PENDING_SYNC_KEY, JSON.stringify(updated));
    console.log("[OfflineSync] Removed record from pending sync:", recordId);
  } catch (error) {
    console.error("[OfflineSync] Failed to remove from pending sync:", error);
  }
}

/**
 * Get list of pending sync record IDs
 */
async function getPendingSyncIds(): Promise<string[]> {
  try {
    const data = await AsyncStorage.getItem(PENDING_SYNC_KEY);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error("[OfflineSync] Failed to get pending sync IDs:", error);
    return [];
  }
}

/**
 * Sync all pending records to cloud
 */
export async function syncPendingRecords(): Promise<{ synced: number; failed: number }> {
  if (isSyncing) {
    console.log("[OfflineSync] Sync already in progress, skipping");
    return { synced: 0, failed: 0 };
  }
  
  isSyncing = true;
  let synced = 0;
  let failed = 0;
  
  try {
    // Check network status first
    const netState = await NetInfo.fetch();
    if (!netState.isConnected || !netState.isInternetReachable) {
      console.log("[OfflineSync] No network available, skipping sync");
      return { synced: 0, failed: 0 };
    }
    
    // Get all unsynced records
    const allRecords = await getRidingRecords();
    const unsyncedRecords = allRecords.filter(r => !r.synced);
    
    if (unsyncedRecords.length === 0) {
      console.log("[OfflineSync] No unsynced records to sync");
      return { synced: 0, failed: 0 };
    }
    
    console.log(`[OfflineSync] Starting sync of ${unsyncedRecords.length} records`);
    
    // Update last sync attempt time
    await AsyncStorage.setItem(LAST_SYNC_ATTEMPT_KEY, new Date().toISOString());
    
    // Sync each record
    for (const record of unsyncedRecords) {
      try {
        const success = await syncRecordToCloud(record);
        if (success) {
          synced++;
          await removeFromPendingSync(record.id);
          console.log(`[OfflineSync] Successfully synced record: ${record.id}`);
        } else {
          failed++;
          console.log(`[OfflineSync] Failed to sync record: ${record.id}`);
        }
      } catch (error) {
        failed++;
        console.error(`[OfflineSync] Error syncing record ${record.id}:`, error);
      }
      
      // Small delay between syncs to avoid overwhelming the server
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    console.log(`[OfflineSync] Sync completed: ${synced} synced, ${failed} failed`);
  } catch (error) {
    console.error("[OfflineSync] Sync failed:", error);
  } finally {
    isSyncing = false;
  }
  
  return { synced, failed };
}

/**
 * Get current sync status
 */
export async function getSyncStatus(): Promise<SyncStatus> {
  try {
    const netState = await NetInfo.fetch();
    const allRecords = await getRidingRecords();
    const pendingCount = allRecords.filter(r => !r.synced).length;
    const lastSyncAttempt = await AsyncStorage.getItem(LAST_SYNC_ATTEMPT_KEY);
    
    return {
      isOnline: netState.isConnected === true && netState.isInternetReachable === true,
      pendingCount,
      lastSyncAttempt,
      isSyncing,
    };
  } catch (error) {
    console.error("[OfflineSync] Failed to get sync status:", error);
    return {
      isOnline: false,
      pendingCount: 0,
      lastSyncAttempt: null,
      isSyncing: false,
    };
  }
}

/**
 * Check if currently online
 */
export async function isOnline(): Promise<boolean> {
  try {
    const state = await NetInfo.fetch();
    return state.isConnected === true && state.isInternetReachable === true;
  } catch (error) {
    console.error("[OfflineSync] Failed to check network status:", error);
    return false;
  }
}

/**
 * Force sync attempt (manual trigger)
 */
export async function forceSyncNow(): Promise<{ synced: number; failed: number }> {
  console.log("[OfflineSync] Force sync triggered");
  return syncPendingRecords();
}
