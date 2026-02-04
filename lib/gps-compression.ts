/**
 * GPS 데이터 압축 유틸리티
 * 
 * Ramer-Douglas-Peucker (RDP) 알고리즘을 사용하여
 * GPS 포인트를 압축하여 저장 비용을 절감합니다.
 */

import { GpsPoint } from "./gps-utils";

/**
 * 점과 선분 사이의 수직 거리 계산
 * @param point 대상 점
 * @param lineStart 선분 시작점
 * @param lineEnd 선분 끝점
 * @returns 수직 거리 (미터)
 */
function perpendicularDistance(
  point: GpsPoint,
  lineStart: GpsPoint,
  lineEnd: GpsPoint
): number {
  // 선분이 점인 경우
  if (lineStart.latitude === lineEnd.latitude && lineStart.longitude === lineEnd.longitude) {
    return haversineDistance(point, lineStart);
  }

  // 선분 벡터
  const dx = lineEnd.longitude - lineStart.longitude;
  const dy = lineEnd.latitude - lineStart.latitude;

  // 선분 길이의 제곱
  const lineLengthSquared = dx * dx + dy * dy;

  // 점에서 선분에 내린 수선의 발 위치 (0~1 사이)
  let t = ((point.longitude - lineStart.longitude) * dx + (point.latitude - lineStart.latitude) * dy) / lineLengthSquared;
  t = Math.max(0, Math.min(1, t));

  // 수선의 발 좌표
  const nearestPoint: GpsPoint = {
    latitude: lineStart.latitude + t * dy,
    longitude: lineStart.longitude + t * dx,
    timestamp: 0,
    speed: 0,
    altitude: 0,
    accuracy: 0,
  };

  return haversineDistance(point, nearestPoint);
}

/**
 * Haversine 공식을 사용한 두 점 사이 거리 계산
 * @returns 거리 (미터)
 */
function haversineDistance(point1: GpsPoint, point2: GpsPoint): number {
  const R = 6371000; // 지구 반경 (미터)
  const lat1 = point1.latitude * Math.PI / 180;
  const lat2 = point2.latitude * Math.PI / 180;
  const deltaLat = (point2.latitude - point1.latitude) * Math.PI / 180;
  const deltaLon = (point2.longitude - point1.longitude) * Math.PI / 180;

  const a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
            Math.cos(lat1) * Math.cos(lat2) *
            Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Ramer-Douglas-Peucker 알고리즘으로 GPS 포인트 압축
 * 
 * @param points GPS 포인트 배열
 * @param epsilon 허용 오차 (미터) - 기본값 5m
 * @returns 압축된 GPS 포인트 배열
 */
export function compressGpsPoints(points: GpsPoint[], epsilon: number = 5): GpsPoint[] {
  if (points.length <= 2) {
    return points;
  }

  // 최대 거리를 가진 점 찾기
  let maxDistance = 0;
  let maxIndex = 0;

  const startPoint = points[0];
  const endPoint = points[points.length - 1];

  for (let i = 1; i < points.length - 1; i++) {
    const distance = perpendicularDistance(points[i], startPoint, endPoint);
    if (distance > maxDistance) {
      maxDistance = distance;
      maxIndex = i;
    }
  }

  // 최대 거리가 epsilon보다 크면 재귀적으로 분할
  if (maxDistance > epsilon) {
    const leftPoints = compressGpsPoints(points.slice(0, maxIndex + 1), epsilon);
    const rightPoints = compressGpsPoints(points.slice(maxIndex), epsilon);

    // 중복 제거하고 합치기
    return [...leftPoints.slice(0, -1), ...rightPoints];
  } else {
    // epsilon 이하면 시작점과 끝점만 유지
    return [startPoint, endPoint];
  }
}

/**
 * 압축 품질 레벨별 epsilon 값
 */
export const COMPRESSION_LEVELS = {
  // 최고 품질 (압축률 낮음) - 2m 오차
  high: 2,
  // 보통 품질 (권장) - 5m 오차
  medium: 5,
  // 저품질 (압축률 높음) - 10m 오차
  low: 10,
  // 최저 품질 (최대 압축) - 20m 오차
  minimal: 20,
};

/**
 * 압축 통계 계산
 */
export interface CompressionStats {
  originalCount: number;
  compressedCount: number;
  compressionRatio: number;  // 압축률 (%)
  savedPoints: number;
  epsilon: number;
}

export function getCompressionStats(
  originalPoints: GpsPoint[],
  compressedPoints: GpsPoint[],
  epsilon: number
): CompressionStats {
  const originalCount = originalPoints.length;
  const compressedCount = compressedPoints.length;
  const savedPoints = originalCount - compressedCount;
  const compressionRatio = originalCount > 0 
    ? Math.round((savedPoints / originalCount) * 100) 
    : 0;

  return {
    originalCount,
    compressedCount,
    compressionRatio,
    savedPoints,
    epsilon,
  };
}

/**
 * 주행 거리에 따른 적절한 압축 레벨 추천
 */
export function recommendCompressionLevel(distanceMeters: number): keyof typeof COMPRESSION_LEVELS {
  if (distanceMeters < 1000) {
    // 1km 미만: 높은 품질 유지
    return 'high';
  } else if (distanceMeters < 5000) {
    // 1-5km: 보통 품질
    return 'medium';
  } else if (distanceMeters < 20000) {
    // 5-20km: 저품질
    return 'low';
  } else {
    // 20km 이상: 최소 품질
    return 'minimal';
  }
}

/**
 * 스마트 압축 - 거리에 따라 자동으로 압축 레벨 결정
 */
export function smartCompress(points: GpsPoint[], distanceMeters: number): {
  points: GpsPoint[];
  stats: CompressionStats;
} {
  const level = recommendCompressionLevel(distanceMeters);
  const epsilon = COMPRESSION_LEVELS[level];
  const compressedPoints = compressGpsPoints(points, epsilon);
  const stats = getCompressionStats(points, compressedPoints, epsilon);

  console.log(`[GPS Compression] ${stats.originalCount} → ${stats.compressedCount} points (${stats.compressionRatio}% saved, epsilon=${epsilon}m)`);

  return {
    points: compressedPoints,
    stats,
  };
}

/**
 * 시간 기반 다운샘플링 (RDP 전처리용)
 * 너무 빈번한 GPS 포인트를 먼저 줄임
 */
export function downsampleByTime(points: GpsPoint[], minIntervalMs: number = 1000): GpsPoint[] {
  if (points.length <= 1) return points;

  const result: GpsPoint[] = [points[0]];
  let lastTimestamp = points[0].timestamp;

  for (let i = 1; i < points.length; i++) {
    if (points[i].timestamp - lastTimestamp >= minIntervalMs) {
      result.push(points[i]);
      lastTimestamp = points[i].timestamp;
    }
  }

  // 마지막 포인트 항상 포함
  if (result[result.length - 1] !== points[points.length - 1]) {
    result.push(points[points.length - 1]);
  }

  return result;
}

/**
 * 전체 압축 파이프라인
 * 1. 시간 기반 다운샘플링
 * 2. RDP 알고리즘 적용
 */
export function compressGpsData(
  points: GpsPoint[],
  distanceMeters: number,
  options?: {
    minTimeInterval?: number;  // 최소 시간 간격 (ms)
    customEpsilon?: number;    // 커스텀 epsilon
  }
): {
  points: GpsPoint[];
  stats: CompressionStats;
} {
  // 1. 시간 기반 다운샘플링
  const minInterval = options?.minTimeInterval ?? 1000;
  const downsampledPoints = downsampleByTime(points, minInterval);

  // 2. RDP 압축
  const epsilon = options?.customEpsilon ?? COMPRESSION_LEVELS[recommendCompressionLevel(distanceMeters)];
  const compressedPoints = compressGpsPoints(downsampledPoints, epsilon);

  // 통계 계산 (원본 대비)
  const stats = getCompressionStats(points, compressedPoints, epsilon);

  console.log(`[GPS Compression] Full pipeline: ${points.length} → ${downsampledPoints.length} → ${compressedPoints.length} points`);

  return {
    points: compressedPoints,
    stats,
  };
}
