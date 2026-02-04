/**
 * AI 컨텍스트 압축 유틸리티
 * 
 * AI API 호출 시 전송하는 데이터를 압축하여
 * 토큰 비용을 절감합니다.
 */

import { GpsPoint } from "./gps-utils";

/**
 * 주행 데이터 요약 생성
 * 상세 GPS 데이터 대신 핵심 통계만 전송
 */
export interface RideSummary {
  // 기본 통계
  distanceKm: number;
  durationMin: number;
  avgSpeedKmh: number;
  maxSpeedKmh: number;
  
  // 배터리 (선택)
  batteryUsed?: number;  // %
  efficiency?: number;   // Wh/km
  
  // 주행 패턴 (선택)
  stopCount?: number;
  suddenAccelerations?: number;
  suddenDecelerations?: number;
  
  // 지형 (선택)
  elevationGain?: number;
  elevationLoss?: number;
  
  // 날씨 (선택)
  temperature?: number;
  weatherCondition?: string;
}

/**
 * GPS 포인트 배열에서 핵심 통계 추출
 */
export function extractGpsStats(points: GpsPoint[]): {
  avgSpeed: number;
  maxSpeed: number;
  stopCount: number;
  suddenAccelerations: number;
  suddenDecelerations: number;
} {
  if (points.length === 0) {
    return {
      avgSpeed: 0,
      maxSpeed: 0,
      stopCount: 0,
      suddenAccelerations: 0,
      suddenDecelerations: 0,
    };
  }

  let totalSpeed = 0;
  let maxSpeed = 0;
  let stopCount = 0;
  let suddenAccelerations = 0;
  let suddenDecelerations = 0;
  let prevSpeed = 0;
  let wasMoving = false;

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

    // 급가속/급감속 감지 (5km/h 이상 변화)
    if (i > 0) {
      const speedChange = speed - prevSpeed;
      if (speedChange > 5) {
        suddenAccelerations++;
      } else if (speedChange < -5) {
        suddenDecelerations++;
      }
    }
    prevSpeed = speed;
  }

  return {
    avgSpeed: totalSpeed / points.length,
    maxSpeed,
    stopCount,
    suddenAccelerations,
    suddenDecelerations,
  };
}

/**
 * 프롬프트 압축 - 불필요한 공백 및 반복 제거
 */
export function compressPrompt(prompt: string): string {
  return prompt
    // 연속 공백 제거
    .replace(/\s+/g, ' ')
    // 연속 줄바꿈 제거
    .replace(/\n\s*\n/g, '\n')
    // 앞뒤 공백 제거
    .trim();
}

/**
 * 숫자 포맷팅 - 불필요한 소수점 제거
 */
export function formatNumber(num: number, decimals: number = 1): string {
  const formatted = num.toFixed(decimals);
  // 소수점 이하가 모두 0이면 정수로 표시
  if (formatted.endsWith('.0')) {
    return formatted.slice(0, -2);
  }
  return formatted;
}

/**
 * 주행 데이터를 압축된 프롬프트로 변환
 */
export function createCompressedRidePrompt(summary: RideSummary): string {
  const parts: string[] = [];
  
  // 필수 정보
  parts.push(`거리:${formatNumber(summary.distanceKm)}km`);
  parts.push(`시간:${formatNumber(summary.durationMin)}분`);
  parts.push(`평균:${formatNumber(summary.avgSpeedKmh)}km/h`);
  parts.push(`최고:${formatNumber(summary.maxSpeedKmh)}km/h`);
  
  // 배터리 정보
  if (summary.batteryUsed !== undefined) {
    parts.push(`배터리:${formatNumber(summary.batteryUsed)}%`);
  }
  if (summary.efficiency !== undefined) {
    parts.push(`연비:${formatNumber(summary.efficiency)}Wh/km`);
  }
  
  // 주행 패턴
  if (summary.stopCount !== undefined && summary.stopCount > 0) {
    parts.push(`정지:${summary.stopCount}회`);
  }
  if (summary.suddenAccelerations !== undefined && summary.suddenAccelerations > 0) {
    parts.push(`급가속:${summary.suddenAccelerations}회`);
  }
  if (summary.suddenDecelerations !== undefined && summary.suddenDecelerations > 0) {
    parts.push(`급감속:${summary.suddenDecelerations}회`);
  }
  
  // 지형
  if (summary.elevationGain !== undefined && summary.elevationGain > 0) {
    parts.push(`상승:${formatNumber(summary.elevationGain, 0)}m`);
  }
  if (summary.elevationLoss !== undefined && summary.elevationLoss > 0) {
    parts.push(`하강:${formatNumber(Math.abs(summary.elevationLoss), 0)}m`);
  }
  
  // 날씨
  if (summary.temperature !== undefined) {
    parts.push(`기온:${formatNumber(summary.temperature, 0)}°C`);
  }
  if (summary.weatherCondition) {
    parts.push(`날씨:${summary.weatherCondition}`);
  }
  
  return parts.join(' ');
}

/**
 * 토큰 수 추정 (대략적)
 * 한글은 대략 1.5 토큰, 영어/숫자는 0.25 토큰
 */
export function estimateTokens(text: string): number {
  let tokens = 0;
  for (const char of text) {
    if (/[\u3131-\uD79D]/.test(char)) {
      // 한글
      tokens += 1.5;
    } else if (/[a-zA-Z0-9]/.test(char)) {
      // 영어/숫자
      tokens += 0.25;
    } else {
      // 기타 (공백, 특수문자)
      tokens += 0.5;
    }
  }
  return Math.ceil(tokens);
}

/**
 * 압축 효과 계산
 */
export function calculateCompressionSavings(
  originalPrompt: string,
  compressedPrompt: string
): {
  originalTokens: number;
  compressedTokens: number;
  savedTokens: number;
  savingsPercent: number;
} {
  const originalTokens = estimateTokens(originalPrompt);
  const compressedTokens = estimateTokens(compressedPrompt);
  const savedTokens = originalTokens - compressedTokens;
  const savingsPercent = originalTokens > 0 
    ? Math.round((savedTokens / originalTokens) * 100) 
    : 0;

  return {
    originalTokens,
    compressedTokens,
    savedTokens,
    savingsPercent,
  };
}

/**
 * 시스템 프롬프트 최적화
 * 반복되는 지시사항을 간결하게
 */
export const OPTIMIZED_SYSTEM_PROMPT = `전동킥보드 주행 분석 AI. 간결한 JSON 리포트 제공.
응답: {"summary":"1-2문장","efficiency_score":"좋음/보통/개선필요","riding_style":"안정적/보통/공격적","battery_status":"좋음/보통/주의필요 또는 null","tips":["팁1","팁2"],"highlights":["좋은점1","좋은점2"]}
한국어, 각 항목 20자 이내, tips/highlights 각 2개, 배터리 데이터 없으면 null`;

/**
 * 압축된 AI 분석 요청 생성
 */
export function createOptimizedAnalysisRequest(
  distanceM: number,
  durationS: number,
  avgSpeedKmh: number,
  maxSpeedKmh: number,
  options?: {
    batteryUsed?: number;
    efficiency?: number;
    stopCount?: number;
    suddenAccelerations?: number;
    suddenDecelerations?: number;
    elevationGain?: number;
    elevationLoss?: number;
    temperature?: number;
    weatherCondition?: string;
  }
): { systemPrompt: string; userPrompt: string; estimatedTokens: number } {
  const summary: RideSummary = {
    distanceKm: distanceM / 1000,
    durationMin: durationS / 60,
    avgSpeedKmh,
    maxSpeedKmh,
    ...options,
  };

  const userPrompt = createCompressedRidePrompt(summary);
  const estimatedTokens = estimateTokens(OPTIMIZED_SYSTEM_PROMPT) + estimateTokens(userPrompt);

  return {
    systemPrompt: OPTIMIZED_SYSTEM_PROMPT,
    userPrompt,
    estimatedTokens,
  };
}
