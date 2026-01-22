import { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  Alert,
  Platform,
  Dimensions,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";
import { WebView } from "react-native-webview";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import {
  GpxRoute,
  GpxPoint,
  findNearestPointIndex,
  calculateDistanceToRoute,
  calculateRemainingDistance,
} from "@/lib/gpx-parser";
import AsyncStorage from "@react-native-async-storage/async-storage";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

export default function FollowRouteScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ routeId: string }>();
  const colors = useColors();

  const [route, setRoute] = useState<GpxRoute | null>(null);
  const [currentLocation, setCurrentLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [nearestPointIndex, setNearestPointIndex] = useState(0);
  const [distanceToRoute, setDistanceToRoute] = useState(0);
  const [remainingDistance, setRemainingDistance] = useState(0);
  const [isOffRoute, setIsOffRoute] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const locationSubscriptionRef = useRef<Location.LocationSubscription | null>(null);
  const OFF_ROUTE_THRESHOLD = 50; // 50m 이상 벗어나면 경고

  // 저장된 경로 로드
  useEffect(() => {
    const loadRoute = async () => {
      try {
        const routesJson = await AsyncStorage.getItem("@saved_gpx_routes");
        if (routesJson) {
          const routes: GpxRoute[] = JSON.parse(routesJson);
          const foundRoute = routes.find((r, index) => 
            params.routeId === String(index) || r.name === params.routeId
          );
          if (foundRoute) {
            setRoute(foundRoute);
            setRemainingDistance(foundRoute.totalDistance);
          } else {
            Alert.alert("오류", "경로를 찾을 수 없습니다.");
            router.back();
          }
        }
      } catch (error) {
        console.error("Failed to load route:", error);
        Alert.alert("오류", "경로를 불러오는데 실패했습니다.");
        router.back();
      } finally {
        setIsLoading(false);
      }
    };
    loadRoute();
  }, [params.routeId]);

  // GPS 추적 시작
  useEffect(() => {
    const startTracking = async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") {
          Alert.alert("권한 필요", "위치 권한이 필요합니다.");
          router.back();
          return;
        }

        locationSubscriptionRef.current = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            distanceInterval: 5,
            timeInterval: 1000,
          },
          (location) => {
            const { latitude, longitude } = location.coords;
            setCurrentLocation({ latitude, longitude });

            if (route) {
              // 가장 가까운 경로 포인트 찾기
              const nearestIdx = findNearestPointIndex(latitude, longitude, route.points);
              setNearestPointIndex(nearestIdx);

              // 경로까지의 거리
              const distToRoute = calculateDistanceToRoute(latitude, longitude, route.points);
              setDistanceToRoute(distToRoute);

              // 경로 이탈 여부
              const wasOffRoute = isOffRoute;
              const nowOffRoute = distToRoute > OFF_ROUTE_THRESHOLD;
              setIsOffRoute(nowOffRoute);

              // 경로 이탈 시 햅틱 피드백
              if (nowOffRoute && !wasOffRoute && Platform.OS !== "web") {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
              }

              // 남은 거리
              const remaining = calculateRemainingDistance(latitude, longitude, route.points);
              setRemainingDistance(remaining);

              // 도착 확인
              if (nearestIdx >= route.points.length - 2 && remaining < 30) {
                if (Platform.OS !== "web") {
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                }
                Alert.alert("도착!", "목적지에 도착했습니다.", [
                  { text: "확인", onPress: () => router.back() },
                ]);
              }
            }
          }
        );
      } catch (error) {
        console.error("Location tracking error:", error);
      }
    };

    if (route) {
      startTracking();
    }

    return () => {
      if (locationSubscriptionRef.current) {
        locationSubscriptionRef.current.remove();
      }
    };
  }, [route]);

  // 지도 HTML 생성
  const generateMapHtml = useCallback(() => {
    if (!route) return "";

    const center = route.points[Math.floor(route.points.length / 2)];
    const routeCoords = route.points.map(p => `[${p.latitude}, ${p.longitude}]`).join(",");

    return `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    body { margin: 0; padding: 0; }
    #map { width: 100%; height: 100vh; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    const map = L.map('map').setView([${center.latitude}, ${center.longitude}], 15);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap'
    }).addTo(map);
    
    // 경로 표시
    const routeCoords = [${routeCoords}];
    const routeLine = L.polyline(routeCoords, {
      color: '#FF6B00',
      weight: 5,
      opacity: 0.8
    }).addTo(map);
    
    // 시작점
    L.circleMarker(routeCoords[0], {
      radius: 10,
      fillColor: '#22C55E',
      color: '#fff',
      weight: 2,
      fillOpacity: 1
    }).addTo(map).bindPopup('시작');
    
    // 도착점
    L.circleMarker(routeCoords[routeCoords.length - 1], {
      radius: 10,
      fillColor: '#EF4444',
      color: '#fff',
      weight: 2,
      fillOpacity: 1
    }).addTo(map).bindPopup('도착');
    
    // 현재 위치 마커
    let currentMarker = null;
    
    function updateCurrentLocation(lat, lng) {
      if (currentMarker) {
        currentMarker.setLatLng([lat, lng]);
      } else {
        currentMarker = L.circleMarker([lat, lng], {
          radius: 12,
          fillColor: '#3B82F6',
          color: '#fff',
          weight: 3,
          fillOpacity: 1
        }).addTo(map);
      }
      map.panTo([lat, lng]);
    }
    
    // 경로에 맞게 지도 범위 조정
    map.fitBounds(routeLine.getBounds(), { padding: [50, 50] });
    
    // React Native에서 위치 업데이트 수신
    window.updateLocation = updateCurrentLocation;
  </script>
</body>
</html>
    `;
  }, [route]);

  const webViewRef = useRef<WebView>(null);

  // 현재 위치 업데이트를 WebView에 전달
  useEffect(() => {
    if (currentLocation && webViewRef.current) {
      webViewRef.current.injectJavaScript(`
        if (window.updateLocation) {
          window.updateLocation(${currentLocation.latitude}, ${currentLocation.longitude});
        }
        true;
      `);
    }
  }, [currentLocation]);

  const formatDistance = (meters: number): string => {
    if (meters >= 1000) {
      return `${(meters / 1000).toFixed(1)} km`;
    }
    return `${Math.round(meters)} m`;
  };

  if (isLoading) {
    return (
      <ScreenContainer className="flex-1 items-center justify-center">
        <Text className="text-muted">경로 로딩 중...</Text>
      </ScreenContainer>
    );
  }

  if (!route) {
    return (
      <ScreenContainer className="flex-1 items-center justify-center">
        <Text className="text-muted">경로를 찾을 수 없습니다.</Text>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer edges={["top", "left", "right"]} className="flex-1">
      {/* Header */}
      <View className="flex-row items-center px-4 py-3 border-b border-border">
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
        >
          <MaterialIcons name="close" size={24} color={colors.foreground} />
        </Pressable>
        <View className="flex-1 ml-4">
          <Text className="text-lg font-bold text-foreground" numberOfLines={1}>
            {route.name}
          </Text>
          <Text className="text-xs text-muted">
            총 {formatDistance(route.totalDistance)}
          </Text>
        </View>
      </View>

      {/* Map */}
      <View className="flex-1">
        <WebView
          ref={webViewRef}
          source={{ html: generateMapHtml() }}
          style={{ flex: 1 }}
          scrollEnabled={false}
          javaScriptEnabled={true}
        />
      </View>

      {/* Status Bar */}
      <View className="bg-surface border-t border-border px-4 py-4">
        {/* Off Route Warning */}
        {isOffRoute && (
          <View className="bg-red-500/20 rounded-lg px-4 py-2 mb-3 flex-row items-center">
            <MaterialIcons name="warning" size={20} color="#EF4444" />
            <Text className="text-red-500 font-medium ml-2">
              경로에서 {Math.round(distanceToRoute)}m 벗어났습니다
            </Text>
          </View>
        )}

        {/* Stats */}
        <View className="flex-row justify-around">
          <View className="items-center">
            <Text className="text-2xl font-bold text-foreground">
              {formatDistance(remainingDistance)}
            </Text>
            <Text className="text-xs text-muted">남은 거리</Text>
          </View>
          <View className="w-px bg-border" />
          <View className="items-center">
            <Text className="text-2xl font-bold text-foreground">
              {nearestPointIndex + 1} / {route.points.length}
            </Text>
            <Text className="text-xs text-muted">진행률</Text>
          </View>
          <View className="w-px bg-border" />
          <View className="items-center">
            <Text className={`text-2xl font-bold ${isOffRoute ? "text-red-500" : "text-green-500"}`}>
              {Math.round(distanceToRoute)}m
            </Text>
            <Text className="text-xs text-muted">경로 거리</Text>
          </View>
        </View>
      </View>
    </ScreenContainer>
  );
}
