import { Text, View, ScrollView } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useColors } from "@/hooks/use-colors";
import { WeatherCheckpoint } from "@/lib/riding-store";

interface WeatherTimelineProps {
  startWeather?: {
    temperature?: number;
    humidity?: number;
    windSpeed?: number;
    weatherCondition?: string;
  };
  weatherChanges?: WeatherCheckpoint[];
  startTime?: string;
}

/**
 * 날씨 상태에 따른 아이콘 반환
 */
function getWeatherIcon(condition?: string): { name: string; color: string } {
  if (!condition) return { name: "wb-sunny", color: "#FFB800" };
  
  const condLower = condition.toLowerCase();
  
  if (condLower.includes("비") || condLower.includes("rain") || condLower.includes("소나기")) {
    return { name: "grain", color: "#4A90D9" };
  }
  if (condLower.includes("눈") || condLower.includes("snow")) {
    return { name: "ac-unit", color: "#87CEEB" };
  }
  if (condLower.includes("흐림") || condLower.includes("구름") || condLower.includes("cloudy")) {
    return { name: "cloud", color: "#9E9E9E" };
  }
  
  return { name: "wb-sunny", color: "#FFB800" };
}

/**
 * 거리를 읽기 쉬운 형식으로 변환
 */
function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)}m`;
  }
  return `${(meters / 1000).toFixed(1)}km`;
}

/**
 * 시간을 읽기 쉬운 형식으로 변환
 */
function formatTime(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
}

/**
 * 경로별 날씨 변화 타임라인 컴포넌트
 */
export function WeatherTimeline({ startWeather, weatherChanges, startTime }: WeatherTimelineProps) {
  const colors = useColors();
  
  // 날씨 변화가 없으면 표시하지 않음
  if (!weatherChanges || weatherChanges.length === 0) {
    return null;
  }

  // 출발지 날씨 + 경로별 날씨 변화를 타임라인으로 구성
  const timelineItems = [
    // 출발지
    {
      type: "start" as const,
      distance: 0,
      timestamp: startTime || new Date().toISOString(),
      ...startWeather,
    },
    // 경로별 체크포인트
    ...weatherChanges.map((change) => ({
      type: "checkpoint" as const,
      distance: change.distanceFromStart,
      timestamp: change.timestamp,
      temperature: change.temperature,
      humidity: change.humidity,
      windSpeed: change.windSpeed,
      weatherCondition: change.weatherCondition,
    })),
  ];

  // 날씨 변화 감지 (이전 체크포인트와 비교)
  const hasWeatherChange = (index: number): boolean => {
    if (index === 0) return false;
    const current = timelineItems[index];
    const previous = timelineItems[index - 1];
    return current.weatherCondition !== previous.weatherCondition;
  };

  return (
    <View className="bg-surface rounded-2xl p-4">
      <View className="flex-row items-center mb-4">
        <MaterialIcons name="timeline" size={20} color={colors.primary} />
        <Text className="text-foreground font-semibold ml-2">경로별 날씨 변화</Text>
        <View className="ml-auto bg-primary/10 px-2 py-0.5 rounded-full">
          <Text className="text-xs text-primary">{weatherChanges.length}개 체크포인트</Text>
        </View>
      </View>

      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        className="flex-row"
      >
        {timelineItems.map((item, index) => {
          const icon = getWeatherIcon(item.weatherCondition);
          const isChanged = hasWeatherChange(index);
          
          return (
            <View key={index} className="items-center mr-4" style={{ minWidth: 80 }}>
              {/* 타임라인 연결선 */}
              <View className="flex-row items-center w-full">
                {index > 0 && (
                  <View 
                    className="flex-1 h-0.5" 
                    style={{ backgroundColor: isChanged ? colors.warning : colors.border }}
                  />
                )}
                <View 
                  className="w-10 h-10 rounded-full items-center justify-center"
                  style={{ 
                    backgroundColor: isChanged ? colors.warning + "20" : colors.surface,
                    borderWidth: 2,
                    borderColor: isChanged ? colors.warning : icon.color,
                  }}
                >
                  <MaterialIcons name={icon.name as any} size={20} color={icon.color} />
                </View>
                {index < timelineItems.length - 1 && (
                  <View className="flex-1 h-0.5" style={{ backgroundColor: colors.border }} />
                )}
              </View>
              
              {/* 거리/시간 표시 */}
              <Text className="text-xs text-muted mt-2">
                {item.type === "start" ? "출발" : formatDistance(item.distance)}
              </Text>
              <Text className="text-xs text-muted">
                {formatTime(item.timestamp)}
              </Text>
              
              {/* 날씨 정보 */}
              <View className="items-center mt-1">
                {item.temperature !== undefined && (
                  <Text className="text-sm font-medium text-foreground">
                    {item.temperature}°C
                  </Text>
                )}
                <Text className="text-xs text-muted" numberOfLines={1}>
                  {item.weatherCondition || "맑음"}
                </Text>
              </View>
              
              {/* 날씨 변화 표시 */}
              {isChanged && (
                <View className="mt-1 bg-warning/20 px-2 py-0.5 rounded-full">
                  <Text className="text-xs text-warning">변화</Text>
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>

      {/* 날씨 변화 요약 */}
      {weatherChanges.some((c, i) => 
        i > 0 && c.weatherCondition !== weatherChanges[i - 1]?.weatherCondition
      ) && (
        <View className="mt-4 p-3 bg-warning/10 rounded-lg">
          <View className="flex-row items-start">
            <MaterialIcons name="info-outline" size={16} color={colors.warning} />
            <Text className="text-sm text-foreground ml-2 flex-1">
              주행 중 날씨가 변화했습니다. 날씨 변화에 따른 주행 조건 변화에 주의하세요.
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

/**
 * 간단한 날씨 변화 요약 컴포넌트 (상세 화면용)
 */
export function WeatherChangeSummary({ weatherChanges }: { weatherChanges?: WeatherCheckpoint[] }) {
  const colors = useColors();
  
  if (!weatherChanges || weatherChanges.length === 0) {
    return null;
  }

  // 온도 변화 계산
  const temperatures = weatherChanges
    .filter((c) => c.temperature !== undefined)
    .map((c) => c.temperature!);
  
  const minTemp = temperatures.length > 0 ? Math.min(...temperatures) : null;
  const maxTemp = temperatures.length > 0 ? Math.max(...temperatures) : null;
  const tempDiff = minTemp !== null && maxTemp !== null ? maxTemp - minTemp : null;

  // 날씨 상태 변화 횟수
  let weatherChangeCount = 0;
  for (let i = 1; i < weatherChanges.length; i++) {
    if (weatherChanges[i].weatherCondition !== weatherChanges[i - 1].weatherCondition) {
      weatherChangeCount++;
    }
  }

  return (
    <View className="flex-row items-center bg-surface rounded-xl p-3">
      <MaterialIcons name="route" size={20} color={colors.primary} />
      <View className="ml-3 flex-1">
        <Text className="text-sm text-foreground">
          {weatherChanges.length}개 지점에서 날씨 확인
        </Text>
        <View className="flex-row items-center mt-1">
          {tempDiff !== null && tempDiff > 0 && (
            <Text className="text-xs text-muted mr-3">
              온도 변화: {tempDiff.toFixed(1)}°C
            </Text>
          )}
          {weatherChangeCount > 0 && (
            <Text className="text-xs text-warning">
              날씨 변화 {weatherChangeCount}회
            </Text>
          )}
        </View>
      </View>
      <MaterialIcons name="chevron-right" size={20} color={colors.muted} />
    </View>
  );
}
