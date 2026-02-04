/**
 * 성능 모니터링 유틸리티
 * 주행 중 메모리 사용량, GPS 정확도 등을 실시간으로 모니터링
 */

import { Platform } from "react-native";

export interface PerformanceMetrics {
  // GPS 관련
  gpsAccuracy: number | null;
  gpsPointCount: number;
  lastGpsUpdateTime: number | null;
  gpsUpdateFrequency: number; // 초당 업데이트 횟수
  
  // 메모리 관련 (추정치)
  estimatedMemoryUsage: number; // MB
  gpsPointsMemory: number; // MB
  
  // 앱 상태
  isBackgroundMode: boolean;
  uptime: number; // 초
  
  // 경고 상태
  warnings: PerformanceWarning[];
}

export interface PerformanceWarning {
  type: "gps_accuracy" | "gps_frequency" | "memory" | "battery";
  message: string;
  severity: "low" | "medium" | "high";
  timestamp: number;
}

const GPS_POINT_SIZE_BYTES = 200; // 예상 GPS 포인트 크기 (바이트)
const MAX_MEMORY_WARNING_MB = 50; // 메모리 경고 임계값
const MIN_GPS_ACCURACY_WARNING = 50; // GPS 정확도 경고 임계값 (미터)
const MIN_GPS_UPDATE_FREQUENCY = 0.5; // 최소 GPS 업데이트 빈도 (초당)

class PerformanceMonitor {
  private startTime: number = Date.now();
  private gpsUpdateTimes: number[] = [];
  private warnings: PerformanceWarning[] = [];
  private lastGpsAccuracy: number | null = null;
  private gpsPointCount: number = 0;
  private isBackground: boolean = false;
  
  /**
   * GPS 업데이트 기록
   */
  recordGpsUpdate(accuracy: number | null): void {
    const now = Date.now();
    this.gpsUpdateTimes.push(now);
    this.lastGpsAccuracy = accuracy;
    this.gpsPointCount++;
    
    // 최근 10초 데이터만 유지
    const tenSecondsAgo = now - 10000;
    this.gpsUpdateTimes = this.gpsUpdateTimes.filter(t => t > tenSecondsAgo);
    
    // GPS 정확도 경고 체크
    if (accuracy !== null && accuracy > MIN_GPS_ACCURACY_WARNING) {
      this.addWarning({
        type: "gps_accuracy",
        message: `GPS 정확도가 낮습니다 (${accuracy.toFixed(0)}m)`,
        severity: accuracy > 100 ? "high" : "medium",
        timestamp: now,
      });
    }
  }
  
  /**
   * GPS 포인트 수 업데이트
   */
  setGpsPointCount(count: number): void {
    this.gpsPointCount = count;
  }
  
  /**
   * 백그라운드 모드 설정
   */
  setBackgroundMode(isBackground: boolean): void {
    this.isBackground = isBackground;
  }
  
  /**
   * 경고 추가 (중복 방지)
   */
  private addWarning(warning: PerformanceWarning): void {
    // 같은 타입의 최근 경고가 있으면 추가하지 않음 (30초 내)
    const recentSameType = this.warnings.find(
      w => w.type === warning.type && Date.now() - w.timestamp < 30000
    );
    
    if (!recentSameType) {
      this.warnings.push(warning);
      
      // 최대 20개 경고만 유지
      if (this.warnings.length > 20) {
        this.warnings = this.warnings.slice(-20);
      }
    }
  }
  
  /**
   * GPS 업데이트 빈도 계산 (초당)
   */
  private calculateGpsFrequency(): number {
    if (this.gpsUpdateTimes.length < 2) return 0;
    
    const now = Date.now();
    const tenSecondsAgo = now - 10000;
    const recentUpdates = this.gpsUpdateTimes.filter(t => t > tenSecondsAgo);
    
    if (recentUpdates.length < 2) return 0;
    
    const timeSpan = (recentUpdates[recentUpdates.length - 1] - recentUpdates[0]) / 1000;
    return timeSpan > 0 ? (recentUpdates.length - 1) / timeSpan : 0;
  }
  
  /**
   * 예상 메모리 사용량 계산 (MB)
   */
  private calculateEstimatedMemory(): number {
    const gpsMemory = (this.gpsPointCount * GPS_POINT_SIZE_BYTES) / (1024 * 1024);
    const baseMemory = 10; // 기본 앱 메모리 (MB)
    return baseMemory + gpsMemory;
  }
  
  /**
   * 현재 성능 메트릭 가져오기
   */
  getMetrics(): PerformanceMetrics {
    const now = Date.now();
    const gpsFrequency = this.calculateGpsFrequency();
    const estimatedMemory = this.calculateEstimatedMemory();
    const gpsPointsMemory = (this.gpsPointCount * GPS_POINT_SIZE_BYTES) / (1024 * 1024);
    
    // GPS 빈도 경고 체크
    if (gpsFrequency > 0 && gpsFrequency < MIN_GPS_UPDATE_FREQUENCY) {
      this.addWarning({
        type: "gps_frequency",
        message: `GPS 업데이트가 느립니다 (${gpsFrequency.toFixed(2)}/초)`,
        severity: gpsFrequency < 0.2 ? "high" : "medium",
        timestamp: now,
      });
    }
    
    // 메모리 경고 체크
    if (estimatedMemory > MAX_MEMORY_WARNING_MB) {
      this.addWarning({
        type: "memory",
        message: `메모리 사용량이 높습니다 (${estimatedMemory.toFixed(1)}MB)`,
        severity: estimatedMemory > 100 ? "high" : "medium",
        timestamp: now,
      });
    }
    
    return {
      gpsAccuracy: this.lastGpsAccuracy,
      gpsPointCount: this.gpsPointCount,
      lastGpsUpdateTime: this.gpsUpdateTimes.length > 0 
        ? this.gpsUpdateTimes[this.gpsUpdateTimes.length - 1] 
        : null,
      gpsUpdateFrequency: gpsFrequency,
      estimatedMemoryUsage: estimatedMemory,
      gpsPointsMemory,
      isBackgroundMode: this.isBackground,
      uptime: Math.floor((now - this.startTime) / 1000),
      warnings: [...this.warnings],
    };
  }
  
  /**
   * 경고 목록 가져오기
   */
  getWarnings(): PerformanceWarning[] {
    return [...this.warnings];
  }
  
  /**
   * 경고 초기화
   */
  clearWarnings(): void {
    this.warnings = [];
  }
  
  /**
   * 모니터 리셋
   */
  reset(): void {
    this.startTime = Date.now();
    this.gpsUpdateTimes = [];
    this.warnings = [];
    this.lastGpsAccuracy = null;
    this.gpsPointCount = 0;
    this.isBackground = false;
  }
  
  /**
   * 성능 상태 요약 (UI 표시용)
   */
  getStatusSummary(): {
    status: "good" | "warning" | "critical";
    message: string;
  } {
    const metrics = this.getMetrics();
    const highWarnings = metrics.warnings.filter(w => w.severity === "high");
    const mediumWarnings = metrics.warnings.filter(w => w.severity === "medium");
    
    if (highWarnings.length > 0) {
      return {
        status: "critical",
        message: highWarnings[0].message,
      };
    }
    
    if (mediumWarnings.length > 0) {
      return {
        status: "warning",
        message: mediumWarnings[0].message,
      };
    }
    
    // GPS 정확도 체크
    if (metrics.gpsAccuracy !== null) {
      if (metrics.gpsAccuracy <= 10) {
        return { status: "good", message: "GPS 신호 우수" };
      } else if (metrics.gpsAccuracy <= 30) {
        return { status: "good", message: "GPS 신호 양호" };
      }
    }
    
    return { status: "good", message: "정상 작동 중" };
  }
}

// 싱글톤 인스턴스
export const performanceMonitor = new PerformanceMonitor();
