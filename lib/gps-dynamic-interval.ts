/**
 * GPS 업데이트 빈도 동적 조절
 * 
 * 속도에 따라 GPS 업데이트 빈도를 조절하여 배터리를 절약합니다.
 * - 정지/저속: 업데이트 빈도 낮춤
 * - 고속: 업데이트 빈도 높임
 */

import * as Location from "expo-location";

// GPS 업데이트 설정
export interface GpsUpdateConfig {
  // 업데이트 간격 (밀리초)
  timeInterval: number;
  // 최소 이동 거리 (미터)
  distanceInterval: number;
  // 정확도 레벨
  accuracy: Location.Accuracy;
}

// 속도 구간별 GPS 설정
export const GPS_CONFIGS: Record<string, GpsUpdateConfig> = {
  // 정지 상태 (0-3 km/h): 배터리 절약 모드
  stationary: {
    timeInterval: 3000,      // 3초
    distanceInterval: 5,     // 5m
    accuracy: Location.Accuracy.Balanced,
  },
  
  // 저속 (3-15 km/h): 보통 모드
  slow: {
    timeInterval: 2000,      // 2초
    distanceInterval: 3,     // 3m
    accuracy: Location.Accuracy.High,
  },
  
  // 중속 (15-30 km/h): 정밀 모드
  medium: {
    timeInterval: 1000,      // 1초
    distanceInterval: 2,     // 2m
    accuracy: Location.Accuracy.High,
  },
  
  // 고속 (30+ km/h): 최고 정밀 모드
  fast: {
    timeInterval: 500,       // 0.5초
    distanceInterval: 1,     // 1m
    accuracy: Location.Accuracy.BestForNavigation,
  },
};

// 속도 임계값 (km/h)
export const SPEED_THRESHOLDS = {
  stationary: 3,
  slow: 15,
  medium: 30,
};

/**
 * 현재 속도에 따른 GPS 설정 결정
 */
export function getGpsConfigForSpeed(speedKmh: number): GpsUpdateConfig {
  if (speedKmh < SPEED_THRESHOLDS.stationary) {
    return GPS_CONFIGS.stationary;
  } else if (speedKmh < SPEED_THRESHOLDS.slow) {
    return GPS_CONFIGS.slow;
  } else if (speedKmh < SPEED_THRESHOLDS.medium) {
    return GPS_CONFIGS.medium;
  } else {
    return GPS_CONFIGS.fast;
  }
}

/**
 * 속도 구간 이름 반환
 */
export function getSpeedZone(speedKmh: number): 'stationary' | 'slow' | 'medium' | 'fast' {
  if (speedKmh < SPEED_THRESHOLDS.stationary) {
    return 'stationary';
  } else if (speedKmh < SPEED_THRESHOLDS.slow) {
    return 'slow';
  } else if (speedKmh < SPEED_THRESHOLDS.medium) {
    return 'medium';
  } else {
    return 'fast';
  }
}

/**
 * GPS 업데이트 매니저
 * 속도 변화에 따라 GPS 설정을 동적으로 조절합니다.
 */
export class GpsUpdateManager {
  private currentZone: 'stationary' | 'slow' | 'medium' | 'fast' = 'medium';
  private lastConfigChange: number = 0;
  private readonly MIN_CONFIG_CHANGE_INTERVAL = 5000; // 최소 5초 간격으로 설정 변경
  
  // 설정 변경 콜백
  private onConfigChange?: (config: GpsUpdateConfig, zone: string) => void;
  
  constructor(onConfigChange?: (config: GpsUpdateConfig, zone: string) => void) {
    this.onConfigChange = onConfigChange;
  }
  
  /**
   * 속도 업데이트 및 필요시 GPS 설정 변경
   * @returns 설정이 변경되었으면 새 설정, 아니면 null
   */
  updateSpeed(speedKmh: number): GpsUpdateConfig | null {
    const newZone = getSpeedZone(speedKmh);
    const now = Date.now();
    
    // 같은 구간이면 변경 없음
    if (newZone === this.currentZone) {
      return null;
    }
    
    // 너무 빈번한 변경 방지
    if (now - this.lastConfigChange < this.MIN_CONFIG_CHANGE_INTERVAL) {
      return null;
    }
    
    // 설정 변경
    this.currentZone = newZone;
    this.lastConfigChange = now;
    const newConfig = GPS_CONFIGS[newZone];
    
    console.log(`[GPS] Zone changed to ${newZone} (speed: ${speedKmh.toFixed(1)} km/h)`);
    
    if (this.onConfigChange) {
      this.onConfigChange(newConfig, newZone);
    }
    
    return newConfig;
  }
  
  /**
   * 현재 GPS 설정 반환
   */
  getCurrentConfig(): GpsUpdateConfig {
    return GPS_CONFIGS[this.currentZone];
  }
  
  /**
   * 현재 속도 구간 반환
   */
  getCurrentZone(): string {
    return this.currentZone;
  }
  
  /**
   * 초기화 (주행 시작 시)
   */
  reset(): void {
    this.currentZone = 'medium';
    this.lastConfigChange = 0;
  }
}

// 배터리 절약 통계
let batteryStats = {
  totalUpdates: 0,
  stationaryUpdates: 0,
  slowUpdates: 0,
  mediumUpdates: 0,
  fastUpdates: 0,
};

export function recordGpsUpdate(zone: string): void {
  batteryStats.totalUpdates++;
  switch (zone) {
    case 'stationary':
      batteryStats.stationaryUpdates++;
      break;
    case 'slow':
      batteryStats.slowUpdates++;
      break;
    case 'medium':
      batteryStats.mediumUpdates++;
      break;
    case 'fast':
      batteryStats.fastUpdates++;
      break;
  }
}

export function getBatteryStats(): typeof batteryStats {
  return { ...batteryStats };
}

export function resetBatteryStats(): void {
  batteryStats = {
    totalUpdates: 0,
    stationaryUpdates: 0,
    slowUpdates: 0,
    mediumUpdates: 0,
    fastUpdates: 0,
  };
}

/**
 * 예상 배터리 절약률 계산
 * 모든 업데이트가 fast 모드였을 경우 대비 절약률
 */
export function calculateBatterySavings(): number {
  const { totalUpdates, stationaryUpdates, slowUpdates, mediumUpdates, fastUpdates } = batteryStats;
  
  if (totalUpdates === 0) return 0;
  
  // 각 모드별 상대적 배터리 소모 (fast = 1.0 기준)
  const consumption = {
    stationary: 0.3,
    slow: 0.5,
    medium: 0.7,
    fast: 1.0,
  };
  
  const actualConsumption = 
    stationaryUpdates * consumption.stationary +
    slowUpdates * consumption.slow +
    mediumUpdates * consumption.medium +
    fastUpdates * consumption.fast;
  
  const maxConsumption = totalUpdates * consumption.fast;
  
  const savings = ((maxConsumption - actualConsumption) / maxConsumption) * 100;
  return Math.round(savings);
}
