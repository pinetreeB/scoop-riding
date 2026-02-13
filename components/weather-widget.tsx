import { useState, useEffect } from "react";
import { Text, View, Pressable, ActivityIndicator, Platform } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";

import { useColors } from "@/hooks/use-colors";
import { WeatherIcon } from "./weather-icon";
import { WeatherWidgetSkeleton } from "./skeleton";
import { trpc } from "@/lib/trpc";

interface WeatherData {
  temperature: number | null;
  humidity: number | null;
  windSpeed: number | null;
  weatherCondition: string | null;
  precipitationType: number | null;
}

// 주행 추천 여부 결정
function getRidingRecommendation(weather: WeatherData): {
  recommended: boolean;
  reason: string;
  color: string;
} {
  // 날씨 정보가 없으면 중립
  if (!weather.weatherCondition) {
    return { recommended: true, reason: "날씨 정보를 확인할 수 없습니다", color: "#9CA3AF" };
  }

  // 비/눈 오는 날 (0: 없음, 1: 비, 2: 비/눈, 3: 눈, 5: 빗방울, 6: 빗방울/눈날림, 7: 눈날림)
  if (weather.precipitationType && weather.precipitationType > 0) {
    return { recommended: false, reason: "비/눈이 오고 있어 주행에 주의가 필요합니다", color: "#EF4444" };
  }

  // 강풍 (10m/s 이상)
  if (weather.windSpeed && weather.windSpeed >= 10) {
    return { recommended: false, reason: "강풍으로 인해 주행이 위험할 수 있습니다", color: "#F59E0B" };
  }

  // 극한 온도
  if (weather.temperature !== null) {
    if (weather.temperature <= -10) {
      return { recommended: false, reason: "한파로 인해 배터리 성능이 저하될 수 있습니다", color: "#3B82F6" };
    }
    if (weather.temperature >= 35) {
      return { recommended: false, reason: "폭염으로 인해 배터리 과열에 주의하세요", color: "#EF4444" };
    }
  }

  // 흐린 날
  if (weather.weatherCondition.includes("흐림") || weather.weatherCondition.includes("구름 많음")) {
    return { recommended: true, reason: "흐린 날씨지만 주행하기 좋습니다", color: "#22C55E" };
  }

  // 맑은 날
  return { recommended: true, reason: "주행하기 좋은 날씨입니다!", color: "#22C55E" };
}

export function WeatherWidget() {
  const colors = useColors();
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const weatherQuery = trpc.weather.getCurrent.useQuery(
    { lat: coords?.lat ?? 0, lon: coords?.lon ?? 0 },
    { enabled: !!coords }
  );

  const fetchWeather = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // 위치 권한 확인
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setError("위치 권한이 필요합니다");
        setIsLoading(false);
        return;
      }

      // 현재 위치 가져오기
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      // 좌표 설정 -> useQuery 트리거
      setCoords({
        lat: location.coords.latitude,
        lon: location.coords.longitude,
      });
    } catch (err) {
      console.error("Weather fetch error:", err);
      setError("날씨 정보를 가져올 수 없습니다");
      setIsLoading(false);
    }
  };

  // 날씨 데이터 업데이트
  useEffect(() => {
    if (weatherQuery.data && weatherQuery.data.success && weatherQuery.data.weather) {
      const w = weatherQuery.data.weather;
      setWeather({
        temperature: w.temperature,
        humidity: w.humidity,
        windSpeed: w.windSpeed,
        weatherCondition: w.weatherCondition,
        precipitationType: w.precipitationType,
      });
      setLastUpdated(new Date());
      setIsLoading(false);
    } else if (weatherQuery.data && !weatherQuery.data.success) {
      setError(weatherQuery.data.error || "날씨 정보를 가져올 수 없습니다");
      setIsLoading(false);
    }
  }, [weatherQuery.data]);

  useEffect(() => {
    fetchWeather();
  }, []);

  const handleRefresh = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    fetchWeather();
  };

  const recommendation = weather ? getRidingRecommendation(weather) : null;

  if (isLoading) {
    return <WeatherWidgetSkeleton />;
  }

  if (error) {
    return (
      <Pressable
        onPress={handleRefresh}
        style={({ pressed }) => [{ opacity: pressed ? 0.8 : 1 }]}
        className="bg-surface rounded-2xl p-4 mx-4 mb-4 border border-border"
      >
        <View className="flex-row items-center justify-center py-2">
          <MaterialIcons name="cloud-off" size={24} color={colors.muted} />
          <Text className="text-muted ml-2">{error}</Text>
          <MaterialIcons name="refresh" size={20} color={colors.primary} className="ml-2" />
        </View>
      </Pressable>
    );
  }

  if (!weather) return null;

  return (
    <View className="bg-surface rounded-2xl p-4 mx-4 mb-4 border border-border">
      {/* 헤더 */}
      <View className="flex-row items-center justify-between mb-3">
        <View className="flex-row items-center">
          <MaterialIcons name="wb-sunny" size={18} color={colors.primary} />
          <Text className="text-sm font-semibold text-foreground ml-1">현재 날씨</Text>
        </View>
        <Pressable
          onPress={handleRefresh}
          style={({ pressed }) => [{ opacity: pressed ? 0.5 : 1 }]}
          className="p-1"
        >
          <MaterialIcons name="refresh" size={18} color={colors.muted} />
        </Pressable>
      </View>

      {/* 날씨 정보 */}
      <View className="flex-row items-center mb-3">
        <WeatherIcon condition={weather.weatherCondition || "맑음"} size={48} />
        <View className="ml-3 flex-1">
          <View className="flex-row items-baseline">
            <Text className="text-3xl font-bold text-foreground">
              {weather.temperature !== null ? `${weather.temperature}°` : "--°"}
            </Text>
            <Text className="text-muted ml-2">{weather.weatherCondition || "알 수 없음"}</Text>
          </View>
          <View className="flex-row items-center mt-1">
            {weather.humidity !== null && (
              <View className="flex-row items-center mr-3">
                <MaterialIcons name="water-drop" size={14} color={colors.muted} />
                <Text className="text-xs text-muted ml-1">{weather.humidity}%</Text>
              </View>
            )}
            {weather.windSpeed !== null && (
              <View className="flex-row items-center">
                <MaterialIcons name="air" size={14} color={colors.muted} />
                <Text className="text-xs text-muted ml-1">{weather.windSpeed}m/s</Text>
              </View>
            )}
          </View>
        </View>
      </View>

      {/* 주행 추천 */}
      {recommendation && (
        <View 
          className="rounded-xl p-3 mt-1"
          style={{ backgroundColor: `${recommendation.color}15` }}
        >
          <View className="flex-row items-center">
            <MaterialIcons 
              name={recommendation.recommended ? "check-circle" : "warning"} 
              size={20} 
              color={recommendation.color} 
            />
            <Text 
              className="text-sm font-medium ml-2 flex-1"
              style={{ color: recommendation.color }}
            >
              {recommendation.reason}
            </Text>
          </View>
        </View>
      )}

      {/* 마지막 업데이트 시간 */}
      {lastUpdated && (
        <Text className="text-xs text-muted text-right mt-2">
          {lastUpdated.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })} 업데이트
        </Text>
      )}
    </View>
  );
}
