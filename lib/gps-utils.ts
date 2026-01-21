import * as Location from "expo-location";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";

export interface GpsPoint {
  latitude: number;
  longitude: number;
  altitude: number | null;
  timestamp: number;
  speed: number | null; // m/s
  accuracy: number | null;
}

export interface TrackData {
  points: GpsPoint[];
  startTime: Date;
  endTime: Date;
  name: string;
}

/**
 * Request location permissions
 */
export async function requestLocationPermission(): Promise<boolean> {
  try {
    const { status: foregroundStatus } =
      await Location.requestForegroundPermissionsAsync();

    if (foregroundStatus !== "granted") {
      return false;
    }

    // For background location (optional, for future use)
    // const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();

    return true;
  } catch (error) {
    console.error("Error requesting location permission:", error);
    return false;
  }
}

/**
 * Check if location services are enabled
 */
export async function isLocationEnabled(): Promise<boolean> {
  try {
    const enabled = await Location.hasServicesEnabledAsync();
    return enabled;
  } catch (error) {
    console.error("Error checking location services:", error);
    return false;
  }
}

/**
 * Calculate distance between two GPS points using Haversine formula
 * Returns distance in meters
 */
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}

/**
 * Convert speed from m/s to km/h
 */
export function msToKmh(ms: number): number {
  return ms * 3.6;
}

/**
 * Generate GPX XML content from track data
 */
export function generateGpxContent(track: TrackData): string {
  const formatDate = (date: Date) => date.toISOString();

  const trackPoints = track.points
    .map((point) => {
      const ele = point.altitude !== null ? `      <ele>${point.altitude.toFixed(1)}</ele>\n` : "";
      const time = `      <time>${new Date(point.timestamp).toISOString()}</time>\n`;
      const speed =
        point.speed !== null
          ? `      <extensions>\n        <speed>${point.speed.toFixed(2)}</speed>\n      </extensions>\n`
          : "";
      return `    <trkpt lat="${point.latitude.toFixed(7)}" lon="${point.longitude.toFixed(7)}">\n${ele}${time}${speed}    </trkpt>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="SCOOP Riding App"
  xmlns="http://www.topografix.com/GPX/1/1"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
  <metadata>
    <name>${escapeXml(track.name)}</name>
    <time>${formatDate(track.startTime)}</time>
  </metadata>
  <trk>
    <name>${escapeXml(track.name)}</name>
    <trkseg>
${trackPoints}
    </trkseg>
  </trk>
</gpx>`;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Save GPX file and share/download it
 */
export async function saveAndShareGpx(
  track: TrackData,
  filename: string
): Promise<boolean> {
  try {
    const gpxContent = generateGpxContent(track);
    const fileUri = `${FileSystem.documentDirectory || ''}${filename}.gpx`;

    await FileSystem.writeAsStringAsync(fileUri, gpxContent, {
      encoding: 'utf8',
    });

    if (Platform.OS === "web") {
      // For web, create a download link
      const blob = new Blob([gpxContent], { type: "application/gpx+xml" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${filename}.gpx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      return true;
    }

    // For native platforms, use sharing
    const isAvailable = await Sharing.isAvailableAsync();
    if (isAvailable) {
      await Sharing.shareAsync(fileUri, {
        mimeType: "application/gpx+xml",
        dialogTitle: "GPX 파일 공유",
        UTI: "com.topografix.gpx",
      });
      return true;
    }

    return false;
  } catch (error) {
    console.error("Error saving GPX file:", error);
    return false;
  }
}

/**
 * Calculate total distance from GPS points
 */
export function calculateTotalDistance(points: GpsPoint[]): number {
  if (points.length < 2) return 0;

  let totalDistance = 0;
  for (let i = 1; i < points.length; i++) {
    totalDistance += calculateDistance(
      points[i - 1].latitude,
      points[i - 1].longitude,
      points[i].latitude,
      points[i].longitude
    );
  }
  return totalDistance;
}

/**
 * Calculate average speed from GPS points (km/h)
 */
export function calculateAverageSpeed(points: GpsPoint[]): number {
  if (points.length === 0) return 0;

  const validSpeeds = points
    .filter((p) => p.speed !== null && p.speed >= 0)
    .map((p) => msToKmh(p.speed!));

  if (validSpeeds.length === 0) return 0;

  return validSpeeds.reduce((a, b) => a + b, 0) / validSpeeds.length;
}

/**
 * Get maximum speed from GPS points (km/h)
 */
export function getMaxSpeed(points: GpsPoint[]): number {
  if (points.length === 0) return 0;

  const validSpeeds = points
    .filter((p) => p.speed !== null && p.speed >= 0)
    .map((p) => msToKmh(p.speed!));

  if (validSpeeds.length === 0) return 0;

  return Math.max(...validSpeeds);
}
