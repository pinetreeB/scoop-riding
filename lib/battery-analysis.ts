/**
 * Battery Analysis Utilities
 * 
 * 전동킥보드 배터리 SOC 계산, 연비 분석, 배터리 건강도 추정 등의 기능을 제공합니다.
 */

// 배터리 타입별 전압-SOC 변환 테이블 (리튬이온 기준)
// 실제 SOC는 비선형이지만, 간단한 선형 보간 사용
export interface BatterySpec {
  nominalVoltage: number; // 공칭 전압 (예: 60V)
  capacity: number; // 용량 (Ah)
  cellCount: number; // 셀 직렬 수
  fullVoltage: number; // 만충 전압
  emptyVoltage: number; // 방전 전압
  type: 'li-ion' | 'li-po' | 'lfp'; // 배터리 타입
}

// 기본 배터리 스펙 (60V 리튬이온)
export const DEFAULT_BATTERY_SPEC: BatterySpec = {
  nominalVoltage: 60,
  capacity: 30,
  cellCount: 16, // 16S (16 * 3.7V = 59.2V nominal)
  fullVoltage: 67.2, // 4.2V * 16
  emptyVoltage: 48.0, // 3.0V * 16
  type: 'li-ion',
};

// 배터리 타입별 셀 전압 범위
const CELL_VOLTAGE_RANGES = {
  'li-ion': { full: 4.2, empty: 3.0, nominal: 3.7 },
  'li-po': { full: 4.2, empty: 3.0, nominal: 3.7 },
  'lfp': { full: 3.65, empty: 2.5, nominal: 3.2 }, // LiFePO4
};

/**
 * 배터리 스펙 생성 (전압과 용량으로부터)
 */
export function createBatterySpec(
  nominalVoltage: number,
  capacity: number,
  type: 'li-ion' | 'li-po' | 'lfp' = 'li-ion',
  fullVoltage?: number,
  emptyVoltage?: number
): BatterySpec {
  const cellRange = CELL_VOLTAGE_RANGES[type];
  const cellCount = Math.round(nominalVoltage / cellRange.nominal);
  
  return {
    nominalVoltage,
    capacity,
    cellCount,
    fullVoltage: fullVoltage ?? cellCount * cellRange.full,
    emptyVoltage: emptyVoltage ?? cellCount * cellRange.empty,
    type,
  };
}

/**
 * 전압으로부터 SOC(State of Charge) 계산
 * 선형 보간 사용 (실제는 비선형이지만 간단한 구현)
 */
export function calculateSoc(
  voltage: number,
  spec: BatterySpec = DEFAULT_BATTERY_SPEC
): number {
  if (voltage >= spec.fullVoltage) return 100;
  if (voltage <= spec.emptyVoltage) return 0;
  
  const range = spec.fullVoltage - spec.emptyVoltage;
  const current = voltage - spec.emptyVoltage;
  return Math.round((current / range) * 100);
}

/**
 * SOC로부터 전압 추정
 */
export function estimateVoltage(
  soc: number,
  spec: BatterySpec = DEFAULT_BATTERY_SPEC
): number {
  const clampedSoc = Math.max(0, Math.min(100, soc));
  const range = spec.fullVoltage - spec.emptyVoltage;
  return spec.emptyVoltage + (range * clampedSoc / 100);
}

/**
 * 에너지 소비량 계산 (Wh)
 */
export function calculateEnergyConsumed(
  startVoltage: number,
  endVoltage: number,
  spec: BatterySpec = DEFAULT_BATTERY_SPEC
): number {
  const startSoc = calculateSoc(startVoltage, spec);
  const endSoc = calculateSoc(endVoltage, spec);
  const socDiff = startSoc - endSoc;
  
  // 총 용량 (Wh) = 공칭 전압 * 용량(Ah)
  const totalCapacityWh = spec.nominalVoltage * spec.capacity;
  
  return (totalCapacityWh * socDiff) / 100;
}

/**
 * 연비 계산 (Wh/km)
 */
export function calculateEfficiency(
  energyConsumedWh: number,
  distanceMeters: number
): number {
  if (distanceMeters <= 0) return 0;
  const distanceKm = distanceMeters / 1000;
  return energyConsumedWh / distanceKm;
}

/**
 * 예상 주행 가능 거리 계산 (km)
 */
export function estimateRange(
  currentVoltage: number,
  averageEfficiency: number, // Wh/km
  spec: BatterySpec = DEFAULT_BATTERY_SPEC
): number {
  if (averageEfficiency <= 0) return 0;
  
  const currentSoc = calculateSoc(currentVoltage, spec);
  const totalCapacityWh = spec.nominalVoltage * spec.capacity;
  const remainingWh = (totalCapacityWh * currentSoc) / 100;
  
  return remainingWh / averageEfficiency;
}

/**
 * 목적지까지 예상 잔여 SOC 계산
 */
export function estimateArrivalSoc(
  currentVoltage: number,
  distanceKm: number,
  averageEfficiency: number, // Wh/km
  spec: BatterySpec = DEFAULT_BATTERY_SPEC
): number {
  const currentSoc = calculateSoc(currentVoltage, spec);
  const totalCapacityWh = spec.nominalVoltage * spec.capacity;
  
  const energyNeeded = distanceKm * averageEfficiency;
  const socNeeded = (energyNeeded / totalCapacityWh) * 100;
  
  return Math.max(0, currentSoc - socNeeded);
}

/**
 * 배터리 사이클 추정 (누적 주행거리 기반)
 * 일반적으로 리튬이온 배터리는 300-500 사이클에서 80% 용량 유지
 */
export function estimateBatteryCycles(
  totalDistanceMeters: number,
  averageEfficiency: number, // Wh/km
  spec: BatterySpec = DEFAULT_BATTERY_SPEC
): number {
  if (averageEfficiency <= 0) return 0;
  
  const totalDistanceKm = totalDistanceMeters / 1000;
  const totalEnergyUsed = totalDistanceKm * averageEfficiency;
  const totalCapacityWh = spec.nominalVoltage * spec.capacity;
  
  // 한 사이클 = 100% 방전 (실제로는 부분 방전이 많음)
  // 평균 방전 깊이를 50%로 가정
  const averageDischargeDepth = 0.5;
  const effectiveCycleCapacity = totalCapacityWh * averageDischargeDepth;
  
  return totalEnergyUsed / effectiveCycleCapacity;
}

/**
 * 배터리 건강도 추정 (%)
 * 사이클 수와 사용 패턴 기반
 */
export function estimateBatteryHealth(
  estimatedCycles: number,
  batteryType: 'li-ion' | 'li-po' | 'lfp' = 'li-ion'
): number {
  // 배터리 타입별 예상 수명 사이클
  const lifeCycles = {
    'li-ion': 500,
    'li-po': 400,
    'lfp': 2000, // LiFePO4는 수명이 매우 김
  };
  
  const maxCycles = lifeCycles[batteryType];
  
  // 선형 감소 모델 (실제는 비선형)
  // 80% 용량까지 감소하는 것을 기준
  const degradation = Math.min(estimatedCycles / maxCycles, 1) * 20;
  
  return Math.max(0, 100 - degradation);
}

/**
 * 온도 보정 계수 계산
 * 저온에서는 배터리 효율이 떨어짐
 */
export function getTemperatureCorrection(temperatureCelsius: number): number {
  // 25°C를 기준(1.0)으로 보정
  if (temperatureCelsius >= 20 && temperatureCelsius <= 30) {
    return 1.0;
  } else if (temperatureCelsius < 20) {
    // 저온: 효율 감소 (0°C에서 약 20% 감소)
    const factor = 1 - ((20 - temperatureCelsius) * 0.01);
    return Math.max(0.7, factor);
  } else {
    // 고온: 약간의 효율 증가 후 감소
    if (temperatureCelsius <= 40) {
      return 1.0;
    } else {
      const factor = 1 - ((temperatureCelsius - 40) * 0.02);
      return Math.max(0.8, factor);
    }
  }
}

/**
 * 주행 데이터 분석 결과 인터페이스
 */
export interface RideAnalysis {
  // 기본 정보
  distanceKm: number;
  durationMinutes: number;
  avgSpeedKmh: number;
  maxSpeedKmh: number;
  
  // 배터리 정보
  startVoltage: number;
  endVoltage: number;
  startSoc: number;
  endSoc: number;
  socConsumed: number;
  
  // 에너지 분석
  energyConsumedWh: number;
  efficiencyWhPerKm: number;
  
  // 예측 정보
  estimatedRangeKm: number;
  batteryHealthPercent: number;
  estimatedCycles: number;
}

/**
 * 주행 데이터 종합 분석
 */
export function analyzeRide(
  distanceMeters: number,
  durationSeconds: number,
  avgSpeed: number,
  maxSpeed: number,
  startVoltage: number,
  endVoltage: number,
  spec: BatterySpec = DEFAULT_BATTERY_SPEC,
  totalDistanceMeters?: number
): RideAnalysis {
  const startSoc = calculateSoc(startVoltage, spec);
  const endSoc = calculateSoc(endVoltage, spec);
  const socConsumed = startSoc - endSoc;
  
  const energyConsumedWh = calculateEnergyConsumed(startVoltage, endVoltage, spec);
  const efficiencyWhPerKm = calculateEfficiency(energyConsumedWh, distanceMeters);
  const estimatedRangeKm = estimateRange(endVoltage, efficiencyWhPerKm, spec);
  
  // 누적 주행거리가 있으면 배터리 건강도 계산
  const totalDistance = totalDistanceMeters ?? distanceMeters;
  const estimatedCycles = estimateBatteryCycles(totalDistance, efficiencyWhPerKm, spec);
  const batteryHealthPercent = estimateBatteryHealth(estimatedCycles, spec.type);
  
  return {
    distanceKm: distanceMeters / 1000,
    durationMinutes: durationSeconds / 60,
    avgSpeedKmh: avgSpeed,
    maxSpeedKmh: maxSpeed,
    startVoltage,
    endVoltage,
    startSoc,
    endSoc,
    socConsumed,
    energyConsumedWh,
    efficiencyWhPerKm,
    estimatedRangeKm,
    batteryHealthPercent,
    estimatedCycles,
  };
}

/**
 * 연비 데이터 집계 (여러 주행 기록 기반)
 */
export interface EfficiencyStats {
  averageEfficiency: number; // Wh/km
  minEfficiency: number;
  maxEfficiency: number;
  totalDistance: number; // km
  totalEnergy: number; // Wh
  rideCount: number;
}

export function aggregateEfficiencyStats(
  rides: Array<{ distanceMeters: number; energyWh: number }>
): EfficiencyStats {
  if (rides.length === 0) {
    return {
      averageEfficiency: 0,
      minEfficiency: 0,
      maxEfficiency: 0,
      totalDistance: 0,
      totalEnergy: 0,
      rideCount: 0,
    };
  }
  
  const efficiencies = rides
    .filter(r => r.distanceMeters > 0)
    .map(r => r.energyWh / (r.distanceMeters / 1000));
  
  const totalDistance = rides.reduce((sum, r) => sum + r.distanceMeters, 0) / 1000;
  const totalEnergy = rides.reduce((sum, r) => sum + r.energyWh, 0);
  
  return {
    averageEfficiency: totalEnergy / totalDistance,
    minEfficiency: Math.min(...efficiencies),
    maxEfficiency: Math.max(...efficiencies),
    totalDistance,
    totalEnergy,
    rideCount: rides.length,
  };
}
