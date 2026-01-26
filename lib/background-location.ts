import * as Location from "expo-location";
import { Platform, Linking } from "react-native";
import { GpsPoint } from "./gps-utils";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ExpoLinking from "expo-linking";

const BACKGROUND_LOCATION_TASK = "background-location-task";
const BACKGROUND_RIDING_STATE_KEY = "scoop_background_riding_state";

// Store for background location updates
let backgroundLocationCallback: ((location: Location.LocationObject) => void) | null = null;
let isBackgroundTrackingActive = false;

// Conditionally import TaskManager only on native platforms
let TaskManager: any = null;

// Background riding state interface
export interface BackgroundRidingState {
  isRiding: boolean;
  startTime: number;
  totalDistance: number; // meters
  duration: number; // seconds
  currentSpeed: number; // km/h
  lastLatitude: number | null;
  lastLongitude: number | null;
  lastTimestamp: number | null;
  gpsPoints: GpsPoint[];
}

// Initialize default state
const defaultBackgroundState: BackgroundRidingState = {
  isRiding: false,
  startTime: 0,
  totalDistance: 0,
  duration: 0,
  currentSpeed: 0,
  lastLatitude: null,
  lastLongitude: null,
  lastTimestamp: null,
  gpsPoints: [],
};

// Save background riding state to AsyncStorage
export async function saveBackgroundRidingState(state: BackgroundRidingState): Promise<void> {
  try {
    // Don't save gpsPoints to AsyncStorage (too large), keep them in memory
    const stateToSave = { ...state, gpsPoints: [] };
    await AsyncStorage.setItem(BACKGROUND_RIDING_STATE_KEY, JSON.stringify(stateToSave));
  } catch (error) {
    console.error("[BackgroundLocation] Failed to save riding state:", error);
  }
}

// Load background riding state from AsyncStorage
export async function loadBackgroundRidingState(): Promise<BackgroundRidingState> {
  try {
    const data = await AsyncStorage.getItem(BACKGROUND_RIDING_STATE_KEY);
    if (data) {
      return { ...defaultBackgroundState, ...JSON.parse(data) };
    }
  } catch (error) {
    console.error("[BackgroundLocation] Failed to load riding state:", error);
  }
  return defaultBackgroundState;
}

// Clear background riding state
export async function clearBackgroundRidingState(): Promise<void> {
  try {
    await AsyncStorage.removeItem(BACKGROUND_RIDING_STATE_KEY);
  } catch (error) {
    console.error("[BackgroundLocation] Failed to clear riding state:", error);
  }
}

// Calculate distance between two GPS points using Haversine formula
function calculateDistanceBetweenPoints(
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

// Format distance for notification
function formatDistanceForNotification(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)}m`;
  }
  return `${(meters / 1000).toFixed(2)}km`;
}

// Format duration for notification
function formatDurationForNotification(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

/**
 * Define the background location task
 * This must be called at the top level of your app (outside of any component)
 */
export function defineBackgroundLocationTask() {
  if (Platform.OS === "web") {
    console.log("Background location task not supported on web");
    return;
  }

  // Dynamically import TaskManager on native
  TaskManager = require("expo-task-manager");
  
  TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }: any) => {
    if (error) {
      console.error("Background location task error:", error);
      return;
    }

    if (data && backgroundLocationCallback) {
      const { locations } = data as { locations: Location.LocationObject[] };
      
      // Process each location update
      for (const location of locations) {
        backgroundLocationCallback(location);
      }
    }
  });
}

/**
 * Request background location permission
 */
export async function requestBackgroundLocationPermission(): Promise<boolean> {
  if (Platform.OS === "web") {
    return false;
  }

  try {
    // First request foreground permission
    const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
    if (foregroundStatus !== "granted") {
      return false;
    }

    // Then request background permission
    const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
    return backgroundStatus === "granted";
  } catch (error) {
    console.error("Error requesting background location permission:", error);
    return false;
  }
}

/**
 * Check if background location permission is granted
 */
export async function hasBackgroundLocationPermission(): Promise<boolean> {
  if (Platform.OS === "web") {
    return false;
  }

  try {
    const { status } = await Location.getBackgroundPermissionsAsync();
    return status === "granted";
  } catch (error) {
    console.error("Error checking background location permission:", error);
    return false;
  }
}

/**
 * Update the foreground service notification with current riding stats
 */
export async function updateForegroundNotification(
  distance: number,
  duration: number,
  speed: number
): Promise<void> {
  if (Platform.OS === "web" || !isBackgroundTrackingActive) {
    return;
  }

  try {
    const distanceStr = formatDistanceForNotification(distance);
    const durationStr = formatDurationForNotification(duration);
    const speedStr = `${speed.toFixed(1)}km/h`;

    // Update the foreground service notification
    await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
      accuracy: Location.Accuracy.BestForNavigation,
      timeInterval: 1000,
      distanceInterval: 1,
      foregroundService: {
        notificationTitle: `🛴 ${speedStr} | ${distanceStr} | ${durationStr}`,
        notificationBody: "SCOOP 주행 기록 중 - 탭하여 앱으로 돌아가기",
        notificationColor: "#FF6D00",
        killServiceOnDestroy: false, // Keep service running even if app is killed
      },
      activityType: Location.ActivityType.Fitness,
      showsBackgroundLocationIndicator: true,
      pausesUpdatesAutomatically: false,
    });
  } catch (error) {
    // Ignore errors when updating notification (might happen if task is not running)
    console.log("[BackgroundLocation] Notification update skipped:", error);
  }
}

/**
 * Start background location tracking
 */
export async function startBackgroundLocationTracking(
  onLocationUpdate: (location: Location.LocationObject) => void
): Promise<boolean> {
  if (Platform.OS === "web") {
    console.log("Background location tracking not supported on web");
    return false;
  }

  try {
    if (!TaskManager) {
      TaskManager = require("expo-task-manager");
    }

    // Check if task is already running
    const isTaskDefined = await TaskManager.isTaskDefined(BACKGROUND_LOCATION_TASK);
    if (!isTaskDefined) {
      console.error("Background location task not defined. Call defineBackgroundLocationTask() first.");
      return false;
    }

    // Check permission
    const hasPermission = await hasBackgroundLocationPermission();
    if (!hasPermission) {
      const granted = await requestBackgroundLocationPermission();
      if (!granted) {
        console.error("Background location permission not granted");
        return false;
      }
    }

    // Set the callback
    backgroundLocationCallback = onLocationUpdate;

    // Initialize background riding state
    const initialState: BackgroundRidingState = {
      isRiding: true,
      startTime: Date.now(),
      totalDistance: 0,
      duration: 0,
      currentSpeed: 0,
      lastLatitude: null,
      lastLongitude: null,
      lastTimestamp: null,
      gpsPoints: [],
    };
    await saveBackgroundRidingState(initialState);

    // Get the app's deep link scheme for notification tap action
    const appScheme = ExpoLinking.createURL("/riding");
    console.log("[BackgroundLocation] Deep link URL:", appScheme);

    // Start background location updates with initial notification
    await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
      accuracy: Location.Accuracy.BestForNavigation,
      timeInterval: 1000, // Update every 1 second
      distanceInterval: 1, // Update every 1 meter
      foregroundService: {
        notificationTitle: "🛴 SCOOP 주행 시작",
        notificationBody: "주행 기록 중... 탭하여 앱으로 돌아가기",
        notificationColor: "#FF6D00",
        killServiceOnDestroy: false, // Keep service running even if app is killed
      },
      // iOS specific
      activityType: Location.ActivityType.Fitness,
      showsBackgroundLocationIndicator: true,
      pausesUpdatesAutomatically: false,
    });

    isBackgroundTrackingActive = true;
    console.log("Background location tracking started");
    return true;
  } catch (error) {
    console.error("Error starting background location tracking:", error);
    return false;
  }
}

/**
 * Stop background location tracking
 */
export async function stopBackgroundLocationTracking(): Promise<void> {
  if (Platform.OS === "web") {
    return;
  }

  try {
    const isTaskRunning = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
    
    if (isTaskRunning) {
      await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      console.log("Background location tracking stopped");
    }

    // Clear the background riding state
    await clearBackgroundRidingState();

    backgroundLocationCallback = null;
    isBackgroundTrackingActive = false;
  } catch (error) {
    console.error("Error stopping background location tracking:", error);
  }
}

/**
 * Check if background location tracking is currently active
 */
export async function isBackgroundLocationTrackingActive(): Promise<boolean> {
  if (Platform.OS === "web") {
    return false;
  }

  try {
    return await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
  } catch (error) {
    console.error("Error checking background location status:", error);
    return false;
  }
}

/**
 * Get the current background tracking status
 */
export function getBackgroundTrackingStatus(): boolean {
  return isBackgroundTrackingActive;
}
