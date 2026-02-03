import AsyncStorage from "@react-native-async-storage/async-storage";
import { getRidingRecords, RidingRecord } from "./riding-store";
import { parseDate } from "./date-utils";

const GOALS_KEY = "@scoop_goals";

export interface RidingGoals {
  dailyDistance: number; // meters
  dailyDuration: number; // seconds
  weeklyDistance: number; // meters
  weeklyRides: number;
  enabled: boolean;
}

export interface GoalProgress {
  daily: {
    distance: { current: number; target: number; percentage: number };
    duration: { current: number; target: number; percentage: number };
  };
  weekly: {
    distance: { current: number; target: number; percentage: number };
    rides: { current: number; target: number; percentage: number };
  };
}

const DEFAULT_GOALS: RidingGoals = {
  dailyDistance: 5000, // 5km
  dailyDuration: 1800, // 30 minutes
  weeklyDistance: 30000, // 30km
  weeklyRides: 5,
  enabled: true,
};

/**
 * Get riding goals from storage
 */
export async function getGoals(): Promise<RidingGoals> {
  try {
    const data = await AsyncStorage.getItem(GOALS_KEY);
    if (data) {
      return { ...DEFAULT_GOALS, ...JSON.parse(data) };
    }
    return DEFAULT_GOALS;
  } catch (error) {
    console.error("Failed to get goals:", error);
    return DEFAULT_GOALS;
  }
}

/**
 * Save riding goals to storage
 */
export async function saveGoals(goals: RidingGoals): Promise<void> {
  try {
    await AsyncStorage.setItem(GOALS_KEY, JSON.stringify(goals));
  } catch (error) {
    console.error("Failed to save goals:", error);
    throw error;
  }
}

/**
 * Get start of today in local timezone
 */
function getStartOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/**
 * Get start of this week (Monday) in local timezone
 */
function getStartOfWeek(): Date {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Monday = 0
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diff);
  return monday;
}

/**
 * Calculate goal progress based on riding records
 */
export async function calculateProgress(): Promise<GoalProgress> {
  const goals = await getGoals();
  const records = await getRidingRecords();
  
  const startOfToday = getStartOfToday();
  const startOfWeek = getStartOfWeek();
  
  // Filter records for today
  const todayRecords = records.filter((r) => {
    const recordDate = parseDate(r.date);
    if (!recordDate) return false;
    return recordDate >= startOfToday;
  });
  
  // Filter records for this week
  const weekRecords = records.filter((r) => {
    const recordDate = parseDate(r.date);
    if (!recordDate) return false;
    return recordDate >= startOfWeek;
  });
  
  // Calculate daily progress
  const dailyDistance = todayRecords.reduce((sum, r) => sum + r.distance, 0);
  const dailyDuration = todayRecords.reduce((sum, r) => sum + r.duration, 0);
  
  // Calculate weekly progress
  const weeklyDistance = weekRecords.reduce((sum, r) => sum + r.distance, 0);
  const weeklyRides = weekRecords.length;
  
  return {
    daily: {
      distance: {
        current: dailyDistance,
        target: goals.dailyDistance,
        percentage: Math.min(100, (dailyDistance / goals.dailyDistance) * 100),
      },
      duration: {
        current: dailyDuration,
        target: goals.dailyDuration,
        percentage: Math.min(100, (dailyDuration / goals.dailyDuration) * 100),
      },
    },
    weekly: {
      distance: {
        current: weeklyDistance,
        target: goals.weeklyDistance,
        percentage: Math.min(100, (weeklyDistance / goals.weeklyDistance) * 100),
      },
      rides: {
        current: weeklyRides,
        target: goals.weeklyRides,
        percentage: Math.min(100, (weeklyRides / goals.weeklyRides) * 100),
      },
    },
  };
}

/**
 * Format distance for display
 */
export function formatDistance(meters: number): string {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(1)}km`;
  }
  return `${Math.round(meters)}m`;
}

/**
 * Format duration for display
 */
export function formatGoalDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  
  if (hours > 0) {
    return `${hours}시간 ${minutes}분`;
  }
  return `${minutes}분`;
}
