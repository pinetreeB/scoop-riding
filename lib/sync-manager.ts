/**
 * Sync Manager - 동기화 로직 강화 모듈
 * 
 * 기능:
 * 1. 지수 백오프를 사용한 자동 재시도
 * 2. 로컬 데이터 백업 (별도 키 사용)
 * 3. 오프라인 동기화 큐
 * 4. 네트워크 상태 감지
 * 5. 동기화 상태 관리
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import { RidingRecord, getRidingRecords, syncRecordToCloud, getRidingRecordWithGps } from "./riding-store";
import { trpc } from "./trpc";

// Storage keys
const BACKUP_KEY = "scoop_riding_records_backup";
const BACKUP_GPS_PREFIX = "scoop_gps_backup_";
const SYNC_QUEUE_KEY = "scoop_sync_queue";
const SYNC_STATUS_KEY = "scoop_sync_status";
const LAST_SYNC_KEY = "scoop_last_sync";

// Sync status interface
export interface SyncStatus {
  isOnline: boolean;
  lastSyncTime: string | null;
  pendingCount: number;
  failedCount: number;
  lastError: string | null;
  retryCount: number;
}

// Sync queue item
interface SyncQueueItem {
  recordId: string;
  addedAt: string;
  retryCount: number;
  lastAttempt: string | null;
  lastError: string | null;
}

// ============================================
// 백업 로직
// ============================================

/**
 * 모든 주행 기록을 백업 저장소에 복사
 */
export async function backupAllRecords(): Promise<void> {
  try {
    const records = await getRidingRecords();
    await AsyncStorage.setItem(BACKUP_KEY, JSON.stringify(records));
    
    // GPS 데이터도 백업
    for (const record of records) {
      const recordWithGps = await getRidingRecordWithGps(record.id);
      if (recordWithGps?.gpsPoints) {
        await AsyncStorage.setItem(
          `${BACKUP_GPS_PREFIX}${record.id}`,
          JSON.stringify(recordWithGps.gpsPoints)
        );
      }
    }
    
    console.log("[Backup] All records backed up:", records.length);
  } catch (error) {
    console.error("[Backup] Failed to backup records:", error);
  }
}

/**
 * 백업에서 기록 복원
 */
export async function restoreFromBackup(): Promise<{ restored: number }> {
  try {
    const backupData = await AsyncStorage.getItem(BACKUP_KEY);
    if (!backupData) {
      console.log("[Backup] No backup found");
      return { restored: 0 };
    }
    
    const backupRecords: RidingRecord[] = JSON.parse(backupData);
    const currentRecords = await getRidingRecords();
    const currentIds = new Set(currentRecords.map(r => r.id));
    
    let restored = 0;
    for (const record of backupRecords) {
      if (!currentIds.has(record.id)) {
        currentRecords.push(record);
        
        // GPS 데이터도 복원
        const gpsBackup = await AsyncStorage.getItem(`${BACKUP_GPS_PREFIX}${record.id}`);
        if (gpsBackup) {
          await AsyncStorage.setItem(`scoop_gps_track_${record.id}`, gpsBackup);
        }
        
        restored++;
      }
    }
    
    if (restored > 0) {
      await AsyncStorage.setItem("scoop_riding_records", JSON.stringify(currentRecords));
      console.log("[Backup] Restored records:", restored);
    }
    
    return { restored };
  } catch (error) {
    console.error("[Backup] Failed to restore from backup:", error);
    return { restored: 0 };
  }
}

// ============================================
// 오프라인 동기화 큐
// ============================================

/**
 * 동기화 큐에 기록 추가
 */
export async function addToSyncQueue(recordId: string): Promise<void> {
  try {
    const queue = await getSyncQueue();
    
    // 이미 큐에 있는지 확인
    if (queue.some(item => item.recordId === recordId)) {
      console.log("[SyncQueue] Record already in queue:", recordId);
      return;
    }
    
    const item: SyncQueueItem = {
      recordId,
      addedAt: new Date().toISOString(),
      retryCount: 0,
      lastAttempt: null,
      lastError: null,
    };
    
    queue.push(item);
    await AsyncStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(queue));
    console.log("[SyncQueue] Added to queue:", recordId);
  } catch (error) {
    console.error("[SyncQueue] Failed to add to queue:", error);
  }
}

/**
 * 동기화 큐 가져오기
 */
export async function getSyncQueue(): Promise<SyncQueueItem[]> {
  try {
    const data = await AsyncStorage.getItem(SYNC_QUEUE_KEY);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error("[SyncQueue] Failed to get queue:", error);
    return [];
  }
}

/**
 * 동기화 큐에서 기록 제거
 */
export async function removeFromSyncQueue(recordId: string): Promise<void> {
  try {
    const queue = await getSyncQueue();
    const updated = queue.filter(item => item.recordId !== recordId);
    await AsyncStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(updated));
  } catch (error) {
    console.error("[SyncQueue] Failed to remove from queue:", error);
  }
}

/**
 * 동기화 큐 항목 업데이트
 */
async function updateQueueItem(recordId: string, updates: Partial<SyncQueueItem>): Promise<void> {
  try {
    const queue = await getSyncQueue();
    const updated = queue.map(item => 
      item.recordId === recordId ? { ...item, ...updates } : item
    );
    await AsyncStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(updated));
  } catch (error) {
    console.error("[SyncQueue] Failed to update queue item:", error);
  }
}

// ============================================
// 지수 백오프 재시도 로직
// ============================================

const MAX_RETRY_COUNT = 5;
const BASE_DELAY_MS = 1000; // 1초
const MAX_DELAY_MS = 60000; // 1분

/**
 * 지수 백오프 딜레이 계산
 */
function calculateBackoffDelay(retryCount: number): number {
  const delay = Math.min(BASE_DELAY_MS * Math.pow(2, retryCount), MAX_DELAY_MS);
  // 지터 추가 (±20%)
  const jitter = delay * 0.2 * (Math.random() - 0.5);
  return Math.round(delay + jitter);
}

/**
 * 지수 백오프를 사용한 단일 기록 동기화
 */
export async function syncRecordWithRetry(
  record: RidingRecord,
  trpcClient?: ReturnType<typeof trpc.useUtils>
): Promise<{ success: boolean; retryCount: number; error?: string }> {
  let retryCount = 0;
  let lastError: string | null = null;
  
  while (retryCount <= MAX_RETRY_COUNT) {
    try {
      console.log(`[SyncRetry] Attempt ${retryCount + 1}/${MAX_RETRY_COUNT + 1} for record:`, record.id);
      
      const success = await syncRecordToCloud(record, trpcClient);
      
      if (success) {
        // 성공 시 큐에서 제거
        await removeFromSyncQueue(record.id);
        return { success: true, retryCount };
      }
      
      lastError = "Sync returned false";
    } catch (error: any) {
      lastError = error?.message || String(error);
      console.error(`[SyncRetry] Attempt ${retryCount + 1} failed:`, lastError);
    }
    
    retryCount++;
    
    if (retryCount <= MAX_RETRY_COUNT) {
      const delay = calculateBackoffDelay(retryCount);
      console.log(`[SyncRetry] Waiting ${delay}ms before retry...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  // 모든 재시도 실패 - 큐에 추가
  await addToSyncQueue(record.id);
  await updateQueueItem(record.id, {
    retryCount,
    lastAttempt: new Date().toISOString(),
    lastError,
  });
  
  return { success: false, retryCount, error: lastError || "Max retries exceeded" };
}

// ============================================
// 네트워크 상태 감지
// ============================================

/**
 * 현재 네트워크 상태 확인
 */
export async function checkNetworkStatus(): Promise<boolean> {
  try {
    const state = await NetInfo.fetch();
    return state.isConnected === true && state.isInternetReachable !== false;
  } catch (error) {
    console.error("[Network] Failed to check network status:", error);
    return true; // 에러 시 온라인으로 가정
  }
}

/**
 * 네트워크 상태 변경 리스너 등록
 */
export function subscribeToNetworkChanges(
  callback: (isOnline: boolean) => void
): () => void {
  const unsubscribe = NetInfo.addEventListener(state => {
    const isOnline = state.isConnected === true && state.isInternetReachable !== false;
    callback(isOnline);
  });
  
  return unsubscribe;
}

// ============================================
// 동기화 상태 관리
// ============================================

/**
 * 동기화 상태 가져오기
 */
export async function getSyncStatus(): Promise<SyncStatus> {
  try {
    const isOnline = await checkNetworkStatus();
    const queue = await getSyncQueue();
    const records = await getRidingRecords();
    const unsyncedRecords = records.filter(r => !r.synced);
    
    const statusData = await AsyncStorage.getItem(SYNC_STATUS_KEY);
    const savedStatus = statusData ? JSON.parse(statusData) : {};
    
    const lastSyncData = await AsyncStorage.getItem(LAST_SYNC_KEY);
    
    return {
      isOnline,
      lastSyncTime: lastSyncData,
      pendingCount: unsyncedRecords.length,
      failedCount: queue.filter(item => item.retryCount >= MAX_RETRY_COUNT).length,
      lastError: savedStatus.lastError || null,
      retryCount: savedStatus.retryCount || 0,
    };
  } catch (error) {
    console.error("[SyncStatus] Failed to get sync status:", error);
    return {
      isOnline: true,
      lastSyncTime: null,
      pendingCount: 0,
      failedCount: 0,
      lastError: null,
      retryCount: 0,
    };
  }
}

/**
 * 동기화 상태 업데이트
 */
export async function updateSyncStatus(updates: Partial<SyncStatus>): Promise<void> {
  try {
    const current = await getSyncStatus();
    const updated = { ...current, ...updates };
    await AsyncStorage.setItem(SYNC_STATUS_KEY, JSON.stringify(updated));
    
    if (updates.lastSyncTime !== undefined) {
      if (updates.lastSyncTime) {
        await AsyncStorage.setItem(LAST_SYNC_KEY, updates.lastSyncTime);
      } else {
        await AsyncStorage.removeItem(LAST_SYNC_KEY);
      }
    }
  } catch (error) {
    console.error("[SyncStatus] Failed to update sync status:", error);
  }
}

// ============================================
// 통합 동기화 함수
// ============================================

/**
 * 강화된 전체 동기화
 * - 백업 생성
 * - 지수 백오프 재시도
 * - 큐 처리
 * - 상태 업데이트
 */
export async function enhancedFullSync(
  trpcClient: ReturnType<typeof trpc.useUtils>,
  options?: {
    forceRetry?: boolean; // 실패한 큐 항목도 재시도
    onProgress?: (current: number, total: number) => void;
  }
): Promise<{
  synced: number;
  failed: number;
  restored: number;
  fromQueue: number;
}> {
  const result = {
    synced: 0,
    failed: 0,
    restored: 0,
    fromQueue: 0,
  };
  
  try {
    // 1. 네트워크 상태 확인
    const isOnline = await checkNetworkStatus();
    if (!isOnline) {
      console.log("[EnhancedSync] Offline - skipping sync");
      await updateSyncStatus({ isOnline: false });
      return result;
    }
    
    // 2. 백업에서 복원 시도 (데이터 유실 방지)
    const restoreResult = await restoreFromBackup();
    result.restored = restoreResult.restored;
    
    // 3. 현재 기록 백업
    await backupAllRecords();
    
    // 4. 미동기화 기록 가져오기
    const records = await getRidingRecords();
    const unsyncedRecords = records.filter(r => !r.synced);
    
    // 5. 큐에 있는 기록 가져오기
    const queue = await getSyncQueue();
    const queueRecordIds = new Set(queue.map(item => item.recordId));
    
    // 6. 동기화할 기록 목록 생성
    const toSync: RidingRecord[] = [];
    
    // 미동기화 기록 추가
    for (const record of unsyncedRecords) {
      if (!queueRecordIds.has(record.id)) {
        toSync.push(record);
      }
    }
    
    // 큐에 있는 기록 추가 (forceRetry 옵션에 따라)
    if (options?.forceRetry) {
      for (const queueItem of queue) {
        const record = records.find(r => r.id === queueItem.recordId);
        if (record) {
          toSync.push(record);
        }
      }
    } else {
      // 재시도 횟수가 적은 것만 추가
      for (const queueItem of queue) {
        if (queueItem.retryCount < MAX_RETRY_COUNT) {
          const record = records.find(r => r.id === queueItem.recordId);
          if (record) {
            toSync.push(record);
          }
        }
      }
    }
    
    const total = toSync.length;
    console.log(`[EnhancedSync] Starting sync of ${total} records`);
    
    // 7. 각 기록 동기화
    for (let i = 0; i < toSync.length; i++) {
      const record = toSync[i];
      
      if (options?.onProgress) {
        options.onProgress(i + 1, total);
      }
      
      const syncResult = await syncRecordWithRetry(record, trpcClient);
      
      if (syncResult.success) {
        result.synced++;
        if (queueRecordIds.has(record.id)) {
          result.fromQueue++;
        }
      } else {
        result.failed++;
      }
    }
    
    // 8. 동기화 상태 업데이트
    await updateSyncStatus({
      isOnline: true,
      lastSyncTime: new Date().toISOString(),
      lastError: result.failed > 0 ? `${result.failed} records failed to sync` : null,
    });
    
    // 9. 최종 백업
    await backupAllRecords();
    
    console.log("[EnhancedSync] Sync completed:", result);
    return result;
  } catch (error: any) {
    console.error("[EnhancedSync] Sync failed:", error);
    await updateSyncStatus({
      lastError: error?.message || String(error),
    });
    return result;
  }
}

/**
 * 백그라운드 동기화 시작 (네트워크 복구 시 자동 동기화)
 */
let backgroundSyncUnsubscribe: (() => void) | null = null;

export function startBackgroundSync(
  trpcClient: ReturnType<typeof trpc.useUtils>
): void {
  if (backgroundSyncUnsubscribe) {
    return; // 이미 실행 중
  }
  
  let wasOffline = false;
  
  backgroundSyncUnsubscribe = subscribeToNetworkChanges(async (isOnline) => {
    if (isOnline && wasOffline) {
      console.log("[BackgroundSync] Network restored - starting sync");
      await enhancedFullSync(trpcClient);
    }
    wasOffline = !isOnline;
  });
  
  console.log("[BackgroundSync] Started");
}

export function stopBackgroundSync(): void {
  if (backgroundSyncUnsubscribe) {
    backgroundSyncUnsubscribe();
    backgroundSyncUnsubscribe = null;
    console.log("[BackgroundSync] Stopped");
  }
}
