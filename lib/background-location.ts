import * as Location from "expo-location";
import { Platform } from "react-native";
import { GpsPoint } from "./gps-utils";

const BACKGROUND_LOCATION_TASK = "background-location-task";

// Store for background location updates
let backgroundLocationCallback: ((location: Location.LocationObject) => void) | null = null;
let isBackgroundTrackingActive = false;

// Conditionally import TaskManager only on native platforms
let TaskManager: any = null;

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

    // Start background location updates
    await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
      accuracy: Location.Accuracy.BestForNavigation,
      timeInterval: 1000, // Update every 1 second
      distanceInterval: 1, // Update every 1 meter
      foregroundService: {
        notificationTitle: "SCOOP 주행 기록 중",
        notificationBody: "백그라운드에서 주행을 기록하고 있습니다.",
        notificationColor: "#FF6D00",
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
