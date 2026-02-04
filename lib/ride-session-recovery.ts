/**
 * 주행 세션 자동 복구 유틸리티
 * 앱이 강제종료되더라도 재시작 시 이전 주행 데이터를 복구할 수 있도록 지원
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { GpsPoint } from "./gps-utils";

const RIDE_SESSION_KEY = "@ride_session_backup";
const RIDE_SESSION_INTERVAL = 10000; // 10초마다 백업

export interface RideSessionBackup {
  // 기본 정보
  id: string;
  startTime: string;
  lastUpdateTime: string;
  
  // 주행 상태
  isRunning: boolean;
  isPaused: boolean;
  
  // 주행 데이터
  distance: number;
  duration: number;
  restTime: number;
  maxSpeed: number;
  gpsPoints: GpsPoint[];
  
  // 스쿠터 정보 (SelectedScooter 타입과 호환)
  scooter: {
    id: number;
    name: string;
    color?: string;
    batteryVoltage?: number | null;
    batteryCapacity?: string | null;
    batteryType?: string | null;
    batteryCellCount?: number | null;
    batteryFullVoltage?: string | null;
    batteryEmptyVoltage?: string | null;
  } | null;
  startVoltage: number | null;
  
  // 날씨 정보
  weatherInfo: {
    temperature: number;
    humidity: number;
    windSpeed: number;
    windDirection: number;
    precipitationType: number;
    weatherCondition: string;
  } | null;
  
  // 그룹 라이딩 정보
  groupId: number | null;
  
  // 네비게이션 정보
  withNavigation: boolean;
  destinationName: string | null;
  destinationLat: number | null;
  destinationLng: number | null;
}

/**
 * 주행 세션 백업 저장
 */
export async function saveRideSessionBackup(session: RideSessionBackup): Promise<void> {
  try {
    const backup = {
      ...session,
      lastUpdateTime: new Date().toISOString(),
    };
    await AsyncStorage.setItem(RIDE_SESSION_KEY, JSON.stringify(backup));
  } catch (error) {
    console.error("[RideSessionRecovery] Failed to save backup:", error);
  }
}

/**
 * 주행 세션 백업 불러오기
 */
export async function loadRideSessionBackup(): Promise<RideSessionBackup | null> {
  try {
    const json = await AsyncStorage.getItem(RIDE_SESSION_KEY);
    if (!json) return null;
    
    const backup: RideSessionBackup = JSON.parse(json);
    
    // 24시간 이상 지난 백업은 무효화
    const lastUpdate = new Date(backup.lastUpdateTime);
    const now = new Date();
    const hoursDiff = (now.getTime() - lastUpdate.getTime()) / (1000 * 60 * 60);
    
    if (hoursDiff > 24) {
      await clearRideSessionBackup();
      return null;
    }
    
    return backup;
  } catch (error) {
    console.error("[RideSessionRecovery] Failed to load backup:", error);
    return null;
  }
}

/**
 * 주행 세션 백업 삭제
 */
export async function clearRideSessionBackup(): Promise<void> {
  try {
    await AsyncStorage.removeItem(RIDE_SESSION_KEY);
  } catch (error) {
    console.error("[RideSessionRecovery] Failed to clear backup:", error);
  }
}

/**
 * 복구 가능한 세션이 있는지 확인
 */
export async function hasRecoverableSession(): Promise<boolean> {
  const backup = await loadRideSessionBackup();
  return backup !== null && backup.gpsPoints.length > 0;
}

/**
 * 복구된 세션의 요약 정보 반환
 */
export async function getRecoverableSessionSummary(): Promise<{
  startTime: string;
  duration: number;
  distance: number;
  pointsCount: number;
} | null> {
  const backup = await loadRideSessionBackup();
  if (!backup) return null;
  
  return {
    startTime: backup.startTime,
    duration: backup.duration,
    distance: backup.distance,
    pointsCount: backup.gpsPoints.length,
  };
}

/**
 * 백업 인터벌 시작 (주행 중 주기적으로 백업)
 */
export function startBackupInterval(
  getSessionData: () => RideSessionBackup
): ReturnType<typeof setInterval> {
  return setInterval(async () => {
    const sessionData = getSessionData();
    await saveRideSessionBackup(sessionData);
  }, RIDE_SESSION_INTERVAL);
}

/**
 * 백업 인터벌 중지
 */
export function stopBackupInterval(intervalId: ReturnType<typeof setInterval> | null): void {
  if (intervalId) {
    clearInterval(intervalId);
  }
}
