import { Platform, Share } from "react-native";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system";
import { RidingRecord, formatDuration } from "./riding-store";

/**
 * Generate a shareable text summary of a ride
 */
export function generateRideSummary(record: RidingRecord): string {
  const date = new Date(record.date).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  
  const distanceKm = (record.distance / 1000).toFixed(2);
  const duration = formatDuration(record.duration);
  const avgSpeed = record.avgSpeed.toFixed(1);
  const maxSpeed = record.maxSpeed.toFixed(1);
  
  return `🛴 SCOOP 주행 기록

📅 ${date}
📏 거리: ${distanceKm}km
⏱️ 시간: ${duration}
⚡ 평균 속도: ${avgSpeed}km/h
🚀 최고 속도: ${maxSpeed}km/h

#SCOOP #전동킥보드 #라이딩`;
}

/**
 * Share ride as text
 */
export async function shareRideAsText(record: RidingRecord): Promise<boolean> {
  try {
    const message = generateRideSummary(record);
    
    if (Platform.OS === "web") {
      // Web: use navigator.share if available
      if (navigator.share) {
        await navigator.share({
          title: "SCOOP 주행 기록",
          text: message,
        });
        return true;
      } else {
        // Fallback: copy to clipboard
        await navigator.clipboard.writeText(message);
        return true;
      }
    } else {
      // Native: use Share API
      const result = await Share.share({
        message,
        title: "SCOOP 주행 기록",
      });
      
      return result.action === Share.sharedAction;
    }
  } catch (error) {
    console.error("Share error:", error);
    return false;
  }
}

/**
 * Generate ride summary image data (for future implementation)
 * Returns a base64 encoded image or null if generation fails
 */
export async function generateRideImage(record: RidingRecord): Promise<string | null> {
  // This would require react-native-view-shot or similar library
  // For now, return null and use text sharing
  return null;
}

/**
 * Share ride with options
 */
export async function shareRide(
  record: RidingRecord,
  options: {
    includeGpx?: boolean;
    includeImage?: boolean;
  } = {}
): Promise<boolean> {
  const { includeGpx = false, includeImage = false } = options;
  
  // For now, just share as text
  // GPX sharing is handled separately in ride-detail.tsx
  return shareRideAsText(record);
}

/**
 * Check if sharing is available on this platform
 */
export async function isSharingAvailable(): Promise<boolean> {
  if (Platform.OS === "web") {
    return typeof navigator !== "undefined" && (!!navigator.share || !!navigator.clipboard);
  }
  return await Sharing.isAvailableAsync();
}
