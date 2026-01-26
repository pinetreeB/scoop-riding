import * as Location from "expo-location";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";

// GPS filtering constants
export const GPS_CONSTANTS = {
  MIN_SPEED_THRESHOLD: 1.0, // km/h - speeds below this are considered stationary
  MIN_ACCURACY_THRESHOLD: 100, // meters - ignore points with worse accuracy (relaxed for tunnels/poor signal)
  MAX_SPEED_JUMP: 100, // km/h - maximum allowed speed change between readings (relaxed for high speed)
  MAX_DISTANCE_JUMP: 300, // meters - maximum allowed distance between consecutive points (relaxed for high speed)
  MIN_TIME_BETWEEN_POINTS: 500, // ms - minimum time between valid points (reduced for better tracking)
  BACKWARD_MOVEMENT_THRESHOLD: 20, // meters - detect backward movement (relaxed)
  MAX_REALISTIC_SPEED: 300, // km/h - maximum realistic speed (supports high-speed riding)
  GPS_SPIKE_THRESHOLD: 500, // meters - distance that indicates GPS spike (relaxed for tunnels)
  CONSECUTIVE_INVALID_LIMIT: 10, // number of consecutive invalid points before resetting (increased for tunnels)
};

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

    return true;
  } catch (error) {
    console.error("Error requesting location permission:", error);
    return false;
  }
}

/**
 * Request background location permission
 */
export async function requestBackgroundLocationPermission(): Promise<boolean> {
  try {
    const { status } = await Location.requestBackgroundPermissionsAsync();
    return status === "granted";
  } catch (error) {
    console.error("Error requesting background location permission:", error);
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
 * Convert speed from km/h to m/s
 */
export function kmhToMs(kmh: number): number {
  return kmh / 3.6;
}

/**
 * Calculate bearing between two points (in degrees)
 */
export function calculateBearing(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const dLon = toRad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
  const bearing = Math.atan2(y, x);
  return ((bearing * 180) / Math.PI + 360) % 360;
}

/**
 * Check if movement is backward relative to previous direction
 */
export function isBackwardMovement(
  prevBearing: number | null,
  currentBearing: number
): boolean {
  if (prevBearing === null) return false;
  
  let diff = Math.abs(currentBearing - prevBearing);
  if (diff > 180) diff = 360 - diff;
  
  // If direction changed more than 150 degrees, it's likely backward movement
  return diff > 150;
}

// Time gap threshold for GPS signal recovery (30 seconds)
// If GPS signal is lost for more than this time, treat the next valid point as a new segment start
const GPS_SIGNAL_RECOVERY_THRESHOLD = 30000; // 30 seconds in ms

/**
 * Validate a GPS point against previous points to detect GPS drift/jumps
 * Supports GPS signal recovery after tunnels or poor signal areas
 */
export function validateGpsPoint(
  newPoint: GpsPoint,
  lastValidPoint: GpsPoint | null,
  lastBearing: number | null
): { isValid: boolean; reason?: string; newBearing?: number; isRecovery?: boolean } {
  // Check accuracy - reject points with very poor GPS accuracy
  // But allow moderate accuracy for tunnel exits and recovery
  if (newPoint.accuracy !== null && newPoint.accuracy > GPS_CONSTANTS.MIN_ACCURACY_THRESHOLD) {
    return { isValid: false, reason: "accuracy_too_low" };
  }

  // Check speed threshold (1 km/h minimum)
  const speedKmh = newPoint.speed !== null ? msToKmh(newPoint.speed) : 0;
  if (speedKmh < GPS_CONSTANTS.MIN_SPEED_THRESHOLD) {
    return { isValid: false, reason: "speed_below_threshold" };
  }

  // Check for unrealistically high speed (GPS spike indicator)
  if (speedKmh > GPS_CONSTANTS.MAX_REALISTIC_SPEED) {
    return { isValid: false, reason: "speed_too_high" };
  }

  if (!lastValidPoint) {
    return { isValid: true };
  }

  // Check time between points
  const timeDiff = newPoint.timestamp - lastValidPoint.timestamp;
  if (timeDiff < GPS_CONSTANTS.MIN_TIME_BETWEEN_POINTS) {
    return { isValid: false, reason: "too_soon" };
  }

  // GPS Signal Recovery: If time gap is large (e.g., tunnel), accept the point as a new segment
  // This allows recording to continue after GPS signal is restored
  if (timeDiff > GPS_SIGNAL_RECOVERY_THRESHOLD) {
    console.log(`[GPS] Signal recovery detected after ${(timeDiff / 1000).toFixed(1)}s gap`);
    // Accept this point as a new segment start - don't validate distance/speed against last point
    return { isValid: true, isRecovery: true };
  }

  // Calculate distance from last point
  const distance = calculateDistance(
    lastValidPoint.latitude,
    lastValidPoint.longitude,
    newPoint.latitude,
    newPoint.longitude
  );

  // Check for GPS spike (sudden large distance jump)
  if (distance > GPS_CONSTANTS.GPS_SPIKE_THRESHOLD) {
    return { isValid: false, reason: "gps_spike" };
  }

  // Calculate expected maximum distance based on time and max realistic speed
  const timeSeconds = timeDiff / 1000;
  const maxExpectedDistance = timeSeconds * (GPS_CONSTANTS.MAX_REALISTIC_SPEED / 3.6);
  
  // Check for unrealistic distance jump (use the larger of the two limits)
  if (distance > Math.max(GPS_CONSTANTS.MAX_DISTANCE_JUMP, maxExpectedDistance)) {
    return { isValid: false, reason: "distance_jump" };
  }

  // Calculate implied speed from distance and time
  const impliedSpeedKmh = (distance / timeSeconds) * 3.6;
  if (impliedSpeedKmh > GPS_CONSTANTS.MAX_REALISTIC_SPEED) {
    return { isValid: false, reason: "implied_speed_too_high" };
  }

  // Calculate bearing
  const newBearing = calculateBearing(
    lastValidPoint.latitude,
    lastValidPoint.longitude,
    newPoint.latitude,
    newPoint.longitude
  );

  // Check for backward movement (only if distance is significant)
  if (distance > GPS_CONSTANTS.BACKWARD_MOVEMENT_THRESHOLD && lastBearing !== null) {
    if (isBackwardMovement(lastBearing, newBearing)) {
      return { isValid: false, reason: "backward_movement" };
    }
  }

  // Check for unrealistic speed jump between consecutive points
  if (lastValidPoint.speed !== null && newPoint.speed !== null) {
    const lastSpeedKmh = msToKmh(lastValidPoint.speed);
    const speedDiff = Math.abs(speedKmh - lastSpeedKmh);
    if (speedDiff > GPS_CONSTANTS.MAX_SPEED_JUMP) {
      return { isValid: false, reason: "speed_jump" };
    }
  }

  return { isValid: true, newBearing };
}

/**
 * Filter GPS points to remove noise and invalid data
 * Returns only valid points for recording
 */
export function filterGpsPoints(points: GpsPoint[]): GpsPoint[] {
  if (points.length === 0) return [];

  const filtered: GpsPoint[] = [];
  let lastValidPoint: GpsPoint | null = null;
  let lastBearing: number | null = null;

  for (const point of points) {
    const validation = validateGpsPoint(point, lastValidPoint, lastBearing);
    
    if (validation.isValid) {
      filtered.push(point);
      lastValidPoint = point;
      if (validation.newBearing !== undefined) {
        lastBearing = validation.newBearing;
      }
    }
  }

  return filtered;
}

/**
 * Generate GPX XML content from track data
 */
export function generateGpxContent(track: TrackData): string {
  const formatDate = (date: Date) => date.toISOString();

  // Filter points before generating GPX
  const filteredPoints = filterGpsPoints(track.points);

  const trackPoints = filteredPoints
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
 * Calculate total distance from GPS points (with filtering)
 */
export function calculateTotalDistance(points: GpsPoint[]): number {
  // Filter points first to remove invalid data
  const filteredPoints = filterGpsPoints(points);
  
  if (filteredPoints.length < 2) return 0;

  let totalDistance = 0;
  for (let i = 1; i < filteredPoints.length; i++) {
    totalDistance += calculateDistance(
      filteredPoints[i - 1].latitude,
      filteredPoints[i - 1].longitude,
      filteredPoints[i].latitude,
      filteredPoints[i].longitude
    );
  }
  return totalDistance;
}

/**
 * Calculate average speed from GPS points (km/h) - only from valid moving points
 */
export function calculateAverageSpeed(points: GpsPoint[]): number {
  if (points.length === 0) return 0;

  // Only include points with speed >= 1 km/h
  const validSpeeds = points
    .filter((p) => p.speed !== null && msToKmh(p.speed) >= GPS_CONSTANTS.MIN_SPEED_THRESHOLD)
    .map((p) => msToKmh(p.speed!));

  if (validSpeeds.length === 0) return 0;

  return validSpeeds.reduce((a, b) => a + b, 0) / validSpeeds.length;
}

/**
 * Get maximum speed from GPS points (km/h)
 */
export function getMaxSpeed(points: GpsPoint[]): number {
  if (points.length === 0) return 0;

  // Filter out unrealistic speeds
  const validSpeeds = points
    .filter((p) => {
      if (p.speed === null) return false;
      const speedKmh = msToKmh(p.speed);
      // Exclude speeds below threshold and unrealistically high speeds (> 100 km/h for e-scooter)
      return speedKmh >= GPS_CONSTANTS.MIN_SPEED_THRESHOLD && speedKmh <= 100;
    })
    .map((p) => msToKmh(p.speed!));

  if (validSpeeds.length === 0) return 0;

  return Math.max(...validSpeeds);
}

/**
 * Get the center point of a set of GPS coordinates
 */
export function getCenterPoint(points: GpsPoint[]): { latitude: number; longitude: number } | null {
  if (points.length === 0) return null;

  const sumLat = points.reduce((sum, p) => sum + p.latitude, 0);
  const sumLon = points.reduce((sum, p) => sum + p.longitude, 0);

  return {
    latitude: sumLat / points.length,
    longitude: sumLon / points.length,
  };
}

/**
 * Get bounding box for a set of GPS points
 */
export function getBoundingBox(points: GpsPoint[]): {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
} | null {
  if (points.length === 0) return null;

  let minLat = points[0].latitude;
  let maxLat = points[0].latitude;
  let minLon = points[0].longitude;
  let maxLon = points[0].longitude;

  for (const point of points) {
    minLat = Math.min(minLat, point.latitude);
    maxLat = Math.max(maxLat, point.latitude);
    minLon = Math.min(minLon, point.longitude);
    maxLon = Math.max(maxLon, point.longitude);
  }

  return { minLat, maxLat, minLon, maxLon };
}
