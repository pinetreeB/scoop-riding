// GPX 파일 파싱 유틸리티

export interface GpxPoint {
  latitude: number;
  longitude: number;
  elevation?: number;
  time?: string;
}

export interface GpxRoute {
  name: string;
  description?: string;
  points: GpxPoint[];
  totalDistance: number; // meters
  estimatedDuration: number; // seconds
}

// GPX XML 파싱
export function parseGpxContent(gpxContent: string): GpxRoute | null {
  try {
    // Simple XML parsing without external library
    const nameMatch = gpxContent.match(/<name>([^<]*)<\/name>/);
    const descMatch = gpxContent.match(/<desc>([^<]*)<\/desc>/);
    
    // Extract track points or route points
    const points: GpxPoint[] = [];
    
    // Match <trkpt> or <rtept> tags
    const pointRegex = /<(?:trkpt|rtept|wpt)[^>]*lat="([^"]*)"[^>]*lon="([^"]*)"[^>]*>([\s\S]*?)<\/(?:trkpt|rtept|wpt)>/g;
    const pointRegex2 = /<(?:trkpt|rtept|wpt)[^>]*lon="([^"]*)"[^>]*lat="([^"]*)"[^>]*>([\s\S]*?)<\/(?:trkpt|rtept|wpt)>/g;
    
    let match;
    while ((match = pointRegex.exec(gpxContent)) !== null) {
      const lat = parseFloat(match[1]);
      const lon = parseFloat(match[2]);
      const content = match[3];
      
      const eleMatch = content.match(/<ele>([^<]*)<\/ele>/);
      const timeMatch = content.match(/<time>([^<]*)<\/time>/);
      
      if (!isNaN(lat) && !isNaN(lon)) {
        points.push({
          latitude: lat,
          longitude: lon,
          elevation: eleMatch ? parseFloat(eleMatch[1]) : undefined,
          time: timeMatch ? timeMatch[1] : undefined,
        });
      }
    }
    
    // Try alternate format if no points found
    if (points.length === 0) {
      while ((match = pointRegex2.exec(gpxContent)) !== null) {
        const lon = parseFloat(match[1]);
        const lat = parseFloat(match[2]);
        const content = match[3];
        
        const eleMatch = content.match(/<ele>([^<]*)<\/ele>/);
        const timeMatch = content.match(/<time>([^<]*)<\/time>/);
        
        if (!isNaN(lat) && !isNaN(lon)) {
          points.push({
            latitude: lat,
            longitude: lon,
            elevation: eleMatch ? parseFloat(eleMatch[1]) : undefined,
            time: timeMatch ? timeMatch[1] : undefined,
          });
        }
      }
    }
    
    if (points.length === 0) {
      return null;
    }
    
    // Calculate total distance
    let totalDistance = 0;
    for (let i = 1; i < points.length; i++) {
      totalDistance += calculateHaversineDistance(
        points[i - 1].latitude,
        points[i - 1].longitude,
        points[i].latitude,
        points[i].longitude
      );
    }
    
    // Estimate duration based on average speed of 15 km/h
    const estimatedDuration = (totalDistance / 1000) / 15 * 3600;
    
    return {
      name: nameMatch ? nameMatch[1] : "가져온 경로",
      description: descMatch ? descMatch[1] : undefined,
      points,
      totalDistance,
      estimatedDuration: Math.round(estimatedDuration),
    };
  } catch (error) {
    console.error("GPX parsing error:", error);
    return null;
  }
}

// Haversine 거리 계산 (meters)
function calculateHaversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // Earth's radius in meters
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

// 현재 위치에서 가장 가까운 경로 포인트 찾기
export function findNearestPointIndex(
  currentLat: number,
  currentLon: number,
  points: GpxPoint[]
): number {
  let nearestIndex = 0;
  let minDistance = Infinity;
  
  for (let i = 0; i < points.length; i++) {
    const dist = calculateHaversineDistance(
      currentLat,
      currentLon,
      points[i].latitude,
      points[i].longitude
    );
    if (dist < minDistance) {
      minDistance = dist;
      nearestIndex = i;
    }
  }
  
  return nearestIndex;
}

// 경로까지의 거리 계산 (meters)
export function calculateDistanceToRoute(
  currentLat: number,
  currentLon: number,
  points: GpxPoint[]
): number {
  const nearestIndex = findNearestPointIndex(currentLat, currentLon, points);
  return calculateHaversineDistance(
    currentLat,
    currentLon,
    points[nearestIndex].latitude,
    points[nearestIndex].longitude
  );
}

// 남은 거리 계산 (meters)
export function calculateRemainingDistance(
  currentLat: number,
  currentLon: number,
  points: GpxPoint[]
): number {
  const nearestIndex = findNearestPointIndex(currentLat, currentLon, points);
  
  let remaining = 0;
  for (let i = nearestIndex; i < points.length - 1; i++) {
    remaining += calculateHaversineDistance(
      points[i].latitude,
      points[i].longitude,
      points[i + 1].latitude,
      points[i + 1].longitude
    );
  }
  
  return remaining;
}
