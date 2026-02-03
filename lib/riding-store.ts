import AsyncStorage from "@react-native-async-storage/async-storage";
import { GpsPoint } from "./gps-utils";
import { trpc } from "./trpc";

export interface RidingRecord {
  id: string;
  date: string;
  duration: number; // seconds
  distance: number; // meters
  avgSpeed: number; // km/h
  maxSpeed: number; // km/h
  startTime: string;
  endTime: string;
  gpsPoints?: GpsPoint[]; // GPS track points for GPX export
  synced?: boolean; // Whether this record has been synced to cloud
  scooterId?: number; // Scooter used for this ride
  scooterName?: string; // Scooter name (for display)
  // Group riding info
  groupId?: number; // Group session ID if this was a group ride
  groupName?: string; // Group name
  groupMembers?: { userId: number; name: string | null }[]; // Members who rode together
  // Battery voltage tracking
  voltageStart?: number; // Starting voltage
  voltageEnd?: number; // Ending voltage
  socStart?: number; // Starting SOC percentage
  socEnd?: number; // Ending SOC percentage
  energyWh?: number; // Energy consumed in Wh
  // Weather info at ride start
  temperature?: number; // 온도 (°C)
  humidity?: number; // 습도 (%)
  windSpeed?: number; // 풍속 (m/s)
  weatherCondition?: string; // 날씨 상태 (맑음/흐림/비/눈 등)
}

export interface RidingStats {
  totalDistance: number; // meters
  totalDuration: number; // seconds
  totalRides: number;
  avgSpeed: number; // km/h
}

const STORAGE_KEY_PREFIX = "scoop_riding_records";
const GPS_STORAGE_PREFIX = "scoop_gps_track_";
const SYNC_STATUS_KEY = "scoop_sync_status";
const USER_ID_KEY = "scoop_current_user_id";

// Get storage key for current user (user-specific data isolation)
async function getStorageKey(): Promise<string> {
  try {
    const userId = await AsyncStorage.getItem(USER_ID_KEY);
    if (userId) {
      return `${STORAGE_KEY_PREFIX}_${userId}`;
    }
  } catch (error) {
    console.error("Failed to get user ID for storage key:", error);
  }
  // Fallback to legacy key for backward compatibility
  return STORAGE_KEY_PREFIX;
}

// Set current user ID for data isolation
export async function setCurrentUserId(userId: number | string | null): Promise<void> {
  try {
    if (userId) {
      await AsyncStorage.setItem(USER_ID_KEY, String(userId));
      console.log("[RidingStore] Set current user ID:", userId);
    } else {
      await AsyncStorage.removeItem(USER_ID_KEY);
      console.log("[RidingStore] Cleared current user ID");
    }
  } catch (error) {
    console.error("Failed to set user ID:", error);
  }
}

// Get GPS storage key for current user
async function getGpsStorageKey(recordId: string): Promise<string> {
  const userId = await AsyncStorage.getItem(USER_ID_KEY);
  if (userId) {
    return `${GPS_STORAGE_PREFIX}${userId}_${recordId}`;
  }
  return `${GPS_STORAGE_PREFIX}${recordId}`;
}

// Downsample GPS points to reduce data size for long rides
// Keeps every Nth point based on total count, always keeping first and last
function downsampleGpsPoints(points: GpsPoint[], maxPoints: number = 3600): GpsPoint[] {
  if (points.length <= maxPoints) return points;
  
  const step = Math.ceil(points.length / maxPoints);
  const result: GpsPoint[] = [points[0]]; // Always keep first point
  
  for (let i = step; i < points.length - 1; i += step) {
    result.push(points[i]);
  }
  
  result.push(points[points.length - 1]); // Always keep last point
  console.log(`[RidingStore] Downsampled GPS points from ${points.length} to ${result.length}`);
  return result;
}

// Save GPS points in chunks to handle AsyncStorage limits
async function saveGpsPointsInChunks(recordId: string, points: GpsPoint[]): Promise<void> {
  const CHUNK_SIZE = 1000; // Points per chunk
  const chunks = Math.ceil(points.length / CHUNK_SIZE);
  
  console.log(`[RidingStore] Saving ${points.length} GPS points in ${chunks} chunks`);
  
  // Save chunk count metadata
  const metaKey = await getGpsStorageKey(recordId);
  await AsyncStorage.setItem(`${metaKey}_meta`, JSON.stringify({ chunks, totalPoints: points.length }));
  
  // Save each chunk
  for (let i = 0; i < chunks; i++) {
    const start = i * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, points.length);
    const chunk = points.slice(start, end);
    const chunkKey = `${metaKey}_chunk_${i}`;
    
    await AsyncStorage.setItem(chunkKey, JSON.stringify(chunk));
    console.log(`[RidingStore] Saved chunk ${i + 1}/${chunks} (${chunk.length} points)`);
  }
}

// Load GPS points from chunks
async function loadGpsPointsFromChunks(recordId: string): Promise<GpsPoint[] | null> {
  try {
    const metaKey = await getGpsStorageKey(recordId);
    const metaData = await AsyncStorage.getItem(`${metaKey}_meta`);
    
    if (!metaData) {
      // Try legacy single-key format
      const legacyData = await AsyncStorage.getItem(metaKey);
      return legacyData ? JSON.parse(legacyData) : null;
    }
    
    const { chunks } = JSON.parse(metaData);
    const allPoints: GpsPoint[] = [];
    
    for (let i = 0; i < chunks; i++) {
      const chunkKey = `${metaKey}_chunk_${i}`;
      const chunkData = await AsyncStorage.getItem(chunkKey);
      if (chunkData) {
        allPoints.push(...JSON.parse(chunkData));
      }
    }
    
    console.log(`[RidingStore] Loaded ${allPoints.length} GPS points from ${chunks} chunks`);
    return allPoints;
  } catch (error) {
    console.error('[RidingStore] Failed to load GPS chunks:', error);
    return null;
  }
}

// Save riding record locally with retry logic
export async function saveRidingRecord(record: RidingRecord, retryCount = 0): Promise<void> {
  const MAX_RETRIES = 3;
  
  try {
    console.log(`[RidingStore] Saving record ${record.id} (attempt ${retryCount + 1}/${MAX_RETRIES + 1})`);
    console.log(`[RidingStore] Record data: distance=${record.distance}m, duration=${record.duration}s, gpsPoints=${record.gpsPoints?.length || 0}`);
    
    // Save GPS points separately to avoid storage limits (user-specific)
    if (record.gpsPoints && record.gpsPoints.length > 0) {
      // Downsample if too many points (more than 1 hour of 1-second intervals)
      const optimizedPoints = downsampleGpsPoints(record.gpsPoints, 3600);
      
      // Use chunked storage for large datasets
      if (optimizedPoints.length > 1000) {
        await saveGpsPointsInChunks(record.id, optimizedPoints);
      } else {
        const gpsKey = await getGpsStorageKey(record.id);
        console.log(`[RidingStore] Saving ${optimizedPoints.length} GPS points to key: ${gpsKey}`);
        await AsyncStorage.setItem(gpsKey, JSON.stringify(optimizedPoints));
      }
      console.log(`[RidingStore] GPS points saved successfully`);
    }

    // Save record without GPS points in main storage (user-specific)
    const recordWithoutGps = { ...record, synced: false };
    delete recordWithoutGps.gpsPoints;

    const existing = await getRidingRecords();
    console.log(`[RidingStore] Existing records count: ${existing.length}`);
    
    const updated = [recordWithoutGps, ...existing];
    const storageKey = await getStorageKey();
    console.log(`[RidingStore] Saving to storage key: ${storageKey}`);
    
    await AsyncStorage.setItem(storageKey, JSON.stringify(updated));
    
    // Verify the save was successful
    const verifyData = await AsyncStorage.getItem(storageKey);
    if (!verifyData) {
      throw new Error("Verification failed: saved data is empty");
    }
    
    const verifyRecords = JSON.parse(verifyData);
    const savedRecord = verifyRecords.find((r: RidingRecord) => r.id === record.id);
    if (!savedRecord) {
      throw new Error("Verification failed: record not found after save");
    }
    
    console.log(`[RidingStore] Record ${record.id} saved and verified successfully. Total records: ${verifyRecords.length}`);
  } catch (error) {
    console.error(`[RidingStore] Failed to save riding record (attempt ${retryCount + 1}):`, error);
    
    // Retry if we haven't exceeded max retries
    if (retryCount < MAX_RETRIES) {
      console.log(`[RidingStore] Retrying save in 500ms...`);
      await new Promise(resolve => setTimeout(resolve, 500));
      return saveRidingRecord(record, retryCount + 1);
    }
    
    // If all retries failed, throw the error to be handled by caller
    throw error;
  }
}

// Get all local riding records
export async function getRidingRecords(): Promise<RidingRecord[]> {
  try {
    const storageKey = await getStorageKey();
    const data = await AsyncStorage.getItem(storageKey);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error("Failed to get riding records:", error);
    return [];
  }
}

// Get a single record with GPS data
export async function getRidingRecordWithGps(id: string): Promise<RidingRecord | null> {
  try {
    const records = await getRidingRecords();
    const record = records.find((r) => r.id === id);
    
    if (!record) return null;

    // Load GPS points - try chunked format first, then legacy
    const gpsPoints = await loadGpsPointsFromChunks(id);
    if (gpsPoints && gpsPoints.length > 0) {
      record.gpsPoints = gpsPoints;
    }

    return record;
  } catch (error) {
    console.error("Failed to get riding record with GPS:", error);
    return null;
  }
}

// Delete a local record
export async function deleteRidingRecord(id: string): Promise<void> {
  try {
    const existing = await getRidingRecords();
    const updated = existing.filter((r) => r.id !== id);
    const storageKey = await getStorageKey();
    await AsyncStorage.setItem(storageKey, JSON.stringify(updated));
    
    // Also delete GPS data (user-specific)
    const gpsKey = await getGpsStorageKey(id);
    await AsyncStorage.removeItem(gpsKey);
  } catch (error) {
    console.error("Failed to delete riding record:", error);
  }
}

// Delete record from cloud
export async function deleteRecordFromCloud(
  recordId: string,
  trpcClient: ReturnType<typeof trpc.useUtils>
): Promise<boolean> {
  try {
    const result = await trpcClient.client.rides.delete.mutate({ recordId });
    return result.success;
  } catch (error) {
    console.error("Failed to delete record from cloud:", error);
    return false;
  }
}

// Delete record from both local and cloud
export async function deleteRecordEverywhere(
  recordId: string,
  trpcClient: ReturnType<typeof trpc.useUtils>
): Promise<boolean> {
  // Delete from local first
  await deleteRidingRecord(recordId);
  
  // Then try to delete from cloud
  try {
    await deleteRecordFromCloud(recordId, trpcClient);
  } catch (error) {
    // Cloud deletion failed, but local is already deleted
    console.error("Cloud deletion failed:", error);
  }
  
  return true;
}

// Get riding statistics
export async function getRidingStats(): Promise<RidingStats> {
  const records = await getRidingRecords();
  
  if (records.length === 0) {
    return {
      totalDistance: 0,
      totalDuration: 0,
      totalRides: 0,
      avgSpeed: 0,
    };
  }

  const totalDistance = records.reduce((sum, r) => sum + r.distance, 0);
  const totalDuration = records.reduce((sum, r) => sum + r.duration, 0);
  const avgSpeed = totalDuration > 0 
    ? (totalDistance / 1000) / (totalDuration / 3600) 
    : 0;

  return {
    totalDistance,
    totalDuration,
    totalRides: records.length,
    avgSpeed,
  };
}

// Format helpers
export function formatDuration(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

export function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${meters.toFixed(0)} m`;
  }
  return `${(meters / 1000).toFixed(2)} km`;
}

export function formatSpeed(kmh: number): string {
  return `${kmh.toFixed(1)} km/h`;
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// Clear all local records
export async function clearAllRecords(): Promise<void> {
  try {
    // Get all records to find GPS data keys
    const records = await getRidingRecords();
    
    // Delete all GPS data (user-specific)
    for (const record of records) {
      const gpsKey = await getGpsStorageKey(record.id);
      await AsyncStorage.removeItem(gpsKey);
    }
    
    // Clear main records (user-specific)
    const storageKey = await getStorageKey();
    await AsyncStorage.removeItem(storageKey);
  } catch (error) {
    console.error("Failed to clear all records:", error);
  }
}

// ============================================
// Cloud Sync Functions
// ============================================

// Sync a single record to cloud using direct fetch API
// This ensures we always get the latest token from SecureStore
export async function syncRecordToCloud(
  record: RidingRecord,
  _trpcClient?: ReturnType<typeof trpc.useUtils> // Kept for backward compatibility but not used
): Promise<boolean> {
  try {
    // Import dependencies dynamically to avoid circular imports
    const { Platform } = await import("react-native");
    const { getApiBaseUrl } = await import("@/constants/oauth");
    const Auth = await import("@/lib/_core/auth");
    
    // Get the latest token directly from SecureStore
    const token = await Auth.getSessionToken();
    console.log("[Sync] Token status:", token ? `present (${token.substring(0, 30)}...)` : "MISSING");
    
    if (!token && Platform.OS !== "web") {
      console.error("[Sync] No auth token available - user needs to re-login");
      return false;
    }
    
    const baseUrl = getApiBaseUrl();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    
    // First, check if record already exists on server
    try {
      const checkUrl = `${baseUrl}/api/trpc/rides.get?input=${encodeURIComponent(JSON.stringify({ json: { recordId: record.id } }))}`;
      console.log("[Sync] Checking if record exists:", record.id);
      const checkResponse = await fetch(checkUrl, { headers, credentials: "include" });
      if (checkResponse.ok) {
        const checkData = await checkResponse.json();
        const existingRecord = checkData?.result?.data?.json;
        if (existingRecord && existingRecord.id) {
          console.log("[Sync] Record already exists on server, marking as synced:", record.id);
          await markRecordAsSynced(record.id);
          return true;
        }
      }
    } catch (checkError) {
      console.log("[Sync] Check failed, proceeding with upload:", checkError);
    }
    
    // Get GPS points for this record
    const recordWithGps = await getRidingRecordWithGps(record.id);
    let gpsPointsJson = recordWithGps?.gpsPoints 
      ? JSON.stringify(recordWithGps.gpsPoints)
      : undefined;
    
    // Log GPS data size for debugging
    const gpsDataSize = gpsPointsJson ? gpsPointsJson.length : 0;
    console.log(`[Sync] GPS data size: ${(gpsDataSize / 1024).toFixed(2)} KB, points: ${recordWithGps?.gpsPoints?.length || 0}`);
    
    // If GPS data is too large (> 10MB), skip it to prevent upload failure
    // The record will still be saved without GPS track
    if (gpsDataSize > 10 * 1024 * 1024) {
      console.warn(`[Sync] GPS data too large (${(gpsDataSize / 1024 / 1024).toFixed(2)} MB), uploading without GPS track`);
      gpsPointsJson = undefined;
    }

    // Validate startTime and endTime are valid ISO strings
    const startTime = record.startTime && record.startTime.length > 0 ? record.startTime : undefined;
    const endTime = record.endTime && record.endTime.length > 0 ? record.endTime : undefined;
    
    console.log("[Sync] Uploading record:", record.id, "date:", record.date);
    
    // Build request body for tRPC
    const requestBody = {
      json: {
        recordId: record.id,
        date: record.date,
        duration: Math.round(record.duration),
        distance: Math.round(record.distance),
        avgSpeed: record.avgSpeed,
        maxSpeed: record.maxSpeed,
        startTime,
        endTime,
        gpsPointsJson,
      }
    };
    
    const url = `${baseUrl}/api/trpc/rides.create`;
    
    console.log("[Sync] Making direct fetch to:", url);
    
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody),
      credentials: "include",
    });
    
    console.log("[Sync] Response status:", response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Sync] Server error:", response.status, errorText);
      
      // Check for auth errors
      if (response.status === 401) {
        console.error("[Sync] Authentication error (401) - user needs to re-login");
      }
      return false;
    }
    
    const responseText = await response.text();
    console.log("[Sync] Response text:", responseText.substring(0, 300));
    
    // Parse response
    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch (parseError) {
      console.error("[Sync] Failed to parse response JSON:", parseError);
      // If response status is 200 but can't parse, still consider it a success
      // (server might have saved the record)
      if (response.status === 200) {
        console.log("[Sync] Status 200, marking as synced despite parse error");
        await markRecordAsSynced(record.id);
        return true;
      }
      return false;
    }
    
    // tRPC wraps response in result.data.json
    const result = responseData?.result?.data?.json;
    console.log("[Sync] Parsed result:", JSON.stringify(result));
    
    // Check for success - either explicit success:true or presence of id
    if (result?.success || result?.id || result?.duplicate) {
      // Mark as synced locally
      await markRecordAsSynced(record.id);
      console.log("[Sync] Record marked as synced:", record.id);
      return true;
    }
    
    // If response status is 200, consider it a success even if result parsing fails
    if (response.status === 200) {
      console.log("[Sync] Status 200, marking as synced");
      await markRecordAsSynced(record.id);
      return true;
    }
    
    console.log("[Sync] Upload failed - result.success is false or missing, status:", response.status);
    return false;
  } catch (error: any) {
    // Check if it's a duplicate key error (record already exists)
    if (error?.message?.includes('Duplicate') || error?.message?.includes('duplicate')) {
      console.log("[Sync] Record already exists on server, marking as synced:", record.id);
      await markRecordAsSynced(record.id);
      return true;
    }
    // Log detailed error info for debugging
    console.error("[Sync] Failed to sync record to cloud:", {
      recordId: record.id,
      errorMessage: error?.message || String(error),
      errorCode: error?.data?.code || error?.code,
      errorStack: error?.stack?.substring(0, 500),
    });
    return false;
  }
}

// Mark a record as synced
async function markRecordAsSynced(id: string): Promise<void> {
  try {
    const records = await getRidingRecords();
    const updated = records.map((r) => 
      r.id === id ? { ...r, synced: true } : r
    );
    const storageKey = await getStorageKey();
    await AsyncStorage.setItem(storageKey, JSON.stringify(updated));
  } catch (error) {
    console.error("Failed to mark record as synced:", error);
  }
}

// Sync all unsynced records to cloud
export async function syncAllToCloud(
  trpcClient: ReturnType<typeof trpc.useUtils>
): Promise<{ synced: number; failed: number }> {
  const records = await getRidingRecords();
  const unsyncedRecords = records.filter((r) => !r.synced);
  
  let synced = 0;
  let failed = 0;

  for (const record of unsyncedRecords) {
    const success = await syncRecordToCloud(record, trpcClient);
    if (success) {
      synced++;
    } else {
      failed++;
    }
  }

  return { synced, failed };
}

// Fetch records from cloud and merge with local
export async function fetchAndMergeFromCloud(
  trpcClient: ReturnType<typeof trpc.useUtils>
): Promise<{ added: number; total: number }> {
  try {
    // Fetch from cloud
    const cloudRecords = await trpcClient.client.rides.list.query();
    
    // Get local records
    const localRecords = await getRidingRecords();
    const localIds = new Set(localRecords.map((r) => r.id));
    
    // Find records that exist in cloud but not locally
    let added = 0;
    for (const cloudRecord of cloudRecords) {
      if (!localIds.has(cloudRecord.recordId)) {
        // Convert cloud record to local format
        const localRecord: RidingRecord = {
          id: cloudRecord.recordId,
          date: cloudRecord.date,
          duration: cloudRecord.duration,
          distance: cloudRecord.distance,
          avgSpeed: cloudRecord.avgSpeed / 10, // Convert back from stored format
          maxSpeed: cloudRecord.maxSpeed / 10,
          startTime: cloudRecord.startTime?.toISOString() || "",
          endTime: cloudRecord.endTime?.toISOString() || "",
          synced: true,
        };

        // Save GPS points if available
        if (cloudRecord.gpsPointsJson) {
          try {
            const gpsPoints = JSON.parse(cloudRecord.gpsPointsJson);
            await AsyncStorage.setItem(
              `${GPS_STORAGE_PREFIX}${localRecord.id}`,
              JSON.stringify(gpsPoints)
            );
          } catch (e) {
            console.error("Failed to parse GPS points:", e);
          }
        }

        localRecords.push(localRecord);
        added++;
      }
    }

    // Sort by date (newest first)
    localRecords.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());

    // Save merged records (user-specific)
    const storageKey = await getStorageKey();
    await AsyncStorage.setItem(storageKey, JSON.stringify(localRecords));

    return { added, total: localRecords.length };
  } catch (error) {
    console.error("Failed to fetch and merge from cloud:", error);
    return { added: 0, total: 0 };
  }
}

// Full sync: upload local, download cloud, merge
export async function fullSync(
  trpcClient: ReturnType<typeof trpc.useUtils>
): Promise<{ uploaded: number; downloaded: number; failed: number }> {
  // First sync local to cloud
  const uploadResult = await syncAllToCloud(trpcClient);
  
  // Then fetch and merge from cloud
  const downloadResult = await fetchAndMergeFromCloud(trpcClient);

  return {
    uploaded: uploadResult.synced,
    downloaded: downloadResult.added,
    failed: uploadResult.failed,
  };
}

// Delete record from both local and cloud
export async function deleteRecordWithSync(
  id: string,
  trpcClient: ReturnType<typeof trpc.useUtils>
): Promise<boolean> {
  try {
    // Delete from cloud first
    await trpcClient.client.rides.delete.mutate({ recordId: id });
    
    // Then delete locally
    await deleteRidingRecord(id);
    
    return true;
  } catch (error) {
    console.error("Failed to delete record with sync:", error);
    // Still try to delete locally
    await deleteRidingRecord(id);
    return false;
  }
}
