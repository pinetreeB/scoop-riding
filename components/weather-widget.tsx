import { useState, useEffect, useRef } from "react";
import { Text, View, Pressable, Platform } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";

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

interface WeatherCacheData {
  weather: WeatherData;
  locationName: string | null;
  updatedAt: string;
}

const WEATHER_CACHE_KEY = "@scoop_weather_widget_cache";
const WEATHER_API_TIMEOUT_MS = 5000;

// 주행 추천 여부 결정
function getRidingRecommendation(weather: WeatherData): {
  recommended: boolean;
  reason: string;
  color: string;
} {
  if (!weather.weatherCondition) {
    return { recommended: true, reason: "날씨 정보를 확인할 수 없습니다", color: "#9CA3AF" };
  }

  if (weather.precipitationType && weather.precipitationType > 0) {
    return { recommended: false, reason: "비/눈이 오고 있어 주행에 주의가 필요합니다", color: "#EF4444" };
  }

  if (weather.windSpeed && weather.windSpeed >= 10) {
    return { recommended: false, reason: "강풍으로 인해 주행이 위험할 수 있습니다", color: "#F59E0B" };
  }

  if (weather.temperature !== null) {
    if (weather.temperature <= -10) {
      return { recommended: false, reason: "한파로 인해 배터리 성능이 저하될 수 있습니다", color: "#3B82F6" };
    }
    if (weather.temperature >= 35) {
      return { recommended: false, reason: "폭염으로 인해 배터리 과열에 주의하세요", color: "#EF4444" };
    }
  }

  if (weather.weatherCondition.includes("흐림") || weather.weatherCondition.includes("구름 많음")) {
    return { recommended: true, reason: "흐린 날씨지만 주행하기 좋습니다", color: "#22C55E" };
  }

  return { recommended: true, reason: "주행하기 좋은 날씨입니다!", color: "#22C55E" };
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timeout (${timeoutMs}ms)`));
    }, timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

export function WeatherWidget() {
  const colors = useColors();
  const trpcUtils = trpc.useUtils();

  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [locationName, setLocationName] = useState<string | null>(null);
  const hasCachedDataRef = useRef(false);

  const loadCachedWeather = async (): Promise<boolean> => {
    console.log("[WeatherWidget] 캐시 읽기 시작");
    try {
      const cached = await AsyncStorage.getItem(WEATHER_CACHE_KEY);
      if (!cached) {
        console.log("[WeatherWidget] 캐시 없음");
        return false;
      }

      const parsed: WeatherCacheData = JSON.parse(cached);
      const updatedAt = new Date(parsed.updatedAt);
      if (Number.isNaN(updatedAt.getTime())) {
        console.log("[WeatherWidget] 캐시 시간 파싱 실패");
        return false;
      }

      hasCachedDataRef.current = true;
      setWeather(parsed.weather);
      setLocationName(parsed.locationName);
      setLastUpdated(updatedAt);
      setError(null);
      setIsLoading(false);
      console.log("[WeatherWidget] 캐시 표시 완료", { updatedAt: parsed.updatedAt });
      return true;
    } catch (cacheError) {
      console.error("[WeatherWidget] 캐시 읽기 실패", cacheError);
      return false;
    }
  };

  const saveWeatherCache = async (cacheData: WeatherCacheData) => {
    console.log("[WeatherWidget] 캐시 저장 시작");
    try {
      await AsyncStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify(cacheData));
      console.log("[WeatherWidget] 캐시 저장 완료");
    } catch (cacheError) {
      console.error("[WeatherWidget] 캐시 저장 실패", cacheError);
    }
  };

  const fetchWeather = async (options?: { background?: boolean }) => {
    const isBackgroundRefresh = options?.background === true;
    console.log("[WeatherWidget] 날씨 갱신 시작", { isBackgroundRefresh });

    if (!isBackgroundRefresh) {
      setIsLoading(true);
    }
    setError(null);

    try {
      console.log("[WeatherWidget] 위치 권한 확인 시작");
      const currentPermission = await Location.getForegroundPermissionsAsync();
      let permissionStatus = currentPermission.status;

      if (permissionStatus !== "granted") {
        try {
          console.log("[WeatherWidget] 위치 권한 요청 시작");
          const requested = await withTimeout(
            Location.requestForegroundPermissionsAsync(),
            WEATHER_API_TIMEOUT_MS,
            "location_permission"
          );
          permissionStatus = requested.status;
          console.log("[WeatherWidget] 위치 권한 요청 완료", { status: permissionStatus });
        } catch (permissionError) {
          console.error("[WeatherWidget] 위치 권한 요청 타임아웃/실패", permissionError);
        }
      }

      if (permissionStatus !== "granted") {
        if (!hasCachedDataRef.current) {
          setError("위치 권한이 필요합니다");
        }
        setIsLoading(false);
        return;
      }

      let latitude: number | null = null;
      let longitude: number | null = null;

      try {
        console.log("[WeatherWidget] 현재 위치 조회 시작");
        const location = await withTimeout(
          Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
          WEATHER_API_TIMEOUT_MS,
          "current_location"
        );
        latitude = location.coords.latitude;
        longitude = location.coords.longitude;
        console.log("[WeatherWidget] 현재 위치 조회 완료", { latitude, longitude });
      } catch (locationError) {
        console.warn("[WeatherWidget] 현재 위치 조회 실패, 마지막 위치 사용 시도", locationError);
        const lastKnown = await Location.getLastKnownPositionAsync({
          maxAge: 1000 * 60 * 60,
          requiredAccuracy: 500,
        });

        if (lastKnown) {
          latitude = lastKnown.coords.latitude;
          longitude = lastKnown.coords.longitude;
          console.log("[WeatherWidget] 마지막 위치 사용", { latitude, longitude });
        }
      }

      if (latitude === null || longitude === null) {
        if (!hasCachedDataRef.current) {
          setError("위치 정보를 가져올 수 없습니다");
        }
        setIsLoading(false);
        return;
      }

      let resolvedLocationName: string | null = locationName;
      try {
        console.log("[WeatherWidget] 역지오코딩 시작");
        const geocode = await withTimeout(
          Location.reverseGeocodeAsync({ latitude, longitude }),
          WEATHER_API_TIMEOUT_MS,
          "reverse_geocode"
        );
        if (geocode && geocode.length > 0) {
          const place = geocode[0];
          const parts: string[] = [];
          if (place.region) parts.push(place.region);
          if (place.city && place.city !== place.region) parts.push(place.city);
          if (place.district && place.district !== place.city) parts.push(place.district);
          if (place.subregion && parts.length === 0) parts.push(place.subregion);

          resolvedLocationName = parts.length > 0 ? parts.join(" ") : (place.name || null);
          setLocationName(resolvedLocationName);
          console.log("[WeatherWidget] 역지오코딩 완료", { resolvedLocationName });
        }
      } catch (geoErr) {
        console.warn("[WeatherWidget] 역지오코딩 실패", geoErr);
      }

      console.log("[WeatherWidget] 날씨 API 호출 시작");
      const weatherResult = await withTimeout(
        trpcUtils.client.weather.getCurrent.query({ lat: latitude, lon: longitude }),
        WEATHER_API_TIMEOUT_MS,
        "weather_api"
      );
      console.log("[WeatherWidget] 날씨 API 호출 완료", { success: weatherResult?.success });

      if (!weatherResult?.success || !weatherResult.weather) {
        if (!hasCachedDataRef.current) {
          setError(weatherResult?.error || "날씨 정보를 가져올 수 없습니다");
        }
        setIsLoading(false);
        return;
      }

      const w = weatherResult.weather;
      const weatherData: WeatherData = {
        temperature: w.temperature,
        humidity: w.humidity,
        windSpeed: w.windSpeed,
        weatherCondition: w.weatherCondition,
        precipitationType: w.precipitationType,
      };

      const now = new Date();
      hasCachedDataRef.current = true;
      setWeather(weatherData);
      setLastUpdated(now);
      setError(null);
      setIsLoading(false);

      await saveWeatherCache({
        weather: weatherData,
        locationName: resolvedLocationName,
        updatedAt: now.toISOString(),
      });
    } catch (err) {
      console.error("[WeatherWidget] 날씨 갱신 실패", err);
      if (!hasCachedDataRef.current) {
        setError("날씨 정보를 가져올 수 없습니다");
      }
      setIsLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;

    const initializeWeather = async () => {
      const hasCache = await loadCachedWeather();
      if (!isMounted) return;

      // 캐시는 무조건 먼저 보여주고, 백그라운드에서 재검증
      await fetchWeather({ background: hasCache });
    };

    initializeWeather();

    return () => {
      isMounted = false;
    };
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
      <View className="flex-row items-center justify-between mb-3">
        <View className="flex-row items-center flex-1">
          <MaterialIcons name="wb-sunny" size={18} color={colors.primary} />
          <Text className="text-sm font-semibold text-foreground ml-1" numberOfLines={1}>
            {locationName ? `${locationName} 날씨` : "현재 날씨"}
          </Text>
        </View>
        <Pressable
          onPress={handleRefresh}
          style={({ pressed }) => [{ opacity: pressed ? 0.5 : 1 }]}
          className="p-1"
        >
          <MaterialIcons name="refresh" size={18} color={colors.muted} />
        </Pressable>
      </View>

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

      {lastUpdated && (
        <Text className="text-xs text-muted text-right mt-2">
          {lastUpdated.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })} 업데이트
        </Text>
      )}
    </View>
  );
}
