/**
 * 주행 데이터 분석 유틸리티
 * GPS 포인트에서 가속도, 경사도, 급가속/급감속 등을 계산
 */

export interface GpsPoint {
  latitude: number;
  longitude: number;
  altitude: number | null;
  timestamp: number;
  speed: number | null; // m/s
  accuracy: number | null;
}

export interface RideAnalysisResult {
  // 가속도 분석
  suddenAccelerations: number; // 급가속 횟수 (3m/s² 이상)
  suddenDecelerations: number; // 급감속 횟수 (-3m/s² 이하)
  avgAcceleration: number; // 평균 가속도 (절대값)
  maxAcceleration: number; // 최대 가속도
  maxDeceleration: number; // 최대 감속도 (음수)
  
  // 정지 분석
  stopCount: number; // 정지 횟수 (속도 1km/h 이하로 떨어진 횟수)
  
  // 고도/경사도 분석
  elevationGain: number; // 총 상승 고도 (m)
  elevationLoss: number; // 총 하강 고도 (m)
  maxElevation: number; // 최고 고도 (m)
  minElevation: number; // 최저 고도 (m)
  avgGradient: number; // 평균 경사도 (%)
}

// 급가속/급감속 임계값 (m/s²)
const SUDDEN_ACCELERATION_THRESHOLD = 3.0; // 3m/s² 이상 = 급가속
const SUDDEN_DECELERATION_THRESHOLD = -3.0; // -3m/s² 이하 = 급감속

// 정지 판정 속도 (km/h)
const STOP_SPEED_THRESHOLD = 1.0;

// 고도 변화 최소 임계값 (노이즈 필터링)
const MIN_ELEVATION_CHANGE = 1.0; // 1m 이상 변화만 카운트

/**
 * GPS 포인트 배열에서 주행 분석 데이터 계산
 */
export function analyzeRideData(gpsPoints: GpsPoint[]): RideAnalysisResult | null {
  if (!gpsPoints || gpsPoints.length < 2) {
    return null;
  }

  // 결과 초기화
  let suddenAccelerations = 0;
  let suddenDecelerations = 0;
  let totalAcceleration = 0;
  let accelerationCount = 0;
  let maxAcceleration = 0;
  let maxDeceleration = 0;
  let stopCount = 0;
  let wasMoving = false;
  
  let elevationGain = 0;
  let elevationLoss = 0;
  let maxElevation = -Infinity;
  let minElevation = Infinity;
  let lastValidElevation: number | null = null;

  // 포인트 순회하며 분석
  for (let i = 1; i < gpsPoints.length; i++) {
    const prevPoint = gpsPoints[i - 1];
    const currPoint = gpsPoints[i];
    
    // 시간 차이 (초)
    const timeDiff = (currPoint.timestamp - prevPoint.timestamp) / 1000;
    if (timeDiff <= 0 || timeDiff > 10) continue; // 비정상적인 시간 간격 무시
    
    // 속도 분석 (m/s → km/h)
    const prevSpeedKmh = prevPoint.speed !== null ? prevPoint.speed * 3.6 : 0;
    const currSpeedKmh = currPoint.speed !== null ? currPoint.speed * 3.6 : 0;
    
    // 정지 카운트
    const isMoving = currSpeedKmh > STOP_SPEED_THRESHOLD;
    if (wasMoving && !isMoving) {
      stopCount++;
    }
    wasMoving = isMoving;
    
    // 가속도 계산 (m/s²)
    if (prevPoint.speed !== null && currPoint.speed !== null) {
      const acceleration = (currPoint.speed - prevPoint.speed) / timeDiff;
      
      // 비현실적인 가속도 필터링 (GPS 오류)
      if (Math.abs(acceleration) < 15) { // 15m/s² 이상은 무시
        totalAcceleration += Math.abs(acceleration);
        accelerationCount++;
        
        if (acceleration > maxAcceleration) maxAcceleration = acceleration;
        if (acceleration < maxDeceleration) maxDeceleration = acceleration;
        
        if (acceleration >= SUDDEN_ACCELERATION_THRESHOLD) {
          suddenAccelerations++;
        } else if (acceleration <= SUDDEN_DECELERATION_THRESHOLD) {
          suddenDecelerations++;
        }
      }
    }
    
    // 고도 분석
    if (currPoint.altitude !== null) {
      // 최고/최저 고도
      if (currPoint.altitude > maxElevation) maxElevation = currPoint.altitude;
      if (currPoint.altitude < minElevation) minElevation = currPoint.altitude;
      
      // 상승/하강 고도
      if (lastValidElevation !== null) {
        const elevationDiff = currPoint.altitude - lastValidElevation;
        
        // 노이즈 필터링
        if (Math.abs(elevationDiff) >= MIN_ELEVATION_CHANGE) {
          if (elevationDiff > 0) {
            elevationGain += elevationDiff;
          } else {
            elevationLoss += Math.abs(elevationDiff);
          }
          lastValidElevation = currPoint.altitude;
        }
      } else {
        lastValidElevation = currPoint.altitude;
      }
    }
  }

  // 평균 가속도 계산
  const avgAcceleration = accelerationCount > 0 ? totalAcceleration / accelerationCount : 0;
  
  // 평균 경사도 계산 (총 고도 변화 / 총 거리)
  const totalElevationChange = elevationGain + elevationLoss;
  const totalDistance = calculateTotalDistance(gpsPoints);
  const avgGradient = totalDistance > 0 ? (totalElevationChange / totalDistance) * 100 : 0;

  return {
    suddenAccelerations,
    suddenDecelerations,
    avgAcceleration,
    maxAcceleration,
    maxDeceleration,
    stopCount,
    elevationGain,
    elevationLoss,
    maxElevation: maxElevation === -Infinity ? 0 : maxElevation,
    minElevation: minElevation === Infinity ? 0 : minElevation,
    avgGradient,
  };
}

/**
 * GPS 포인트 배열에서 총 거리 계산 (미터)
 */
function calculateTotalDistance(gpsPoints: GpsPoint[]): number {
  let totalDistance = 0;
  
  for (let i = 1; i < gpsPoints.length; i++) {
    const prev = gpsPoints[i - 1];
    const curr = gpsPoints[i];
    totalDistance += haversineDistance(
      prev.latitude, prev.longitude,
      curr.latitude, curr.longitude
    );
  }
  
  return totalDistance;
}

/**
 * Haversine 공식으로 두 좌표 간 거리 계산 (미터)
 */
function haversineDistance(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const R = 6371000; // 지구 반경 (미터)
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}
