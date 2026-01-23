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
}

export interface RidingStats {
  totalDistance: number; // meters
  totalDuration: number; // seconds
  totalRides: number;
  avgSpeed: number; // km/h
}

const STORAGE_KEY = "scoop_riding_records";
const GPS_STORAGE_PREFIX = "scoop_gps_track_";
const SYNC_STATUS_KEY = "scoop_sync_status";

// Save riding record locally
export async function saveRidingRecord(record: RidingRecord): Promise<void> {
  try {
    // Save GPS points separately to avoid storage limits
    if (record.gpsPoints && record.gpsPoints.length > 0) {
      await AsyncStorage.setItem(
        `${GPS_STORAGE_PREFIX}${record.id}`,
        JSON.stringify(record.gpsPoints)
      );
    }

    // Save record without GPS points in main storage
    const recordWithoutGps = { ...record, synced: false };
    delete recordWithoutGps.gpsPoints;

    const existing = await getRidingRecords();
    const updated = [recordWithoutGps, ...existing];
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (error) {
    console.error("Failed to save riding record:", error);
  }
}

// Get all local riding records
export async function getRidingRecords(): Promise<RidingRecord[]> {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEY);
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

    // Load GPS points
    const gpsData = await AsyncStorage.getItem(`${GPS_STORAGE_PREFIX}${id}`);
    if (gpsData) {
      record.gpsPoints = JSON.parse(gpsData);
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
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    
    // Also delete GPS data
    await AsyncStorage.removeItem(`${GPS_STORAGE_PREFIX}${id}`);
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
    
    // Delete all GPS data
    for (const record of records) {
      await AsyncStorage.removeItem(`${GPS_STORAGE_PREFIX}${record.id}`);
    }
    
    // Clear main records
    await AsyncStorage.removeItem(STORAGE_KEY);
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
    
    // Get GPS points for this record
    const recordWithGps = await getRidingRecordWithGps(record.id);
    const gpsPointsJson = recordWithGps?.gpsPoints 
      ? JSON.stringify(recordWithGps.gpsPoints)
      : undefined;

    // Validate startTime and endTime are valid ISO strings
    const startTime = record.startTime && record.startTime.length > 0 ? record.startTime : undefined;
    const endTime = record.endTime && record.endTime.length > 0 ? record.endTime : undefined;
    
    console.log("[Sync] Uploading record:", record.id, "date:", record.date);
    
    // Get the latest token directly from SecureStore
    const token = await Auth.getSessionToken();
    console.log("[Sync] Token status:", token ? `present (${token.substring(0, 30)}...)` : "MISSING");
    
    if (!token && Platform.OS !== "web") {
      console.error("[Sync] No auth token available - user needs to re-login");
      return false;
    }
    
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
    
    const baseUrl = getApiBaseUrl();
    const url = `${baseUrl}/api/trpc/rides.create`;
    
    console.log("[Sync] Making direct fetch to:", url);
    
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    
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
    
    const responseData = await response.json();
    console.log("[Sync] Response data:", JSON.stringify(responseData).substring(0, 200));
    
    // tRPC wraps response in result.data.json
    const result = responseData?.result?.data?.json;
    
    if (result?.success) {
      // Mark as synced locally
      await markRecordAsSynced(record.id);
      console.log("[Sync] Record marked as synced:", record.id);
      return true;
    }
    
    console.log("[Sync] Upload failed - result.success is false or missing");
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
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
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

    // Save merged records
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(localRecords));

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
