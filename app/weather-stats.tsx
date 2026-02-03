import { useState, useEffect, useMemo } from "react";
import { Text, View, ScrollView, Pressable, Platform } from "react-native";
import { useRouter } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Haptics from "expo-haptics";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { WeatherIcon } from "@/components/weather-icon";
import { getRidingRecords, type RidingRecord } from "@/lib/riding-store";

type WeatherCategory = "sunny" | "cloudy" | "rainy" | "snowy" | "all";

interface WeatherStats {
  category: WeatherCategory;
  label: string;
  icon: string;
  rideCount: number;
  totalDistance: number; // meters
  totalDuration: number; // seconds
  avgSpeed: number; // km/h
  avgTemperature: number | null;
  avgHumidity: number | null;
}

/**
 * 날씨 상태를 카테고리로 분류
 */
function categorizeWeather(condition?: string): WeatherCategory {
  if (!condition) return "sunny";
  
  const condLower = condition.toLowerCase();
  
  if (condLower.includes("비") || condLower.includes("rain") || condLower.includes("소나기")) {
    return "rainy";
  }
  if (condLower.includes("눈") || condLower.includes("snow")) {
    return "snowy";
  }
  if (condLower.includes("흐림") || condLower.includes("구름") || condLower.includes("cloudy")) {
    return "cloudy";
  }
  
  return "sunny";
}

/**
 * 날씨 카테고리 정보
 */
const WEATHER_CATEGORIES: { category: WeatherCategory; label: string; icon: string; color: string }[] = [
  { category: "all", label: "전체", icon: "analytics", color: "#6366F1" },
  { category: "sunny", label: "맑음", icon: "wb-sunny", color: "#FFB800" },
  { category: "cloudy", label: "흐림", icon: "cloud", color: "#9E9E9E" },
  { category: "rainy", label: "비", icon: "grain", color: "#4A90D9" },
  { category: "snowy", label: "눈", icon: "ac-unit", color: "#87CEEB" },
];

export default function WeatherStatsScreen() {
  const router = useRouter();
  const colors = useColors();
  const [records, setRecords] = useState<RidingRecord[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<WeatherCategory>("all");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadRecords();
  }, []);

  const loadRecords = async () => {
    setIsLoading(true);
    try {
      const allRecords = await getRidingRecords();
      setRecords(allRecords);
    } catch (error) {
      console.error("Failed to load records:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // 날씨별 통계 계산
  const weatherStats = useMemo(() => {
    const stats: Record<WeatherCategory, WeatherStats> = {
      all: { category: "all", label: "전체", icon: "analytics", rideCount: 0, totalDistance: 0, totalDuration: 0, avgSpeed: 0, avgTemperature: null, avgHumidity: null },
      sunny: { category: "sunny", label: "맑음", icon: "wb-sunny", rideCount: 0, totalDistance: 0, totalDuration: 0, avgSpeed: 0, avgTemperature: null, avgHumidity: null },
      cloudy: { category: "cloudy", label: "흐림", icon: "cloud", rideCount: 0, totalDistance: 0, totalDuration: 0, avgSpeed: 0, avgTemperature: null, avgHumidity: null },
      rainy: { category: "rainy", label: "비", icon: "grain", rideCount: 0, totalDistance: 0, totalDuration: 0, avgSpeed: 0, avgTemperature: null, avgHumidity: null },
      snowy: { category: "snowy", label: "눈", icon: "ac-unit", rideCount: 0, totalDistance: 0, totalDuration: 0, avgSpeed: 0, avgTemperature: null, avgHumidity: null },
    };

    let allTempSum = 0, allTempCount = 0;
    let allHumiditySum = 0, allHumidityCount = 0;
    const categoryTempSums: Record<WeatherCategory, { sum: number; count: number }> = {
      all: { sum: 0, count: 0 },
      sunny: { sum: 0, count: 0 },
      cloudy: { sum: 0, count: 0 },
      rainy: { sum: 0, count: 0 },
      snowy: { sum: 0, count: 0 },
    };
    const categoryHumiditySums: Record<WeatherCategory, { sum: number; count: number }> = {
      all: { sum: 0, count: 0 },
      sunny: { sum: 0, count: 0 },
      cloudy: { sum: 0, count: 0 },
      rainy: { sum: 0, count: 0 },
      snowy: { sum: 0, count: 0 },
    };

    for (const record of records) {
      const category = categorizeWeather(record.weatherCondition);
      
      // 전체 통계
      stats.all.rideCount++;
      stats.all.totalDistance += record.distance;
      stats.all.totalDuration += record.duration;
      
      // 카테고리별 통계
      stats[category].rideCount++;
      stats[category].totalDistance += record.distance;
      stats[category].totalDuration += record.duration;
      
      // 온도 평균
      if (record.temperature !== undefined) {
        allTempSum += record.temperature;
        allTempCount++;
        categoryTempSums[category].sum += record.temperature;
        categoryTempSums[category].count++;
      }
      
      // 습도 평균
      if (record.humidity !== undefined) {
        allHumiditySum += record.humidity;
        allHumidityCount++;
        categoryHumiditySums[category].sum += record.humidity;
        categoryHumiditySums[category].count++;
      }
    }

    // 평균 속도 및 온도/습도 계산
    for (const key of Object.keys(stats) as WeatherCategory[]) {
      const s = stats[key];
      if (s.totalDuration > 0) {
        s.avgSpeed = (s.totalDistance / 1000) / (s.totalDuration / 3600);
      }
      if (categoryTempSums[key].count > 0) {
        s.avgTemperature = categoryTempSums[key].sum / categoryTempSums[key].count;
      }
      if (categoryHumiditySums[key].count > 0) {
        s.avgHumidity = categoryHumiditySums[key].sum / categoryHumiditySums[key].count;
      }
    }

    return stats;
  }, [records]);

  const selectedStats = weatherStats[selectedCategory];

  // 비교 데이터 (맑은 날 대비)
  const comparisonData = useMemo(() => {
    const sunnyStats = weatherStats.sunny;
    if (sunnyStats.rideCount === 0 || selectedCategory === "all" || selectedCategory === "sunny") {
      return null;
    }
    
    const currentStats = weatherStats[selectedCategory];
    if (currentStats.rideCount === 0) return null;
    
    const speedDiff = currentStats.avgSpeed - sunnyStats.avgSpeed;
    const speedDiffPercent = sunnyStats.avgSpeed > 0 ? (speedDiff / sunnyStats.avgSpeed) * 100 : 0;
    
    return {
      speedDiff,
      speedDiffPercent,
    };
  }, [weatherStats, selectedCategory]);

  const handleBack = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    router.back();
  };

  const handleCategorySelect = (category: WeatherCategory) => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setSelectedCategory(category);
  };

  return (
    <ScreenContainer>
      <ScrollView className="flex-1">
        {/* Header */}
        <View className="flex-row items-center px-4 py-3">
          <Pressable
            onPress={handleBack}
            style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
            className="p-2 -ml-2"
          >
            <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
          </Pressable>
          <Text className="text-xl font-bold text-foreground ml-2">날씨별 주행 통계</Text>
        </View>

        {/* Category Tabs */}
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          className="px-4 mb-4"
        >
          <View className="flex-row gap-2">
            {WEATHER_CATEGORIES.map((cat) => (
              <Pressable
                key={cat.category}
                onPress={() => handleCategorySelect(cat.category)}
                style={({ pressed }) => [
                  {
                    backgroundColor: selectedCategory === cat.category ? colors.primary : colors.surface,
                    opacity: pressed ? 0.8 : 1,
                  },
                ]}
                className="flex-row items-center px-4 py-2 rounded-full"
              >
                <MaterialIcons 
                  name={cat.icon as any} 
                  size={18} 
                  color={selectedCategory === cat.category ? "#FFFFFF" : cat.color} 
                />
                <Text 
                  className="ml-1.5 font-medium"
                  style={{ color: selectedCategory === cat.category ? "#FFFFFF" : colors.foreground }}
                >
                  {cat.label}
                </Text>
                <View 
                  className="ml-2 px-1.5 py-0.5 rounded-full"
                  style={{ backgroundColor: selectedCategory === cat.category ? "rgba(255,255,255,0.2)" : colors.border }}
                >
                  <Text 
                    className="text-xs"
                    style={{ color: selectedCategory === cat.category ? "#FFFFFF" : colors.muted }}
                  >
                    {weatherStats[cat.category].rideCount}
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        </ScrollView>

        {/* Main Stats Card */}
        <View className="mx-4 bg-surface rounded-2xl p-5 mb-4">
          <View className="flex-row items-center mb-4">
            <MaterialIcons 
              name={WEATHER_CATEGORIES.find(c => c.category === selectedCategory)?.icon as any || "analytics"} 
              size={32} 
              color={WEATHER_CATEGORIES.find(c => c.category === selectedCategory)?.color || colors.primary} 
            />
            <View className="ml-3">
              <Text className="text-2xl font-bold text-foreground">
                {selectedStats.rideCount}회 주행
              </Text>
              <Text className="text-muted">
                총 {(selectedStats.totalDistance / 1000).toFixed(1)}km
              </Text>
            </View>
          </View>

          {/* Stats Grid */}
          <View className="flex-row flex-wrap">
            <View className="w-1/2 mb-4">
              <Text className="text-sm text-muted">평균 속도</Text>
              <Text className="text-xl font-bold text-foreground">
                {selectedStats.avgSpeed.toFixed(1)} km/h
              </Text>
            </View>
            <View className="w-1/2 mb-4">
              <Text className="text-sm text-muted">총 주행 시간</Text>
              <Text className="text-xl font-bold text-foreground">
                {Math.floor(selectedStats.totalDuration / 3600)}시간 {Math.floor((selectedStats.totalDuration % 3600) / 60)}분
              </Text>
            </View>
            {selectedStats.avgTemperature !== null && (
              <View className="w-1/2 mb-4">
                <Text className="text-sm text-muted">평균 기온</Text>
                <Text className="text-xl font-bold text-foreground">
                  {selectedStats.avgTemperature.toFixed(1)}°C
                </Text>
              </View>
            )}
            {selectedStats.avgHumidity !== null && (
              <View className="w-1/2 mb-4">
                <Text className="text-sm text-muted">평균 습도</Text>
                <Text className="text-xl font-bold text-foreground">
                  {selectedStats.avgHumidity.toFixed(0)}%
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Comparison Card (비/눈/흐림 선택 시) */}
        {comparisonData && (
          <View className="mx-4 bg-surface rounded-2xl p-4 mb-4">
            <View className="flex-row items-center mb-3">
              <MaterialIcons name="compare-arrows" size={20} color={colors.primary} />
              <Text className="text-foreground font-semibold ml-2">맑은 날 대비</Text>
            </View>
            
            <View className="flex-row items-center">
              <View className="flex-1">
                <Text className="text-sm text-muted">평균 속도 차이</Text>
                <View className="flex-row items-center mt-1">
                  <MaterialIcons 
                    name={comparisonData.speedDiff >= 0 ? "arrow-upward" : "arrow-downward"} 
                    size={20} 
                    color={comparisonData.speedDiff >= 0 ? colors.success : colors.error} 
                  />
                  <Text 
                    className="text-xl font-bold ml-1"
                    style={{ color: comparisonData.speedDiff >= 0 ? colors.success : colors.error }}
                  >
                    {Math.abs(comparisonData.speedDiff).toFixed(1)} km/h
                  </Text>
                  <Text className="text-muted ml-2">
                    ({comparisonData.speedDiffPercent >= 0 ? "+" : ""}{comparisonData.speedDiffPercent.toFixed(1)}%)
                  </Text>
                </View>
              </View>
            </View>
            
            {selectedCategory === "rainy" && (
              <View className="mt-3 p-3 bg-warning/10 rounded-lg">
                <View className="flex-row items-start">
                  <MaterialIcons name="warning" size={18} color={colors.warning} />
                  <Text className="text-sm text-foreground ml-2 flex-1">
                    비 오는 날은 제동 거리가 길어지므로 평소보다 속도를 줄이는 것이 안전합니다.
                  </Text>
                </View>
              </View>
            )}
            
            {selectedCategory === "snowy" && (
              <View className="mt-3 p-3 bg-error/10 rounded-lg">
                <View className="flex-row items-start">
                  <MaterialIcons name="ac-unit" size={18} color={colors.error} />
                  <Text className="text-sm text-foreground ml-2 flex-1">
                    눈 오는 날은 미끄러움 주의! 급가속/급제동을 피하고 천천히 주행하세요.
                  </Text>
                </View>
              </View>
            )}
          </View>
        )}

        {/* Weather Stats Comparison Chart */}
        <View className="mx-4 bg-surface rounded-2xl p-4 mb-6">
          <Text className="text-foreground font-semibold mb-4">날씨별 평균 속도 비교</Text>
          
          {WEATHER_CATEGORIES.filter(c => c.category !== "all").map((cat) => {
            const stats = weatherStats[cat.category];
            const maxSpeed = Math.max(...WEATHER_CATEGORIES.filter(c => c.category !== "all").map(c => weatherStats[c.category].avgSpeed), 1);
            const barWidth = stats.avgSpeed > 0 ? (stats.avgSpeed / maxSpeed) * 100 : 0;
            
            return (
              <View key={cat.category} className="mb-3">
                <View className="flex-row items-center justify-between mb-1">
                  <View className="flex-row items-center">
                    <MaterialIcons name={cat.icon as any} size={16} color={cat.color} />
                    <Text className="text-sm text-foreground ml-2">{cat.label}</Text>
                    <Text className="text-xs text-muted ml-2">({stats.rideCount}회)</Text>
                  </View>
                  <Text className="text-sm font-medium text-foreground">
                    {stats.avgSpeed.toFixed(1)} km/h
                  </Text>
                </View>
                <View className="h-2 bg-border rounded-full overflow-hidden">
                  <View 
                    className="h-full rounded-full"
                    style={{ width: `${barWidth}%`, backgroundColor: cat.color }}
                  />
                </View>
              </View>
            );
          })}
        </View>

        {/* Empty State */}
        {selectedStats.rideCount === 0 && (
          <View className="mx-4 items-center py-8">
            <MaterialIcons name="cloud-off" size={48} color={colors.muted} />
            <Text className="text-muted mt-2 text-center">
              {selectedCategory === "all" 
                ? "아직 주행 기록이 없습니다" 
                : `${WEATHER_CATEGORIES.find(c => c.category === selectedCategory)?.label} 날씨에 주행한 기록이 없습니다`}
            </Text>
          </View>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}
