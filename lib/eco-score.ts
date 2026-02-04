/**
 * 에코 스코어 (친환경 주행 점수) 계산
 * 
 * 주행 패턴을 분석하여 친환경 점수를 산출합니다.
 * 점수가 높을수록 배터리 효율적이고 안전한 주행입니다.
 */

import { GpsPoint } from "./gps-utils";

// 에코 스코어 가중치
const ECO_WEIGHTS = {
  // 속도 안정성 (급가속/급감속 적을수록 높음)
  speedStability: 0.25,
  // 평균 속도 적정성 (15-25km/h가 최적)
  optimalSpeed: 0.20,
  // 정지 횟수 (적을수록 효율적)
  stopEfficiency: 0.15,
  // 배터리 효율 (Wh/km 낮을수록 좋음)
  batteryEfficiency: 0.25,
  // 주행 거리 보너스 (장거리일수록 보너스)
  distanceBonus: 0.15,
};

// 에코 스코어 결과
export interface EcoScoreResult {
  totalScore: number;  // 0-100
  grade: 'S' | 'A' | 'B' | 'C' | 'D';
  breakdown: {
    speedStability: number;
    optimalSpeed: number;
    stopEfficiency: number;
    batteryEfficiency: number;
    distanceBonus: number;
  };
  tips: string[];
  co2Saved: number;  // kg (자동차 대비 절감량)
}

/**
 * GPS 포인트에서 주행 패턴 분석
 */
function analyzeRidingPattern(points: GpsPoint[]): {
  suddenAccelerations: number;
  suddenDecelerations: number;
  avgSpeed: number;
  maxSpeed: number;
  stopCount: number;
} {
  if (points.length < 2) {
    return {
      suddenAccelerations: 0,
      suddenDecelerations: 0,
      avgSpeed: 0,
      maxSpeed: 0,
      stopCount: 0,
    };
  }

  let suddenAccelerations = 0;
  let suddenDecelerations = 0;
  let totalSpeed = 0;
  let maxSpeed = 0;
  let stopCount = 0;
  let wasMoving = false;
  let prevSpeed = 0;

  for (let i = 0; i < points.length; i++) {
    const speed = (points[i].speed ?? 0) * 3.6; // m/s to km/h
    totalSpeed += speed;
    
    if (speed > maxSpeed) {
      maxSpeed = speed;
    }

    // 정지 감지
    if (speed < 1 && wasMoving) {
      stopCount++;
      wasMoving = false;
    } else if (speed >= 3) {
      wasMoving = true;
    }

    // 급가속/급감속 감지 (3km/h 이상 급격한 변화)
    if (i > 0) {
      const timeDiff = (points[i].timestamp - points[i-1].timestamp) / 1000; // seconds
      if (timeDiff > 0 && timeDiff < 5) {
        const acceleration = (speed - prevSpeed) / timeDiff; // km/h per second
        if (acceleration > 3) {
          suddenAccelerations++;
        } else if (acceleration < -3) {
          suddenDecelerations++;
        }
      }
    }
    prevSpeed = speed;
  }

  return {
    suddenAccelerations,
    suddenDecelerations,
    avgSpeed: totalSpeed / points.length,
    maxSpeed,
    stopCount,
  };
}

/**
 * 속도 안정성 점수 계산 (0-100)
 */
function calculateSpeedStabilityScore(
  suddenAccelerations: number,
  suddenDecelerations: number,
  durationMinutes: number
): number {
  // 분당 급가속/급감속 횟수
  const eventsPerMinute = (suddenAccelerations + suddenDecelerations) / Math.max(durationMinutes, 1);
  
  // 분당 0회 = 100점, 분당 3회 이상 = 0점
  const score = Math.max(0, 100 - (eventsPerMinute * 33.3));
  return Math.round(score);
}

/**
 * 최적 속도 점수 계산 (0-100)
 * 15-25km/h가 최적 (배터리 효율 + 안전)
 */
function calculateOptimalSpeedScore(avgSpeed: number): number {
  const optimalMin = 15;
  const optimalMax = 25;
  
  if (avgSpeed >= optimalMin && avgSpeed <= optimalMax) {
    return 100;
  } else if (avgSpeed < optimalMin) {
    // 너무 느림 (3km/h 이하 = 0점)
    return Math.max(0, Math.round((avgSpeed / optimalMin) * 100));
  } else {
    // 너무 빠름 (40km/h 이상 = 0점)
    const excess = avgSpeed - optimalMax;
    return Math.max(0, Math.round(100 - (excess * 6.67)));
  }
}

/**
 * 정지 효율 점수 계산 (0-100)
 */
function calculateStopEfficiencyScore(stopCount: number, distanceKm: number): number {
  // km당 정지 횟수
  const stopsPerKm = stopCount / Math.max(distanceKm, 0.1);
  
  // km당 0회 = 100점, km당 5회 이상 = 0점
  const score = Math.max(0, 100 - (stopsPerKm * 20));
  return Math.round(score);
}

/**
 * 배터리 효율 점수 계산 (0-100)
 */
function calculateBatteryEfficiencyScore(efficiencyWhKm: number | undefined): number {
  if (efficiencyWhKm === undefined || efficiencyWhKm <= 0) {
    return 50; // 데이터 없으면 중간값
  }
  
  // 10 Wh/km = 100점, 30 Wh/km 이상 = 0점
  const score = Math.max(0, 100 - ((efficiencyWhKm - 10) * 5));
  return Math.round(Math.min(100, score));
}

/**
 * 거리 보너스 점수 계산 (0-100)
 */
function calculateDistanceBonusScore(distanceKm: number): number {
  // 1km = 20점, 5km 이상 = 100점
  const score = Math.min(100, distanceKm * 20);
  return Math.round(score);
}

/**
 * 등급 결정
 */
function determineGrade(score: number): 'S' | 'A' | 'B' | 'C' | 'D' {
  if (score >= 90) return 'S';
  if (score >= 75) return 'A';
  if (score >= 60) return 'B';
  if (score >= 40) return 'C';
  return 'D';
}

/**
 * CO2 절감량 계산 (kg)
 * 자동차 대비 전동킥보드 사용으로 절감한 CO2
 */
function calculateCO2Saved(distanceKm: number): number {
  // 자동차 평균 CO2 배출: 약 120g/km
  // 전동킥보드 CO2 배출: 약 5g/km (전력 생산 포함)
  const carEmission = 0.12; // kg/km
  const scooterEmission = 0.005; // kg/km
  const saved = (carEmission - scooterEmission) * distanceKm;
  return Math.round(saved * 100) / 100;
}

/**
 * 개선 팁 생성
 */
function generateTips(breakdown: EcoScoreResult['breakdown']): string[] {
  const tips: string[] = [];
  
  if (breakdown.speedStability < 70) {
    tips.push("부드러운 가속과 감속으로 배터리를 아끼세요");
  }
  if (breakdown.optimalSpeed < 70) {
    tips.push("15-25km/h 속도가 가장 효율적이에요");
  }
  if (breakdown.stopEfficiency < 70) {
    tips.push("신호 예측으로 불필요한 정지를 줄여보세요");
  }
  if (breakdown.batteryEfficiency < 70) {
    tips.push("타이어 공기압을 확인해보세요");
  }
  if (breakdown.distanceBonus < 50) {
    tips.push("더 긴 거리를 주행하면 효율이 높아져요");
  }
  
  if (tips.length === 0) {
    tips.push("훌륭한 에코 라이딩이에요! 계속 유지하세요");
  }
  
  return tips.slice(0, 3);
}

/**
 * 에코 스코어 계산
 */
export function calculateEcoScore(
  gpsPoints: GpsPoint[],
  distanceM: number,
  durationS: number,
  options?: {
    batteryEfficiency?: number; // Wh/km
  }
): EcoScoreResult {
  const distanceKm = distanceM / 1000;
  const durationMin = durationS / 60;
  
  // 주행 패턴 분석
  const pattern = analyzeRidingPattern(gpsPoints);
  
  // 각 항목별 점수 계산
  const breakdown = {
    speedStability: calculateSpeedStabilityScore(
      pattern.suddenAccelerations,
      pattern.suddenDecelerations,
      durationMin
    ),
    optimalSpeed: calculateOptimalSpeedScore(pattern.avgSpeed),
    stopEfficiency: calculateStopEfficiencyScore(pattern.stopCount, distanceKm),
    batteryEfficiency: calculateBatteryEfficiencyScore(options?.batteryEfficiency),
    distanceBonus: calculateDistanceBonusScore(distanceKm),
  };
  
  // 가중 평균 계산
  const totalScore = Math.round(
    breakdown.speedStability * ECO_WEIGHTS.speedStability +
    breakdown.optimalSpeed * ECO_WEIGHTS.optimalSpeed +
    breakdown.stopEfficiency * ECO_WEIGHTS.stopEfficiency +
    breakdown.batteryEfficiency * ECO_WEIGHTS.batteryEfficiency +
    breakdown.distanceBonus * ECO_WEIGHTS.distanceBonus
  );
  
  return {
    totalScore,
    grade: determineGrade(totalScore),
    breakdown,
    tips: generateTips(breakdown),
    co2Saved: calculateCO2Saved(distanceKm),
  };
}

/**
 * 에코 스코어 등급별 색상
 */
export function getGradeColor(grade: EcoScoreResult['grade']): string {
  switch (grade) {
    case 'S': return '#10B981'; // 에메랄드
    case 'A': return '#22C55E'; // 그린
    case 'B': return '#84CC16'; // 라임
    case 'C': return '#F59E0B'; // 앰버
    case 'D': return '#EF4444'; // 레드
  }
}

/**
 * 에코 스코어 등급별 설명
 */
export function getGradeDescription(grade: EcoScoreResult['grade']): string {
  switch (grade) {
    case 'S': return '최고의 에코 라이더!';
    case 'A': return '훌륭한 친환경 주행';
    case 'B': return '좋은 주행 습관';
    case 'C': return '개선의 여지가 있어요';
    case 'D': return '에코 주행을 시작해보세요';
  }
}
