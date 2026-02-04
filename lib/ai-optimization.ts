/**
 * AI 호출 최적화 유틸리티
 * 
 * 짧은 주행이나 의미없는 데이터에 대한 AI 분석을 건너뛰어
 * API 비용을 절감합니다.
 */

// AI 분석 최소 조건
export const AI_ANALYSIS_THRESHOLDS = {
  // 최소 주행 거리 (미터) - 500m 미만은 분석 가치 낮음
  MIN_DISTANCE_METERS: 500,
  
  // 최소 주행 시간 (초) - 2분 미만은 분석 가치 낮음
  MIN_DURATION_SECONDS: 120,
  
  // 최소 GPS 포인트 수 - 10개 미만은 데이터 부족
  MIN_GPS_POINTS: 10,
  
  // 최소 평균 속도 (km/h) - 3km/h 미만은 걷기 수준
  MIN_AVG_SPEED_KMH: 3,
  
  // 최대 평균 속도 (km/h) - 80km/h 초과는 데이터 오류 가능성
  MAX_AVG_SPEED_KMH: 80,
};

export interface RideDataForAnalysis {
  distance: number;       // 미터
  duration: number;       // 초
  avgSpeed: number;       // km/h
  maxSpeed: number;       // km/h
  gpsPointsCount?: number;
}

export interface AnalysisEligibilityResult {
  eligible: boolean;
  reason?: string;
  skipReason?: 'too_short' | 'too_slow' | 'data_error' | 'insufficient_data';
}

/**
 * 주행 데이터가 AI 분석에 적합한지 확인
 */
export function checkAnalysisEligibility(data: RideDataForAnalysis): AnalysisEligibilityResult {
  const { MIN_DISTANCE_METERS, MIN_DURATION_SECONDS, MIN_GPS_POINTS, MIN_AVG_SPEED_KMH, MAX_AVG_SPEED_KMH } = AI_ANALYSIS_THRESHOLDS;
  
  // 거리 체크
  if (data.distance < MIN_DISTANCE_METERS) {
    return {
      eligible: false,
      reason: `주행 거리가 ${MIN_DISTANCE_METERS}m 미만입니다.`,
      skipReason: 'too_short',
    };
  }
  
  // 시간 체크
  if (data.duration < MIN_DURATION_SECONDS) {
    return {
      eligible: false,
      reason: `주행 시간이 ${MIN_DURATION_SECONDS / 60}분 미만입니다.`,
      skipReason: 'too_short',
    };
  }
  
  // GPS 포인트 체크
  if (data.gpsPointsCount !== undefined && data.gpsPointsCount < MIN_GPS_POINTS) {
    return {
      eligible: false,
      reason: `GPS 데이터가 ${MIN_GPS_POINTS}개 미만입니다.`,
      skipReason: 'insufficient_data',
    };
  }
  
  // 평균 속도 체크 (너무 느림)
  if (data.avgSpeed < MIN_AVG_SPEED_KMH) {
    return {
      eligible: false,
      reason: `평균 속도가 ${MIN_AVG_SPEED_KMH}km/h 미만입니다.`,
      skipReason: 'too_slow',
    };
  }
  
  // 평균 속도 체크 (데이터 오류)
  if (data.avgSpeed > MAX_AVG_SPEED_KMH) {
    return {
      eligible: false,
      reason: `평균 속도가 ${MAX_AVG_SPEED_KMH}km/h를 초과합니다. GPS 오류일 수 있습니다.`,
      skipReason: 'data_error',
    };
  }
  
  // 최고 속도가 비정상적으로 높은 경우 (100km/h 초과)
  if (data.maxSpeed > 100) {
    return {
      eligible: false,
      reason: '최고 속도가 100km/h를 초과합니다. GPS 오류일 수 있습니다.',
      skipReason: 'data_error',
    };
  }
  
  return { eligible: true };
}

/**
 * 분석 건너뛰기 시 기본 분석 결과 생성
 */
export function generateDefaultAnalysis(data: RideDataForAnalysis, skipReason: string): {
  summary: string;
  efficiencyScore: string;
  ridingStyle: string;
  batteryStatus: string | null;
  tips: string[];
  highlights: string[];
} {
  const distanceKm = (data.distance / 1000).toFixed(1);
  const durationMin = Math.floor(data.duration / 60);
  
  let summary = '';
  let tips: string[] = [];
  let highlights: string[] = [];
  
  switch (skipReason) {
    case 'too_short':
      summary = `${distanceKm}km 짧은 주행을 완료했습니다.`;
      tips = ['더 긴 주행으로 정확한 분석을 받아보세요', '안전 장비를 착용해주세요'];
      highlights = ['짧은 거리도 꾸준히!', '안전하게 주행했어요'];
      break;
    case 'too_slow':
      summary = `${durationMin}분간 천천히 주행했습니다.`;
      tips = ['안전한 속도로 주행하고 있어요', '더 활발한 주행도 시도해보세요'];
      highlights = ['안전 제일!', '여유로운 라이딩'];
      break;
    case 'data_error':
      summary = `${distanceKm}km 주행 완료. GPS 데이터에 이상이 있을 수 있습니다.`;
      tips = ['GPS 신호가 좋은 곳에서 주행해보세요', '터널이나 건물 사이는 GPS 오류가 발생할 수 있어요'];
      highlights = ['주행 완료!', '다음엔 더 정확한 기록을'];
      break;
    case 'insufficient_data':
      summary = `${distanceKm}km 주행 완료. GPS 데이터가 부족합니다.`;
      tips = ['GPS 권한을 확인해주세요', '위치 서비스가 켜져있는지 확인해주세요'];
      highlights = ['주행 완료!', '다음엔 더 많은 데이터를'];
      break;
    default:
      summary = `${distanceKm}km 주행을 완료했습니다.`;
      tips = ['꾸준한 주행으로 연비를 높여보세요', '안전 장비를 착용해주세요'];
      highlights = ['오늘도 안전하게!', '꾸준한 라이딩'];
  }
  
  // 주행 스타일 추정
  let ridingStyle = '보통';
  if (data.maxSpeed > 40) {
    ridingStyle = '공격적';
  } else if (data.avgSpeed < 15) {
    ridingStyle = '안정적';
  }
  
  return {
    summary,
    efficiencyScore: '보통',
    ridingStyle,
    batteryStatus: null,
    tips,
    highlights,
  };
}

/**
 * AI 분석 비용 절감 통계 (로깅용)
 */
let analysisStats = {
  totalRequests: 0,
  skippedRequests: 0,
  savedCalls: 0,
};

export function recordAnalysisRequest(wasSkipped: boolean): void {
  analysisStats.totalRequests++;
  if (wasSkipped) {
    analysisStats.skippedRequests++;
    analysisStats.savedCalls++;
  }
}

export function getAnalysisStats(): typeof analysisStats {
  return { ...analysisStats };
}

export function resetAnalysisStats(): void {
  analysisStats = {
    totalRequests: 0,
    skippedRequests: 0,
    savedCalls: 0,
  };
}
