import { useMemo, useRef, useState } from "react";
import { View, StyleSheet, ActivityIndicator, Text, Platform } from "react-native";

// Only import react-native-maps on native platforms
let MapView: any = null;
let Marker: any = null;
let Polyline: any = null;
let PROVIDER_GOOGLE: any = null;

if (Platform.OS !== "web") {
  const maps = require("react-native-maps");
  MapView = maps.default;
  Marker = maps.Marker;
  Polyline = maps.Polyline;
  PROVIDER_GOOGLE = maps.PROVIDER_GOOGLE;
}
import { useColors } from "@/hooks/use-colors";
import { GpsPoint } from "@/lib/gps-utils";

interface GoogleCompareMapProps {
  firstRoute: GpsPoint[];
  secondRoute: GpsPoint[];
  firstColor?: string;
  secondColor?: string;
}

export function GoogleCompareMap({
  firstRoute,
  secondRoute,
  firstColor = "#3B82F6",
  secondColor = "#22C55E",
}: GoogleCompareMapProps) {
  const colors = useColors();
  const mapRef = useRef<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  // 두 경로의 중심점 및 경계 계산
  const { initialRegion, allCoordinates } = useMemo(() => {
    const allPoints = [...firstRoute, ...secondRoute];

    if (allPoints.length === 0) {
      return {
        initialRegion: {
          latitude: 37.5665,
          longitude: 126.978,
          latitudeDelta: 0.1,
          longitudeDelta: 0.1,
        },
        allCoordinates: [],
      };
    }

    let minLat = Infinity,
      maxLat = -Infinity;
    let minLng = Infinity,
      maxLng = -Infinity;

    allPoints.forEach((p) => {
      minLat = Math.min(minLat, p.latitude);
      maxLat = Math.max(maxLat, p.latitude);
      minLng = Math.min(minLng, p.longitude);
      maxLng = Math.max(maxLng, p.longitude);
    });

    const latDelta = (maxLat - minLat) * 1.3;
    const lngDelta = (maxLng - minLng) * 1.3;

    return {
      initialRegion: {
        latitude: (minLat + maxLat) / 2,
        longitude: (minLng + maxLng) / 2,
        latitudeDelta: Math.max(latDelta, 0.01),
        longitudeDelta: Math.max(lngDelta, 0.01),
      },
      allCoordinates: allPoints.map((p) => ({
        latitude: p.latitude,
        longitude: p.longitude,
      })),
    };
  }, [firstRoute, secondRoute]);

  // 경로 데이터 샘플링
  const sampleRoute = (
    route: GpsPoint[],
    maxPoints: number = 200
  ): GpsPoint[] => {
    if (route.length <= maxPoints) return route;
    const step = Math.ceil(route.length / maxPoints);
    return route.filter((_, i) => i % step === 0);
  };

  const sampledFirst = useMemo(() => sampleRoute(firstRoute), [firstRoute]);
  const sampledSecond = useMemo(() => sampleRoute(secondRoute), [secondRoute]);

  // Convert to coordinates
  const firstCoordinates = useMemo(
    () =>
      sampledFirst.map((p) => ({
        latitude: p.latitude,
        longitude: p.longitude,
      })),
    [sampledFirst]
  );

  const secondCoordinates = useMemo(
    () =>
      sampledSecond.map((p) => ({
        latitude: p.latitude,
        longitude: p.longitude,
      })),
    [sampledSecond]
  );

  // Start and end points
  const firstStart = sampledFirst[0];
  const firstEnd = sampledFirst[sampledFirst.length - 1];
  const secondStart = sampledSecond[0];
  const secondEnd = sampledSecond[sampledSecond.length - 1];

  // Fit to bounds when map is ready
  const handleMapReady = () => {
    setIsLoading(false);
    if (mapRef.current && allCoordinates.length > 0) {
      mapRef.current.fitToCoordinates(allCoordinates, {
        edgePadding: { top: 50, right: 50, bottom: 50, left: 50 },
        animated: true,
      });
    }
  };

  return (
    <View style={styles.container}>
      {isLoading && (
        <View style={[styles.loadingOverlay, { backgroundColor: colors.surface }]}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={{ color: colors.muted, marginTop: 8 }}>지도 로딩 중...</Text>
        </View>
      )}
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        initialRegion={initialRegion}
        onMapReady={handleMapReady}
        showsUserLocation={false}
        showsMyLocationButton={false}
        showsCompass={false}
        showsScale={false}
        toolbarEnabled={false}
        mapType="standard"
        customMapStyle={mapStyle}
      >
        {/* First Route (Blue) */}
        {firstCoordinates.length > 1 && (
          <>
            <Polyline
              coordinates={firstCoordinates}
              strokeColor={firstColor}
              strokeWidth={4}
            />
            {/* Start marker */}
            {firstStart && (
              <Marker
                coordinate={{
                  latitude: firstStart.latitude,
                  longitude: firstStart.longitude,
                }}
                anchor={{ x: 0.5, y: 0.5 }}
                title="기준 시작"
              >
                <View
                  style={[
                    styles.circleMarker,
                    { backgroundColor: firstColor, opacity: 1 },
                  ]}
                />
              </Marker>
            )}
            {/* End marker */}
            {firstEnd && (
              <Marker
                coordinate={{
                  latitude: firstEnd.latitude,
                  longitude: firstEnd.longitude,
                }}
                anchor={{ x: 0.5, y: 0.5 }}
                title="기준 종료"
              >
                <View
                  style={[
                    styles.circleMarker,
                    { backgroundColor: firstColor, opacity: 0.6 },
                  ]}
                />
              </Marker>
            )}
          </>
        )}

        {/* Second Route (Green) */}
        {secondCoordinates.length > 1 && (
          <>
            <Polyline
              coordinates={secondCoordinates}
              strokeColor={secondColor}
              strokeWidth={4}
            />
            {/* Start marker */}
            {secondStart && (
              <Marker
                coordinate={{
                  latitude: secondStart.latitude,
                  longitude: secondStart.longitude,
                }}
                anchor={{ x: 0.5, y: 0.5 }}
                title="비교 시작"
              >
                <View
                  style={[
                    styles.circleMarker,
                    { backgroundColor: secondColor, opacity: 1 },
                  ]}
                />
              </Marker>
            )}
            {/* End marker */}
            {secondEnd && (
              <Marker
                coordinate={{
                  latitude: secondEnd.latitude,
                  longitude: secondEnd.longitude,
                }}
                anchor={{ x: 0.5, y: 0.5 }}
                title="비교 종료"
              >
                <View
                  style={[
                    styles.circleMarker,
                    { backgroundColor: secondColor, opacity: 0.6 },
                  ]}
                />
              </Marker>
            )}
          </>
        )}
      </MapView>
    </View>
  );
}

// Custom map style for cleaner look
const mapStyle = [
  {
    featureType: "poi",
    elementType: "labels",
    stylers: [{ visibility: "off" }],
  },
  {
    featureType: "transit",
    elementType: "labels",
    stylers: [{ visibility: "off" }],
  },
];

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  circleMarker: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "white",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
});
