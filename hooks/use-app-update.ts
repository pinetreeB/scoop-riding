import { useEffect, useState, useCallback } from "react";
import { AppState, AppStateStatus, Platform } from "react-native";
import {
  checkForUpdates,
  getCachedUpdateInfo,
  clearCachedUpdate,
  shouldCheckForUpdates,
  downloadUpdate,
  showUpdateAlert,
  getCurrentVersion,
  type AppVersion,
  type UpdateCheckResult,
} from "@/lib/app-update";

interface UseAppUpdateResult {
  currentVersion: string;
  hasUpdate: boolean;
  latestVersion: AppVersion | null;
  isChecking: boolean;
  checkNow: () => Promise<void>;
  dismissUpdate: () => Promise<void>;
  startDownload: () => Promise<void>;
}

/**
 * Hook to manage app update checking and notifications
 */
export function useAppUpdate(): UseAppUpdateResult {
  const [currentVersion] = useState(getCurrentVersion);
  const [hasUpdate, setHasUpdate] = useState(false);
  const [latestVersion, setLatestVersion] = useState<AppVersion | null>(null);
  const [isChecking, setIsChecking] = useState(false);

  const checkNow = useCallback(async () => {
    if (isChecking) return;
    
    setIsChecking(true);
    try {
      const result = await checkForUpdates();
      setHasUpdate(result.hasUpdate);
      setLatestVersion(result.latestVersion || null);
      
      // Show alert if update is available
      if (result.hasUpdate && result.latestVersion) {
        showUpdateAlert(
          result.latestVersion,
          () => downloadUpdate(result.latestVersion!.downloadUrl),
          () => clearCachedUpdate()
        );
      }
    } catch (error) {
      console.error("Update check failed:", error);
    } finally {
      setIsChecking(false);
    }
  }, [isChecking]);

  const dismissUpdate = useCallback(async () => {
    await clearCachedUpdate();
    setHasUpdate(false);
    setLatestVersion(null);
  }, []);

  const startDownload = useCallback(async () => {
    if (latestVersion?.downloadUrl) {
      await downloadUpdate(latestVersion.downloadUrl);
    }
  }, [latestVersion]);

  // Check for cached update on mount - 버전 비교 후 유효한 경우에만 표시
  useEffect(() => {
    const loadCachedUpdate = async () => {
      const cached = await getCachedUpdateInfo();
      if (cached) {
        // 캐시된 버전이 현재 버전보다 높은지 다시 확인
        const current = getCurrentVersion();
        const { compareVersions } = await import("@/lib/app-update");
        if (compareVersions(cached.version, current) > 0) {
          setHasUpdate(true);
          setLatestVersion(cached);
          console.log("[useAppUpdate] Cached update is valid:", cached.version, ">", current);
        } else {
          // 캐시된 버전이 현재 버전보다 낮거나 같으면 삭제
          await clearCachedUpdate();
          console.log("[useAppUpdate] Cached update is outdated, cleared:", cached.version, "<=", current);
        }
      }
    };
    loadCachedUpdate();
  }, []);

  // Check for updates on app foreground (once per day)
  useEffect(() => {
    if (Platform.OS === "web") return;

    const handleAppStateChange = async (nextAppState: AppStateStatus) => {
      if (nextAppState === "active") {
        const shouldCheck = await shouldCheckForUpdates();
        if (shouldCheck) {
          checkNow();
        }
      }
    };

    const subscription = AppState.addEventListener("change", handleAppStateChange);

    // Initial check
    (async () => {
      const shouldCheck = await shouldCheckForUpdates();
      if (shouldCheck) {
        checkNow();
      }
    })();

    return () => {
      subscription.remove();
    };
  }, [checkNow]);

  return {
    currentVersion,
    hasUpdate,
    latestVersion,
    isChecking,
    checkNow,
    dismissUpdate,
    startDownload,
  };
}
