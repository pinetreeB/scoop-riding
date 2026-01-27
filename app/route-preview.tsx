import { useState, useEffect, useMemo } from "react";
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  Platform,
  Alert,
  ScrollView,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { RideMap } from "@/components/ride-map";
import { GoogleRideMap } from "@/components/google-ride-map";
import { GpsPoint } from "@/lib/gps-utils";

const GOOGLE_MAPS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || "";

interface RouteStep {
  instruction: string;
  distance: string;
  duration: string;
  maneuver?: string;
}

interface RouteInfo {
  distance: string;
  duration: string;
  distanceValue: number;
  durationValue: number;
  steps: RouteStep[];
  polylinePoints: GpsPoint[];
}

export default function RoutePreviewScreen() {
  const router = useRouter();
  const colors = useColors();
  const params = useLocalSearchParams<{
    destinationName: string;
    destinationAddress: string;
    destinationLat: string;
    destinationLng: string;
  }>();

  const [isLoading, setIsLoading] = useState(true);
  const [currentLocation, setCurrentLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [routeInfo, setRouteInfo] = useState<RouteInfo | null>(null);
  const [selectedMode, setSelectedMode] = useState<"BICYCLING" | "WALKING" | "DRIVING" | "TWO_WHEELER">("BICYCLING");

  const destination = useMemo(() => ({
    name: params.destinationName || "목적지",
    address: params.destinationAddress || "",
    lat: parseFloat(params.destinationLat || "0"),
    lng: parseFloat(params.destinationLng || "0"),
  }), [params]);

  // Get current location
  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === "granted") {
        const location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });
        setCurrentLocation({
          lat: location.coords.latitude,
          lng: location.coords.longitude,
        });
      } else {
        Alert.alert("위치 권한 필요", "경로 안내를 위해 위치 권한이 필요합니다.");
        router.back();
      }
    })();
  }, []);

  // Fetch route when location is available
  useEffect(() => {
    if (currentLocation) {
      fetchRoute();
    }
  }, [currentLocation, selectedMode]);

  const decodePolyline = (encoded: string): GpsPoint[] => {
    const points: GpsPoint[] = [];
    let index = 0;
    let lat = 0;
    let lng = 0;

    while (index < encoded.length) {
      let b;
      let shift = 0;
      let result = 0;

      do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);

      const dlat = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
      lat += dlat;

      shift = 0;
      result = 0;

      do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);

      const dlng = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
      lng += dlng;

      points.push({
        latitude: lat / 1e5,
        longitude: lng / 1e5,
        altitude: null,
        timestamp: Date.now(),
        speed: null,
        accuracy: null,
      });
    }

    return points;
  };

  const stripHtmlTags = (html: string): string => {
    return html
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  };

  const fetchRoute = async () => {
    if (!currentLocation) return;

    setIsLoading(true);
    try {
      // TWO_WHEELER uses DRIVING mode with avoid=highways for scooter-friendly routes
      const apiMode = selectedMode === "TWO_WHEELER" ? "driving" : selectedMode.toLowerCase();
      const avoidParam = selectedMode === "TWO_WHEELER" ? "&avoid=highways" : "";
      const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${currentLocation.lat},${currentLocation.lng}&destination=${destination.lat},${destination.lng}&mode=${apiMode}${avoidParam}&language=ko&key=${GOOGLE_MAPS_API_KEY}`;

      const response = await fetch(url);
      const data = await response.json();

      if (data.status === "OK" && data.routes.length > 0) {
        const route = data.routes[0];
        const leg = route.legs[0];

        const steps: RouteStep[] = leg.steps.map((step: any) => ({
          instruction: stripHtmlTags(step.html_instructions),
          distance: step.distance.text,
          duration: step.duration.text,
          maneuver: step.maneuver,
        }));

        const polylinePoints = decodePolyline(route.overview_polyline.points);

        setRouteInfo({
          distance: leg.distance.text,
          duration: leg.duration.text,
          distanceValue: leg.distance.value,
          durationValue: leg.duration.value,
          steps,
          polylinePoints,
        });
      } else {
        Alert.alert("경로 없음", "해당 목적지까지의 경로를 찾을 수 없습니다.");
      }
    } catch (error) {
      console.error("Route fetch error:", error);
      Alert.alert("오류", "경로를 가져오는 중 오류가 발생했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleStartNavigation = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    if (!routeInfo || !currentLocation) {
      Alert.alert("오류", "경로 정보를 불러오는 중입니다.");
      return;
    }

    // Navigate to riding screen with route data
    router.push({
      pathname: "/select-scooter",
      params: {
        withNavigation: "true",
        destinationName: destination.name,
        destinationLat: destination.lat.toString(),
        destinationLng: destination.lng.toString(),
        routePolyline: JSON.stringify(routeInfo.polylinePoints),
        routeSteps: JSON.stringify(routeInfo.steps),
      },
    } as any);
  };

  const getManeuverIcon = (maneuver?: string): string => {
    switch (maneuver) {
      case "turn-left":
        return "turn-left";
      case "turn-right":
        return "turn-right";
      case "turn-slight-left":
        return "turn-slight-left";
      case "turn-slight-right":
        return "turn-slight-right";
      case "turn-sharp-left":
        return "turn-sharp-left";
      case "turn-sharp-right":
        return "turn-sharp-right";
      case "uturn-left":
      case "uturn-right":
        return "u-turn-left";
      case "roundabout-left":
      case "roundabout-right":
        return "roundabout-left";
      case "straight":
        return "straight";
      default:
        return "arrow-forward";
    }
  };

  // Convert route points to GpsPoint format for map
  const mapGpsPoints = useMemo(() => {
    if (!routeInfo) return [];
    return routeInfo.polylinePoints;
  }, [routeInfo]);

  const currentLocationForMap = useMemo(() => {
    if (!currentLocation) return null;
    return {
      latitude: currentLocation.lat,
      longitude: currentLocation.lng,
    };
  }, [currentLocation]);

  return (
    <ScreenContainer edges={["top", "left", "right"]}>
      {/* Header */}
      <View className="flex-row items-center px-4 py-3 border-b border-border">
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
          className="p-2 -ml-2"
        >
          <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
        </Pressable>
        <View className="flex-1 ml-2">
          <Text className="text-foreground font-bold text-lg" numberOfLines={1}>
            {destination.name}
          </Text>
          <Text className="text-muted text-sm" numberOfLines={1}>
            {destination.address}
          </Text>
        </View>
      </View>

      {/* Map */}
      <View style={{ height: 280 }}>
        {isLoading ? (
          <View className="flex-1 items-center justify-center bg-surface">
            <ActivityIndicator size="large" color={colors.primary} />
            <Text className="text-muted mt-2">경로 계산 중...</Text>
          </View>
        ) : (
          Platform.OS !== "web" ? (
            <GoogleRideMap
              gpsPoints={mapGpsPoints}
              currentLocation={currentLocationForMap}
              isLive={false}
              showCurrentLocation={true}
              gpxRoute={{
                points: mapGpsPoints.map(p => ({
                  latitude: p.latitude,
                  longitude: p.longitude,
                })),
                name: destination.name,
              }}
            />
          ) : (
            <RideMap
              gpsPoints={mapGpsPoints}
              currentLocation={currentLocationForMap}
              isLive={false}
              showCurrentLocation={true}
              gpxRoute={{
                points: mapGpsPoints.map(p => ({
                  latitude: p.latitude,
                  longitude: p.longitude,
                })),
                name: destination.name,
              }}
            />
          )
        )}
      </View>

      {/* Route Info */}
      {routeInfo && (
        <>
          {/* Mode Selection & Summary */}
          <View className="px-4 py-3 border-b border-border">
            <View className="flex-row items-center justify-between mb-3">
              {/* Mode Buttons */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View className="flex-row">
                  <Pressable
                    onPress={() => setSelectedMode("TWO_WHEELER")}
                    style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
                    className={`px-4 py-2 rounded-full mr-2 ${
                      selectedMode === "TWO_WHEELER" ? "bg-primary" : "bg-surface"
                    }`}
                  >
                    <View className="flex-row items-center">
                      <MaterialIcons
                        name="two-wheeler"
                        size={18}
                        color={selectedMode === "TWO_WHEELER" ? "#FFFFFF" : colors.muted}
                      />
                      <Text
                        className={`ml-1 font-medium ${
                          selectedMode === "TWO_WHEELER" ? "text-white" : "text-muted"
                        }`}
                      >
                        이륜차
                      </Text>
                    </View>
                  </Pressable>
                  <Pressable
                    onPress={() => setSelectedMode("BICYCLING")}
                    style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
                    className={`px-4 py-2 rounded-full mr-2 ${
                      selectedMode === "BICYCLING" ? "bg-primary" : "bg-surface"
                    }`}
                  >
                    <View className="flex-row items-center">
                      <MaterialIcons
                        name="directions-bike"
                        size={18}
                        color={selectedMode === "BICYCLING" ? "#FFFFFF" : colors.muted}
                      />
                      <Text
                        className={`ml-1 font-medium ${
                          selectedMode === "BICYCLING" ? "text-white" : "text-muted"
                        }`}
                      >
                        자전거
                      </Text>
                    </View>
                  </Pressable>
                  <Pressable
                    onPress={() => setSelectedMode("WALKING")}
                    style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
                    className={`px-4 py-2 rounded-full mr-2 ${
                      selectedMode === "WALKING" ? "bg-primary" : "bg-surface"
                    }`}
                  >
                    <View className="flex-row items-center">
                      <MaterialIcons
                        name="directions-walk"
                        size={18}
                        color={selectedMode === "WALKING" ? "#FFFFFF" : colors.muted}
                      />
                      <Text
                        className={`ml-1 font-medium ${
                          selectedMode === "WALKING" ? "text-white" : "text-muted"
                        }`}
                      >
                        도보
                      </Text>
                    </View>
                  </Pressable>
                  <Pressable
                    onPress={() => setSelectedMode("DRIVING")}
                    style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
                    className={`px-4 py-2 rounded-full ${
                      selectedMode === "DRIVING" ? "bg-primary" : "bg-surface"
                    }`}
                  >
                    <View className="flex-row items-center">
                      <MaterialIcons
                        name="directions-car"
                        size={18}
                        color={selectedMode === "DRIVING" ? "#FFFFFF" : colors.muted}
                      />
                      <Text
                        className={`ml-1 font-medium ${
                          selectedMode === "DRIVING" ? "text-white" : "text-muted"
                        }`}
                      >
                        자동차
                      </Text>
                    </View>
                  </Pressable>
                </View>
              </ScrollView>
            </View>

            {/* Distance & Duration */}
            <View className="flex-row items-center justify-around">
              <View className="items-center">
                <Text className="text-2xl font-bold text-foreground">{routeInfo.distance}</Text>
                <Text className="text-muted text-sm">거리</Text>
              </View>
              <View className="w-px h-10 bg-border" />
              <View className="items-center">
                <Text className="text-2xl font-bold text-foreground">{routeInfo.duration}</Text>
                <Text className="text-muted text-sm">예상 시간</Text>
              </View>
            </View>
          </View>

          {/* Route Steps */}
          <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
            <View className="px-4 py-3">
              <Text className="text-foreground font-bold mb-3">경로 안내</Text>
              {routeInfo.steps.map((step, index) => (
                <View
                  key={index}
                  className="flex-row items-start py-3 border-b border-border"
                >
                  <View
                    className="w-8 h-8 rounded-full items-center justify-center mr-3"
                    style={{ backgroundColor: colors.primary + "20" }}
                  >
                    <MaterialIcons
                      name={getManeuverIcon(step.maneuver) as any}
                      size={18}
                      color={colors.primary}
                    />
                  </View>
                  <View className="flex-1">
                    <Text className="text-foreground">{step.instruction}</Text>
                    <Text className="text-muted text-sm mt-1">
                      {step.distance} · {step.duration}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </ScrollView>

          {/* Start Button */}
          <View className="px-4 py-4 border-t border-border">
            <Pressable
              onPress={handleStartNavigation}
              style={({ pressed }) => [
                {
                  transform: [{ scale: pressed ? 0.98 : 1 }],
                  opacity: pressed ? 0.9 : 1,
                },
              ]}
              className="bg-primary rounded-full py-4 items-center"
            >
              <View className="flex-row items-center">
                <MaterialIcons name="navigation" size={24} color="#FFFFFF" />
                <Text className="text-white font-bold text-lg ml-2">
                  경로 안내 시작
                </Text>
              </View>
            </Pressable>
          </View>
        </>
      )}
    </ScreenContainer>
  );
}
