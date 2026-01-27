import { useMemo, useRef, useState, useEffect } from "react";
import { View, StyleSheet, Text, ActivityIndicator, Platform } from "react-native";

// Only import react-native-maps on native platforms
let MapView: any = null;
let Marker: any = null;
let Polyline: any = null;
let PROVIDER_GOOGLE: any = null;
let Region: any = null;

if (Platform.OS !== "web") {
  const maps = require("react-native-maps");
  MapView = maps.default;
  Marker = maps.Marker;
  Polyline = maps.Polyline;
  PROVIDER_GOOGLE = maps.PROVIDER_GOOGLE;
  Region = maps.Region;
}
import { GpsPoint, getBoundingBox } from "@/lib/gps-utils";
import { useColors } from "@/hooks/use-colors";
import Svg, { Path } from "react-native-svg";

interface GpxRoutePoint {
  latitude: number;
  longitude: number;
  elevation?: number;
  time?: string;
}

interface GroupMemberLocation {
  userId: number;
  name: string | null;
  latitude: number | null;
  longitude: number | null;
  distance: number;
  currentSpeed: number;
  isRiding: boolean;
}

interface GoogleRideMapProps {
  gpsPoints: GpsPoint[];
  currentLocation?: { latitude: number; longitude: number; heading?: number } | null;
  showCurrentLocation?: boolean;
  isLive?: boolean;
  style?: any;
  gpxRoute?: { points: GpxRoutePoint[]; name?: string } | null;
  groupMembers?: GroupMemberLocation[];
}

// Arrow marker component for current location
function ArrowMarker({ heading, color }: { heading: number; color: string }) {
  return (
    <View style={styles.arrowContainer}>
      <View style={styles.pulseRing} />
      <View style={[styles.arrowWrapper, { transform: [{ rotate: `${heading}deg` }] }]}>
        <Svg width={28} height={32} viewBox="0 0 28 32">
          <Path
            d="M14 0 L28 32 L14 24 L0 32 Z"
            fill={color}
            stroke="white"
            strokeWidth={2}
          />
        </Svg>
      </View>
    </View>
  );
}

// Group member marker component
function GroupMemberMarker({ name, speed }: { name: string | null; speed: number }) {
  const initial = (name || "?").charAt(0).toUpperCase();
  return (
    <View style={styles.memberMarkerContainer}>
      <View style={styles.memberMarker}>
        <Text style={styles.memberInitial}>{initial}</Text>
      </View>
      <View style={styles.memberLabel}>
        <Text style={styles.memberLabelText}>
          {name || "익명"} {(speed / 10).toFixed(0)}km/h
        </Text>
      </View>
    </View>
  );
}

export function GoogleRideMap({
  gpsPoints,
  currentLocation,
  showCurrentLocation = false,
  isLive = false,
  style,
  gpxRoute,
  groupMembers = [],
}: GoogleRideMapProps) {
  const colors = useColors();
  const mapRef = useRef<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [region, setRegion] = useState<any>(null);
  const animatedHeading = useRef(currentLocation?.heading || 0);

  // Calculate initial region from GPS points
  const initialRegion = useMemo(() => {
    if (gpsPoints.length > 0) {
      const boundingBox = getBoundingBox(gpsPoints);
      if (boundingBox) {
        const latDelta = (boundingBox.maxLat - boundingBox.minLat) * 1.3;
        const lonDelta = (boundingBox.maxLon - boundingBox.minLon) * 1.3;
        return {
          latitude: (boundingBox.minLat + boundingBox.maxLat) / 2,
          longitude: (boundingBox.minLon + boundingBox.maxLon) / 2,
          latitudeDelta: Math.max(latDelta, 0.005),
          longitudeDelta: Math.max(lonDelta, 0.005),
        };
      }
    }
    if (currentLocation) {
      return {
        latitude: currentLocation.latitude,
        longitude: currentLocation.longitude,
        latitudeDelta: 0.005,
        longitudeDelta: 0.005,
      };
    }
    // Default to Seoul
    return {
      latitude: 37.5665,
      longitude: 126.978,
      latitudeDelta: 0.1,
      longitudeDelta: 0.1,
    };
  }, []);

  // Convert GPS points to coordinates for polyline
  const pathCoordinates = useMemo(() => {
    return gpsPoints.map(p => ({
      latitude: p.latitude,
      longitude: p.longitude,
    }));
  }, [gpsPoints]);

  // Convert GPX route to coordinates
  const gpxCoordinates = useMemo(() => {
    if (!gpxRoute?.points) return [];
    return gpxRoute.points.map(p => ({
      latitude: p.latitude,
      longitude: p.longitude,
    }));
  }, [gpxRoute]);

  // Start and end points
  const startPoint = gpsPoints.length > 0 ? gpsPoints[0] : null;
  const endPoint = gpsPoints.length > 1 ? gpsPoints[gpsPoints.length - 1] : null;

  // Animate to current location in live mode
  useEffect(() => {
    if (isLive && currentLocation && mapRef.current) {
      mapRef.current.animateToRegion({
        latitude: currentLocation.latitude,
        longitude: currentLocation.longitude,
        latitudeDelta: 0.005,
        longitudeDelta: 0.005,
      }, 300);

      // Smooth heading animation
      if (currentLocation.heading !== undefined) {
        animatedHeading.current = currentLocation.heading;
      }
    }
  }, [isLive, currentLocation?.latitude, currentLocation?.longitude, currentLocation?.heading]);

  // Fit to bounds when not in live mode
  useEffect(() => {
    if (!isLive && mapRef.current && gpsPoints.length > 1) {
      const coordinates = gpsPoints.map(p => ({
        latitude: p.latitude,
        longitude: p.longitude,
      }));
      mapRef.current.fitToCoordinates(coordinates, {
        edgePadding: { top: 50, right: 50, bottom: 50, left: 50 },
        animated: true,
      });
    }
  }, [isLive, gpsPoints.length]);

  // No GPS points and no current location - show placeholder
  if (gpsPoints.length === 0 && !currentLocation) {
    return (
      <View style={[styles.container, style, { backgroundColor: colors.surface }]}>
        <View style={styles.placeholder}>
          <Text style={{ color: colors.muted, textAlign: "center" }}>
            GPS 데이터가 없습니다
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, style]}>
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
        onMapReady={() => setIsLoading(false)}
        showsUserLocation={false}
        showsMyLocationButton={false}
        showsCompass={false}
        showsScale={false}
        rotateEnabled={!isLive}
        scrollEnabled={!isLive}
        zoomEnabled={!isLive}
        pitchEnabled={false}
        toolbarEnabled={false}
        mapType="standard"
        customMapStyle={mapStyle}
      >
        {/* GPX Guide Route (dashed blue line) */}
        {gpxCoordinates.length > 1 && (
          <>
            <Polyline
              coordinates={gpxCoordinates}
              strokeColor="#2196F3"
              strokeWidth={6}
              lineDashPattern={[10, 10]}
            />
            {/* GPX Start Marker */}
            <Marker
              coordinate={gpxCoordinates[0]}
              anchor={{ x: 0.5, y: 0.5 }}
            >
              <View style={[styles.gpxMarker, { backgroundColor: "#2196F3" }]} />
            </Marker>
            {/* GPX End Marker */}
            <Marker
              coordinate={gpxCoordinates[gpxCoordinates.length - 1]}
              anchor={{ x: 0.5, y: 0.5 }}
            >
              <View style={[styles.gpxMarker, { backgroundColor: "#FF5722" }]} />
            </Marker>
          </>
        )}

        {/* Actual Ride Path */}
        {pathCoordinates.length > 1 && (
          <Polyline
            coordinates={pathCoordinates}
            strokeColor={colors.primary}
            strokeWidth={5}
          />
        )}

        {/* Start Marker */}
        {startPoint && (
          <Marker
            coordinate={{
              latitude: startPoint.latitude,
              longitude: startPoint.longitude,
            }}
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <View style={[styles.startMarker, { backgroundColor: "#4CAF50" }]} />
          </Marker>
        )}

        {/* End Marker (only for non-live mode) */}
        {endPoint && !isLive && (
          <Marker
            coordinate={{
              latitude: endPoint.latitude,
              longitude: endPoint.longitude,
            }}
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <View style={[styles.endMarker, { backgroundColor: "#F44336" }]} />
          </Marker>
        )}

        {/* Group Member Markers */}
        {groupMembers
          .filter(m => m.latitude && m.longitude && m.isRiding)
          .map(member => (
            <Marker
              key={member.userId}
              coordinate={{
                latitude: member.latitude!,
                longitude: member.longitude!,
              }}
              anchor={{ x: 0.5, y: 0.5 }}
            >
              <GroupMemberMarker name={member.name} speed={member.currentSpeed} />
            </Marker>
          ))}

        {/* Current Location Arrow Marker (live mode) */}
        {isLive && currentLocation && (
          <Marker
            coordinate={{
              latitude: currentLocation.latitude,
              longitude: currentLocation.longitude,
            }}
            anchor={{ x: 0.5, y: 0.5 }}
            flat={true}
          >
            <ArrowMarker
              heading={animatedHeading.current}
              color={colors.primary}
            />
          </Marker>
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
    borderRadius: 12,
    overflow: "hidden",
  },
  map: {
    flex: 1,
  },
  placeholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  arrowContainer: {
    width: 60,
    height: 60,
    alignItems: "center",
    justifyContent: "center",
  },
  arrowWrapper: {
    position: "absolute",
  },
  pulseRing: {
    position: "absolute",
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "rgba(255, 109, 0, 0.25)",
  },
  startMarker: {
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
  endMarker: {
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
  gpxMarker: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 3,
    borderColor: "white",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  memberMarkerContainer: {
    alignItems: "center",
  },
  memberMarker: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#4CAF50",
    borderWidth: 3,
    borderColor: "white",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  memberInitial: {
    color: "white",
    fontSize: 12,
    fontWeight: "bold",
  },
  memberLabel: {
    marginTop: 4,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  memberLabelText: {
    color: "white",
    fontSize: 10,
  },
});
