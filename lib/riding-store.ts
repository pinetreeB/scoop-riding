import AsyncStorage from "@react-native-async-storage/async-storage";

export interface RidingRecord {
  id: string;
  date: string;
  duration: number; // seconds
  distance: number; // meters
  avgSpeed: number; // km/h
  maxSpeed: number; // km/h
  startTime: string;
  endTime: string;
}

export interface RidingStats {
  totalDistance: number; // meters
  totalDuration: number; // seconds
  totalRides: number;
  avgSpeed: number; // km/h
}

const STORAGE_KEY = "scoop_riding_records";

export async function saveRidingRecord(record: RidingRecord): Promise<void> {
  try {
    const existing = await getRidingRecords();
    const updated = [record, ...existing];
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (error) {
    console.error("Failed to save riding record:", error);
  }
}

export async function getRidingRecords(): Promise<RidingRecord[]> {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error("Failed to get riding records:", error);
    return [];
  }
}

export async function deleteRidingRecord(id: string): Promise<void> {
  try {
    const existing = await getRidingRecords();
    const updated = existing.filter((r) => r.id !== id);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (error) {
    console.error("Failed to delete riding record:", error);
  }
}

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
