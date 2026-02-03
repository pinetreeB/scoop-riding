import { useState, useEffect, useMemo } from "react";
import { Text, View, Pressable, ScrollView, Dimensions, Alert } from "react-native";
import { useRouter } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Haptics from "expo-haptics";
import { Platform } from "react-native";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system/legacy";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { getRidingRecords, RidingRecord, formatDuration } from "@/lib/riding-store";
import { WeatherIcon } from "@/components/weather-icon";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

// 날씨 카테고리 분류
function categorizeWeather(condition: string | undefined): "sunny" | "cloudy" | "rainy" | "snowy" | "unknown" {
  if (!condition) return "unknown";
  if (condition.includes("맑음") || condition.includes("구름 조금")) return "sunny";
  if (condition.includes("흐림") || condition.includes("구름 많음")) return "cloudy";
  if (condition.includes("비") || condition.includes("소나기")) return "rainy";
  if (condition.includes("눈")) return "snowy";
  return "unknown";
}

// 월 이름
const MONTH_NAMES = ["1월", "2월", "3월", "4월", "5월", "6월", "7월", "8월", "9월", "10월", "11월", "12월"];

interface MonthlyStats {
  month: string;
  year: number;
  totalRides: number;
  totalDistance: number;
  totalDuration: number;
  weatherBreakdown: {
    sunny: { rides: number; distance: number; duration: number; avgSpeed: number; energyWh: number };
    cloudy: { rides: number; distance: number; duration: number; avgSpeed: number; energyWh: number };
    rainy: { rides: number; distance: number; duration: number; avgSpeed: number; energyWh: number };
    snowy: { rides: number; distance: number; duration: number; avgSpeed: number; energyWh: number };
    unknown: { rides: number; distance: number; duration: number; avgSpeed: number; energyWh: number };
  };
  temperatureRange: { min: number | null; max: number | null; avg: number | null };
}

export default function MonthlyWeatherReportScreen() {
  const router = useRouter();
  const colors = useColors();
  const [records, setRecords] = useState<RidingRecord[]>([]);
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    loadRecords();
  }, []);

  const loadRecords = async () => {
    setIsLoading(true);
    const allRecords = await getRidingRecords();
    setRecords(allRecords);
    setIsLoading(false);
  };

  // 선택된 월의 통계 계산
  const monthlyStats = useMemo<MonthlyStats | null>(() => {
    const monthRecords = records.filter((r) => {
      const date = new Date(r.startTime || r.date);
      return date.getMonth() === selectedMonth && date.getFullYear() === selectedYear;
    });

    if (monthRecords.length === 0) return null;

    const breakdown = {
      sunny: { rides: 0, distance: 0, duration: 0, totalSpeed: 0, energyWh: 0 },
      cloudy: { rides: 0, distance: 0, duration: 0, totalSpeed: 0, energyWh: 0 },
      rainy: { rides: 0, distance: 0, duration: 0, totalSpeed: 0, energyWh: 0 },
      snowy: { rides: 0, distance: 0, duration: 0, totalSpeed: 0, energyWh: 0 },
      unknown: { rides: 0, distance: 0, duration: 0, totalSpeed: 0, energyWh: 0 },
    };

    let temperatures: number[] = [];

    monthRecords.forEach((r) => {
      const category = categorizeWeather(r.weatherCondition);
      breakdown[category].rides += 1;
      breakdown[category].distance += r.distance;
      breakdown[category].duration += r.duration;
      breakdown[category].totalSpeed += r.avgSpeed;
      if (r.energyWh) breakdown[category].energyWh += r.energyWh;
      if (r.temperature !== undefined && r.temperature !== null) {
        temperatures.push(r.temperature);
      }
    });

    const weatherBreakdown = {
      sunny: {
        rides: breakdown.sunny.rides,
        distance: breakdown.sunny.distance,
        duration: breakdown.sunny.duration,
        avgSpeed: breakdown.sunny.rides > 0 ? breakdown.sunny.totalSpeed / breakdown.sunny.rides : 0,
        energyWh: breakdown.sunny.energyWh,
      },
      cloudy: {
        rides: breakdown.cloudy.rides,
        distance: breakdown.cloudy.distance,
        duration: breakdown.cloudy.duration,
        avgSpeed: breakdown.cloudy.rides > 0 ? breakdown.cloudy.totalSpeed / breakdown.cloudy.rides : 0,
        energyWh: breakdown.cloudy.energyWh,
      },
      rainy: {
        rides: breakdown.rainy.rides,
        distance: breakdown.rainy.distance,
        duration: breakdown.rainy.duration,
        avgSpeed: breakdown.rainy.rides > 0 ? breakdown.rainy.totalSpeed / breakdown.rainy.rides : 0,
        energyWh: breakdown.rainy.energyWh,
      },
      snowy: {
        rides: breakdown.snowy.rides,
        distance: breakdown.snowy.distance,
        duration: breakdown.snowy.duration,
        avgSpeed: breakdown.snowy.rides > 0 ? breakdown.snowy.totalSpeed / breakdown.snowy.rides : 0,
        energyWh: breakdown.snowy.energyWh,
      },
      unknown: {
        rides: breakdown.unknown.rides,
        distance: breakdown.unknown.distance,
        duration: breakdown.unknown.duration,
        avgSpeed: breakdown.unknown.rides > 0 ? breakdown.unknown.totalSpeed / breakdown.unknown.rides : 0,
        energyWh: breakdown.unknown.energyWh,
      },
    };

    return {
      month: MONTH_NAMES[selectedMonth],
      year: selectedYear,
      totalRides: monthRecords.length,
      totalDistance: monthRecords.reduce((sum, r) => sum + r.distance, 0),
      totalDuration: monthRecords.reduce((sum, r) => sum + r.duration, 0),
      weatherBreakdown,
      temperatureRange: {
        min: temperatures.length > 0 ? Math.min(...temperatures) : null,
        max: temperatures.length > 0 ? Math.max(...temperatures) : null,
        avg: temperatures.length > 0 ? temperatures.reduce((a, b) => a + b, 0) / temperatures.length : null,
      },
    };
  }, [records, selectedMonth, selectedYear]);

  // 리포트 내보내기 함수
  const exportReport = async () => {
    if (!monthlyStats) return;
    
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    
    setIsExporting(true);
    
    try {
      // 텍스트 리포트 생성
      const { sunny, cloudy, rainy, snowy, unknown } = monthlyStats.weatherBreakdown;
      
      let reportText = `📈 SCOOP 월간 날씨 리포트\n`;
      reportText += `${selectedYear}년 ${MONTH_NAMES[selectedMonth]}\n`;
      reportText += `================================\n\n`;
      
      reportText += `📊 월간 요약\n`;
      reportText += `• 총 주행: ${monthlyStats.totalRides}회\n`;
      reportText += `• 총 거리: ${(monthlyStats.totalDistance / 1000).toFixed(1)}km\n`;
      reportText += `• 총 시간: ${formatDuration(monthlyStats.totalDuration)}\n`;
      
      if (monthlyStats.temperatureRange.avg !== null) {
        reportText += `• 기온 범위: ${monthlyStats.temperatureRange.min?.toFixed(0)}°C ~ ${monthlyStats.temperatureRange.max?.toFixed(0)}°C (평균 ${monthlyStats.temperatureRange.avg?.toFixed(1)}°C)\n`;
      }
      reportText += `\n`;
      
      reportText += `🌤️ 날씨별 주행 분석\n`;
      reportText += `--------------------------------\n`;
      
      if (sunny.rides > 0) {
        const efficiency = sunny.distance > 0 && sunny.energyWh > 0 
          ? (sunny.energyWh / (sunny.distance / 1000)).toFixed(1) : "-";
        reportText += `☀️ 맑음: ${sunny.rides}회, ${(sunny.distance / 1000).toFixed(1)}km, 평균 ${sunny.avgSpeed.toFixed(1)}km/h, 연비 ${efficiency} Wh/km\n`;
      }
      if (cloudy.rides > 0) {
        const efficiency = cloudy.distance > 0 && cloudy.energyWh > 0 
          ? (cloudy.energyWh / (cloudy.distance / 1000)).toFixed(1) : "-";
        reportText += `☁️ 흐림: ${cloudy.rides}회, ${(cloudy.distance / 1000).toFixed(1)}km, 평균 ${cloudy.avgSpeed.toFixed(1)}km/h, 연비 ${efficiency} Wh/km\n`;
      }
      if (rainy.rides > 0) {
        const efficiency = rainy.distance > 0 && rainy.energyWh > 0 
          ? (rainy.energyWh / (rainy.distance / 1000)).toFixed(1) : "-";
        reportText += `🌧️ 비: ${rainy.rides}회, ${(rainy.distance / 1000).toFixed(1)}km, 평균 ${rainy.avgSpeed.toFixed(1)}km/h, 연비 ${efficiency} Wh/km\n`;
      }
      if (snowy.rides > 0) {
        const efficiency = snowy.distance > 0 && snowy.energyWh > 0 
          ? (snowy.energyWh / (snowy.distance / 1000)).toFixed(1) : "-";
        reportText += `❄️ 눈: ${snowy.rides}회, ${(snowy.distance / 1000).toFixed(1)}km, 평균 ${snowy.avgSpeed.toFixed(1)}km/h, 연비 ${efficiency} Wh/km\n`;
      }
      if (unknown.rides > 0) {
        reportText += `❓ 날씨 정보 없음: ${unknown.rides}회\n`;
      }
      
      reportText += `\n================================\n`;
      reportText += `Generated by SCOOP Riders App\n`;
      
      if (Platform.OS === "web") {
        // 웹에서는 클립보드에 복사
        await navigator.clipboard.writeText(reportText);
        Alert.alert("복사 완료", "리포트가 클립보드에 복사되었습니다.");
      } else {
        // 모바일에서는 파일로 저장 후 공유
        const fileName = `scoop_weather_report_${selectedYear}_${selectedMonth + 1}.txt`;
        const filePath = `${FileSystem.cacheDirectory}${fileName}`;
        
        await FileSystem.writeAsStringAsync(filePath, reportText, {
          encoding: FileSystem.EncodingType.UTF8,
        });
        
        const isAvailable = await Sharing.isAvailableAsync();
        if (isAvailable) {
          await Sharing.shareAsync(filePath, {
            mimeType: "text/plain",
            dialogTitle: "월간 날씨 리포트 공유",
          });
        } else {
          Alert.alert("오류", "공유 기능을 사용할 수 없습니다.");
        }
      }
    } catch (error) {
      console.error("Export error:", error);
      Alert.alert("오류", "리포트 내보내기 중 오류가 발생했습니다.");
    } finally {
      setIsExporting(false);
    }
  };

  // 사용 가능한 월 목록
  const availableMonths = useMemo(() => {
    const months = new Set<string>();
    records.forEach((r) => {
      const date = new Date(r.startTime || r.date);
      months.add(`${date.getFullYear()}-${date.getMonth()}`);
    });
    return Array.from(months)
      .map((m) => {
        const [year, month] = m.split("-").map(Number);
        return { year, month };
      })
      .sort((a, b) => b.year - a.year || b.month - a.month);
  }, [records]);

  const goToPreviousMonth = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    if (selectedMonth === 0) {
      setSelectedMonth(11);
      setSelectedYear(selectedYear - 1);
    } else {
      setSelectedMonth(selectedMonth - 1);
    }
  };

  const goToNextMonth = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    const now = new Date();
    if (selectedYear === now.getFullYear() && selectedMonth >= now.getMonth()) {
      return; // Can't go to future
    }
    if (selectedMonth === 11) {
      setSelectedMonth(0);
      setSelectedYear(selectedYear + 1);
    } else {
      setSelectedMonth(selectedMonth + 1);
    }
  };

  const WeatherStatCard = ({
    category,
    data,
    totalRides,
  }: {
    category: "sunny" | "cloudy" | "rainy" | "snowy";
    data: { rides: number; distance: number; duration: number; avgSpeed: number; energyWh: number };
    totalRides: number;
  }) => {
    const categoryNames = {
      sunny: "맑음",
      cloudy: "흐림",
      rainy: "비",
      snowy: "눈",
    };
    const categoryColors = {
      sunny: "#F59E0B",
      cloudy: "#6B7280",
      rainy: "#3B82F6",
      snowy: "#06B6D4",
    };
    const percentage = totalRides > 0 ? Math.round((data.rides / totalRides) * 100) : 0;
    const efficiency = data.distance > 0 && data.energyWh > 0 
      ? (data.energyWh / (data.distance / 1000)).toFixed(1) 
      : "-";

    if (data.rides === 0) return null;

    return (
      <View className="bg-surface rounded-xl p-4 mb-3 border border-border">
        <View className="flex-row items-center justify-between mb-3">
          <View className="flex-row items-center">
            <WeatherIcon condition={categoryNames[category]} size={28} />
            <Text className="text-lg font-bold text-foreground ml-2">{categoryNames[category]}</Text>
          </View>
          <View className="bg-primary/10 px-3 py-1 rounded-full">
            <Text className="text-primary font-semibold">{percentage}%</Text>
          </View>
        </View>
        
        <View className="flex-row flex-wrap">
          <View className="w-1/2 mb-2">
            <Text className="text-xs text-muted">주행 횟수</Text>
            <Text className="text-base font-semibold text-foreground">{data.rides}회</Text>
          </View>
          <View className="w-1/2 mb-2">
            <Text className="text-xs text-muted">총 거리</Text>
            <Text className="text-base font-semibold text-foreground">{(data.distance / 1000).toFixed(1)}km</Text>
          </View>
          <View className="w-1/2">
            <Text className="text-xs text-muted">평균 속도</Text>
            <Text className="text-base font-semibold text-foreground">{data.avgSpeed.toFixed(1)}km/h</Text>
          </View>
          <View className="w-1/2">
            <Text className="text-xs text-muted">연비</Text>
            <Text className="text-base font-semibold text-foreground">{efficiency} Wh/km</Text>
          </View>
        </View>
        
        {/* Progress bar */}
        <View className="h-2 bg-border rounded-full mt-3 overflow-hidden">
          <View 
            className="h-full rounded-full" 
            style={{ 
              width: `${percentage}%`, 
              backgroundColor: categoryColors[category] 
            }} 
          />
        </View>
      </View>
    );
  };

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]}>
      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View className="flex-row justify-between items-center px-4 py-3 border-b border-border">
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
            className="p-2 -ml-2"
          >
            <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
          </Pressable>
          <Text className="text-lg font-semibold text-foreground">월간 날씨 리포트</Text>
          <Pressable
            onPress={exportReport}
            disabled={!monthlyStats || isExporting}
            style={({ pressed }) => [{ opacity: pressed || !monthlyStats || isExporting ? 0.5 : 1 }]}
            className="p-2 -mr-2"
          >
            <MaterialIcons 
              name={isExporting ? "hourglass-empty" : "share"} 
              size={24} 
              color={monthlyStats ? colors.primary : colors.muted} 
            />
          </Pressable>
        </View>

        {/* Month Selector */}
        <View className="flex-row items-center justify-center py-4 bg-surface mx-4 mt-4 rounded-xl">
          <Pressable
            onPress={goToPreviousMonth}
            style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
            className="p-2"
          >
            <MaterialIcons name="chevron-left" size={28} color={colors.foreground} />
          </Pressable>
          <Text className="text-xl font-bold text-foreground mx-6">
            {selectedYear}년 {MONTH_NAMES[selectedMonth]}
          </Text>
          <Pressable
            onPress={goToNextMonth}
            style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
            className="p-2"
          >
            <MaterialIcons name="chevron-right" size={28} color={colors.foreground} />
          </Pressable>
        </View>

        {isLoading ? (
          <View className="flex-1 items-center justify-center py-20">
            <Text className="text-muted">로딩 중...</Text>
          </View>
        ) : !monthlyStats ? (
          <View className="flex-1 items-center justify-center py-20">
            <MaterialIcons name="cloud-off" size={64} color={colors.muted} />
            <Text className="text-muted mt-4 text-center">
              {selectedYear}년 {MONTH_NAMES[selectedMonth]}에는{"\n"}주행 기록이 없습니다.
            </Text>
          </View>
        ) : (
          <View className="px-4 py-4">
            {/* Summary Card */}
            <View className="bg-primary/10 rounded-xl p-4 mb-4">
              <Text className="text-lg font-bold text-foreground mb-3">📊 월간 요약</Text>
              <View className="flex-row flex-wrap">
                <View className="w-1/3">
                  <Text className="text-xs text-muted">총 주행</Text>
                  <Text className="text-lg font-bold text-primary">{monthlyStats.totalRides}회</Text>
                </View>
                <View className="w-1/3">
                  <Text className="text-xs text-muted">총 거리</Text>
                  <Text className="text-lg font-bold text-primary">{(monthlyStats.totalDistance / 1000).toFixed(1)}km</Text>
                </View>
                <View className="w-1/3">
                  <Text className="text-xs text-muted">총 시간</Text>
                  <Text className="text-lg font-bold text-primary">{formatDuration(monthlyStats.totalDuration)}</Text>
                </View>
              </View>
              
              {monthlyStats.temperatureRange.avg !== null && (
                <View className="mt-3 pt-3 border-t border-border/30">
                  <Text className="text-xs text-muted mb-1">주행 시 기온 범위</Text>
                  <View className="flex-row items-center">
                    <MaterialIcons name="thermostat" size={18} color={colors.primary} />
                    <Text className="text-foreground ml-1">
                      {monthlyStats.temperatureRange.min?.toFixed(0)}°C ~ {monthlyStats.temperatureRange.max?.toFixed(0)}°C
                      <Text className="text-muted"> (평균 {monthlyStats.temperatureRange.avg?.toFixed(1)}°C)</Text>
                    </Text>
                  </View>
                </View>
              )}
            </View>

            {/* Weather Breakdown */}
            <Text className="text-lg font-bold text-foreground mb-3">🌤️ 날씨별 주행 분석</Text>
            
            <WeatherStatCard 
              category="sunny" 
              data={monthlyStats.weatherBreakdown.sunny} 
              totalRides={monthlyStats.totalRides} 
            />
            <WeatherStatCard 
              category="cloudy" 
              data={monthlyStats.weatherBreakdown.cloudy} 
              totalRides={monthlyStats.totalRides} 
            />
            <WeatherStatCard 
              category="rainy" 
              data={monthlyStats.weatherBreakdown.rainy} 
              totalRides={monthlyStats.totalRides} 
            />
            <WeatherStatCard 
              category="snowy" 
              data={monthlyStats.weatherBreakdown.snowy} 
              totalRides={monthlyStats.totalRides} 
            />

            {monthlyStats.weatherBreakdown.unknown.rides > 0 && (
              <View className="bg-surface/50 rounded-xl p-4 mb-3 border border-border/50">
                <View className="flex-row items-center">
                  <MaterialIcons name="help-outline" size={20} color={colors.muted} />
                  <Text className="text-muted ml-2">
                    날씨 정보 없음: {monthlyStats.weatherBreakdown.unknown.rides}회 주행
                  </Text>
                </View>
              </View>
            )}

            {/* Insights */}
            <View className="bg-surface rounded-xl p-4 mt-2 mb-6">
              <Text className="text-lg font-bold text-foreground mb-3">💡 인사이트</Text>
              {(() => {
                const { sunny, cloudy, rainy, snowy } = monthlyStats.weatherBreakdown;
                const insights: string[] = [];

                // 가장 많이 주행한 날씨
                const maxRides = Math.max(sunny.rides, cloudy.rides, rainy.rides, snowy.rides);
                if (maxRides === sunny.rides && sunny.rides > 0) {
                  insights.push("맑은 날에 가장 많이 주행했습니다.");
                } else if (maxRides === cloudy.rides && cloudy.rides > 0) {
                  insights.push("흐린 날에 가장 많이 주행했습니다.");
                } else if (maxRides === rainy.rides && rainy.rides > 0) {
                  insights.push("비 오는 날에도 꾸준히 주행했습니다!");
                } else if (maxRides === snowy.rides && snowy.rides > 0) {
                  insights.push("눈 오는 날에도 주행했습니다. 안전에 주의하세요!");
                }

                // 날씨별 속도 비교
                if (sunny.rides > 0 && rainy.rides > 0) {
                  const speedDiff = sunny.avgSpeed - rainy.avgSpeed;
                  if (speedDiff > 5) {
                    insights.push(`비 오는 날은 맑은 날보다 평균 ${speedDiff.toFixed(1)}km/h 느리게 주행했습니다.`);
                  }
                }

                // 연비 비교
                const sunnyEfficiency = sunny.distance > 0 && sunny.energyWh > 0 
                  ? sunny.energyWh / (sunny.distance / 1000) : 0;
                const rainyEfficiency = rainy.distance > 0 && rainy.energyWh > 0 
                  ? rainy.energyWh / (rainy.distance / 1000) : 0;
                
                if (sunnyEfficiency > 0 && rainyEfficiency > 0) {
                  const effDiff = rainyEfficiency - sunnyEfficiency;
                  if (effDiff > 1) {
                    insights.push(`비 오는 날은 맑은 날보다 Wh/km당 ${effDiff.toFixed(1)} 더 소모합니다.`);
                  }
                }

                if (insights.length === 0) {
                  insights.push("더 많은 주행 기록이 쌓이면 상세한 분석을 제공합니다.");
                }

                return insights.map((insight, index) => (
                  <View key={index} className="flex-row items-start mb-2">
                    <Text className="text-primary mr-2">•</Text>
                    <Text className="text-foreground flex-1">{insight}</Text>
                  </View>
                ));
              })()}
            </View>
          </View>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}
