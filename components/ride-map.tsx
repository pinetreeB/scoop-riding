import { useEffect, useRef, useState } from "react";
import { View, StyleSheet, Platform, Text } from "react-native";
import { GpsPoint, getBoundingBox, getCenterPoint } from "@/lib/gps-utils";
import { useColors } from "@/hooks/use-colors";

// Conditionally import react-native-maps only on native platforms
let MapView: any = null;
let Polyline: any = null;
let Marker: any = null;
let PROVIDER_GOOGLE: any = null;

if (Platform.OS !== "web") {
  const Maps = require("react-native-maps");
  MapView = Maps.default;
  Polyline = Maps.Polyline;
  Marker = Maps.Marker;
  PROVIDER_GOOGLE = Maps.PROVIDER_GOOGLE;
}

interface Region {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

interface RideMapProps {
  gpsPoints: GpsPoint[];
  currentLocation?: { latitude: number; longitude: number } | null;
  showCurrentLocation?: boolean;
  isLive?: boolean;
  style?: any;
}

export function RideMap({
  gpsPoints,
  currentLocation,
  showCurrentLocation = false,
  isLive = false,
  style,
}: RideMapProps) {
  const colors = useColors();
  const mapRef = useRef<any>(null);
  const [region, setRegion] = useState<Region | null>(null);

  // Calculate initial region from GPS points
  useEffect(() => {
    if (gpsPoints.length > 0) {
      const boundingBox = getBoundingBox(gpsPoints);
      if (boundingBox) {
        const latDelta = Math.max(0.01, (boundingBox.maxLat - boundingBox.minLat) * 1.5);
        const lonDelta = Math.max(0.01, (boundingBox.maxLon - boundingBox.minLon) * 1.5);
        
        setRegion({
          latitude: (boundingBox.minLat + boundingBox.maxLat) / 2,
          longitude: (boundingBox.minLon + boundingBox.maxLon) / 2,
          latitudeDelta: latDelta,
          longitudeDelta: lonDelta,
        });
      }
    } else if (currentLocation) {
      setRegion({
        latitude: currentLocation.latitude,
        longitude: currentLocation.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      });
    }
  }, [gpsPoints.length === 0 ? currentLocation : null]);

  // Follow current location in live mode
  useEffect(() => {
    if (isLive && currentLocation && mapRef.current) {
      mapRef.current.animateToRegion({
        latitude: currentLocation.latitude,
        longitude: currentLocation.longitude,
        latitudeDelta: 0.005,
        longitudeDelta: 0.005,
      }, 500);
    }
  }, [isLive, currentLocation]);

  // Web fallback - show placeholder
  if (Platform.OS === "web") {
    return (
      <View style={[styles.container, style, { backgroundColor: colors.surface }]}>
        <View style={styles.webPlaceholder}>
          <Text style={{ color: colors.muted, textAlign: "center" }}>
            지도는 모바일 앱에서만 표시됩니다.
          </Text>
          <Text style={{ color: colors.muted, textAlign: "center", fontSize: 12, marginTop: 8 }}>
            GPS 포인트: {gpsPoints.length}개
          </Text>
        </View>
      </View>
    );
  }

  // Convert GPS points to coordinates for polyline
  const coordinates = gpsPoints.map((point) => ({
    latitude: point.latitude,
    longitude: point.longitude,
  }));

  // Get start and end points
  const startPoint = gpsPoints.length > 0 ? gpsPoints[0] : null;
  const endPoint = gpsPoints.length > 1 ? gpsPoints[gpsPoints.length - 1] : null;

  if (!region && !currentLocation) {
    return (
      <View style={[styles.container, style, { backgroundColor: colors.surface }]} />
    );
  }

  return (
    <View style={[styles.container, style]}>
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={Platform.OS === "android" ? PROVIDER_GOOGLE : undefined}
        initialRegion={region || {
          latitude: currentLocation?.latitude || 37.5665,
          longitude: currentLocation?.longitude || 126.9780,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        }}
        showsUserLocation={showCurrentLocation}
        showsMyLocationButton={false}
        showsCompass={false}
        showsScale={false}
        rotateEnabled={false}
        pitchEnabled={false}
      >
        {/* Route polyline */}
        {coordinates.length > 1 && (
          <Polyline
            coordinates={coordinates}
            strokeColor={colors.primary}
            strokeWidth={4}
            lineCap="round"
            lineJoin="round"
          />
        )}

        {/* Start marker */}
        {startPoint && (
          <Marker
            coordinate={{
              latitude: startPoint.latitude,
              longitude: startPoint.longitude,
            }}
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <View style={[styles.markerStart, { borderColor: colors.primary }]}>
              <View style={[styles.markerInner, { backgroundColor: "#4CAF50" }]} />
            </View>
          </Marker>
        )}

        {/* End marker (only if different from start) */}
        {endPoint && !isLive && (
          <Marker
            coordinate={{
              latitude: endPoint.latitude,
              longitude: endPoint.longitude,
            }}
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <View style={[styles.markerEnd, { borderColor: colors.primary }]}>
              <View style={[styles.markerInner, { backgroundColor: "#F44336" }]} />
            </View>
          </Marker>
        )}

        {/* Current location marker in live mode */}
        {isLive && currentLocation && (
          <Marker
            coordinate={{
              latitude: currentLocation.latitude,
              longitude: currentLocation.longitude,
            }}
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <View style={styles.currentLocationMarker}>
              <View style={[styles.currentLocationInner, { backgroundColor: colors.primary }]} />
            </View>
          </Marker>
        )}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    borderRadius: 12,
    overflow: "hidden",
  },
  map: {
    flex: 1,
  },
  webPlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  markerStart: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "white",
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  markerEnd: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "white",
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  markerInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  currentLocationMarker: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(255, 109, 0, 0.3)",
    alignItems: "center",
    justifyContent: "center",
  },
  currentLocationInner: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: "white",
  },
});
