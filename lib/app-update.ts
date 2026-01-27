import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform, Linking, Alert } from "react-native";
import Constants from "expo-constants";

const APP_UPDATE_KEY = "@scoop_app_update";
const LAST_CHECK_KEY = "@scoop_last_update_check";

export interface AppVersion {
  version: string;
  versionCode: number;
  downloadUrl: string;
  releaseNotes: string;
  forceUpdate: boolean;
  publishedAt: string;
}

export interface UpdateCheckResult {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion?: AppVersion;
}

/**
 * Get current app version from Constants
 */
export function getCurrentVersion(): string {
  return Constants.expoConfig?.version || "1.0.0";
}

/**
 * Get current version code (for Android)
 */
export function getCurrentVersionCode(): number {
  // In development, return 1
  if (__DEV__) return 1;
  
  // For production builds, this would come from the native config
  return 1;
}

/**
 * Check for app updates from server
 */
export async function checkForUpdates(): Promise<UpdateCheckResult> {
  const currentVersion = getCurrentVersion();
  
  console.log("[AppUpdate] Checking for updates, current version:", currentVersion);
  
  try {
    // Get latest version info from server
    // Use fetch with tRPC endpoint
    const response = await fetch(getApiBaseUrl() + "/api/trpc/app.version");
    
    if (!response.ok) {
      console.log("[AppUpdate] Update check failed:", response.status);
      return { hasUpdate: false, currentVersion };
    }
    
    const data = await response.json();
    const latestVersion: AppVersion = data.result?.data || data;
    
    console.log("[AppUpdate] Server version:", latestVersion.version, "Current version:", currentVersion);
    
    // Compare versions - 서버 버전이 현재 버전보다 높을 때만 업데이트 필요
    const comparison = compareVersions(latestVersion.version, currentVersion);
    const hasUpdate = comparison > 0;
    
    console.log("[AppUpdate] Version comparison result:", comparison, "hasUpdate:", hasUpdate);
    
    // Save last check time
    await AsyncStorage.setItem(LAST_CHECK_KEY, new Date().toISOString());
    
    if (hasUpdate) {
      // Cache the update info
      await AsyncStorage.setItem(APP_UPDATE_KEY, JSON.stringify(latestVersion));
      console.log("[AppUpdate] Update available, cached version info");
    } else {
      // 업데이트가 필요 없으면 캐시된 업데이트 정보 삭제
      await AsyncStorage.removeItem(APP_UPDATE_KEY);
      console.log("[AppUpdate] No update needed, cleared cached update info");
    }
    
    return {
      hasUpdate,
      currentVersion,
      latestVersion: hasUpdate ? latestVersion : undefined,
    };
  } catch (error) {
    console.error("[AppUpdate] Failed to check for updates:", error);
    return { hasUpdate: false, currentVersion };
  }
}

/**
 * Get cached update info
 */
export async function getCachedUpdateInfo(): Promise<AppVersion | null> {
  try {
    const cached = await AsyncStorage.getItem(APP_UPDATE_KEY);
    return cached ? JSON.parse(cached) : null;
  } catch {
    return null;
  }
}

/**
 * Clear cached update info (after user dismisses or updates)
 */
export async function clearCachedUpdate(): Promise<void> {
  await AsyncStorage.removeItem(APP_UPDATE_KEY);
}

/**
 * Get time since last update check
 */
export async function getTimeSinceLastCheck(): Promise<number | null> {
  try {
    const lastCheck = await AsyncStorage.getItem(LAST_CHECK_KEY);
    if (!lastCheck) return null;
    return Date.now() - new Date(lastCheck).getTime();
  } catch {
    return null;
  }
}

/**
 * Should check for updates (once per day)
 */
export async function shouldCheckForUpdates(): Promise<boolean> {
  const timeSinceLastCheck = await getTimeSinceLastCheck();
  if (timeSinceLastCheck === null) return true;
  
  // Check once per day (24 hours)
  const ONE_DAY = 24 * 60 * 60 * 1000;
  return timeSinceLastCheck > ONE_DAY;
}

/**
 * Open download URL for the update
 */
export async function downloadUpdate(downloadUrl: string): Promise<void> {
  if (Platform.OS === "web") {
    window.open(downloadUrl, "_blank");
    return;
  }
  
  const canOpen = await Linking.canOpenURL(downloadUrl);
  if (canOpen) {
    await Linking.openURL(downloadUrl);
  } else {
    Alert.alert("오류", "다운로드 링크를 열 수 없습니다.");
  }
}

/**
 * Show update alert to user
 */
export function showUpdateAlert(
  latestVersion: AppVersion,
  onUpdate: () => void,
  onLater?: () => void
): void {
  const buttons = latestVersion.forceUpdate
    ? [{ text: "업데이트", onPress: onUpdate }]
    : [
        { text: "나중에", style: "cancel" as const, onPress: onLater },
        { text: "업데이트", onPress: onUpdate },
      ];

  Alert.alert(
    `새 버전 사용 가능 (v${latestVersion.version})`,
    latestVersion.releaseNotes || "새로운 기능과 버그 수정이 포함되어 있습니다.",
    buttons,
    { cancelable: !latestVersion.forceUpdate }
  );
}

/**
 * Compare two version strings
 * Returns: 1 if a > b, -1 if a < b, 0 if equal
 */
export function compareVersions(a: string, b: string): number {
  const partsA = a.split(".").map(Number);
  const partsB = b.split(".").map(Number);
  
  const maxLength = Math.max(partsA.length, partsB.length);
  
  for (let i = 0; i < maxLength; i++) {
    const numA = partsA[i] || 0;
    const numB = partsB[i] || 0;
    
    if (numA > numB) return 1;
    if (numA < numB) return -1;
  }
  
  return 0;
}

/**
 * Get API base URL
 */
function getApiBaseUrl(): string {
  // In production, this would be the actual server URL
  // For now, use the environment variable or default
  if (Platform.OS === "web") {
    return window.location.origin;
  }
  
  // For native apps, use the configured API URL from environment
  return process.env.EXPO_PUBLIC_API_BASE_URL || "https://scoopride-xqsh52mn.manus.space";
}
