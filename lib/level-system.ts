// Level System Configuration
// 레벨 시스템 - 거리 기준 10배 증가 (마지막 레벨은 100,000km 이상)

export interface LevelInfo {
  level: number;
  title: string;
  titleEn: string; // English title for display
  minDistance: number; // km
  maxDistance: number; // km
  color: string;
}

// Level definitions with 10x distance requirements
// 마지막 레벨은 100,000km 이상
export const LEVEL_DEFINITIONS: LevelInfo[] = [
  { level: 1, title: "루키 라이더", titleEn: "Rookie Rider", minDistance: 0, maxDistance: 500, color: "#9CA3AF" },
  { level: 2, title: "주니어 라이더", titleEn: "Junior Rider", minDistance: 500, maxDistance: 2000, color: "#22C55E" },
  { level: 3, title: "시니어 라이더", titleEn: "Senior Rider", minDistance: 2000, maxDistance: 5000, color: "#3B82F6" },
  { level: 4, title: "프로 라이더", titleEn: "Pro Rider", minDistance: 5000, maxDistance: 10000, color: "#8B5CF6" },
  { level: 5, title: "마스터 라이더", titleEn: "Master Rider", minDistance: 10000, maxDistance: 50000, color: "#F59E0B" },
  { level: 6, title: "레전드 라이더", titleEn: "Legend Rider", minDistance: 50000, maxDistance: 100000, color: "#EF4444" },
  { level: 7, title: "신화 라이더", titleEn: "Mythic Rider", minDistance: 100000, maxDistance: Infinity, color: "#EC4899" },
];

// Get level info from total distance in km
export function getLevelInfo(totalDistanceKm: number): LevelInfo {
  for (let i = LEVEL_DEFINITIONS.length - 1; i >= 0; i--) {
    if (totalDistanceKm >= LEVEL_DEFINITIONS[i].minDistance) {
      return LEVEL_DEFINITIONS[i];
    }
  }
  return LEVEL_DEFINITIONS[0];
}

// Calculate level number from total distance in km
export function calculateLevel(totalDistanceKm: number): { level: number; progress: number; nextLevelDistance: number } {
  const levelInfo = getLevelInfo(totalDistanceKm);
  const levelIndex = LEVEL_DEFINITIONS.findIndex(l => l.level === levelInfo.level);
  
  // Calculate progress to next level
  const currentLevelMin = levelInfo.minDistance;
  const currentLevelMax = levelInfo.maxDistance;
  
  if (currentLevelMax === Infinity) {
    // Max level reached
    return { level: levelInfo.level, progress: 1, nextLevelDistance: 0 };
  }
  
  const levelRange = currentLevelMax - currentLevelMin;
  const distanceInLevel = totalDistanceKm - currentLevelMin;
  const progress = Math.min(1, distanceInLevel / levelRange);
  const nextLevelDistance = currentLevelMax - totalDistanceKm;
  
  return { level: levelInfo.level, progress, nextLevelDistance };
}

// Get level title from level number (returns English title)
export function getLevelTitle(level: number): string {
  const levelDef = LEVEL_DEFINITIONS.find(l => l.level === level);
  return levelDef?.titleEn || "Rookie Rider";
}

// Get level title in Korean from level number
export function getLevelTitleKo(level: number): string {
  const levelDef = LEVEL_DEFINITIONS.find(l => l.level === level);
  return levelDef?.title || "루키 라이더";
}

// Get level color from level number
export function getLevelColor(level: number): string {
  const levelDef = LEVEL_DEFINITIONS.find(l => l.level === level);
  return levelDef?.color || "#9CA3AF";
}

// Format distance for display (숫자 형식: 5,000km)
export function formatLevelDistance(distanceKm: number): string {
  return `${distanceKm.toLocaleString()}km`;
}
