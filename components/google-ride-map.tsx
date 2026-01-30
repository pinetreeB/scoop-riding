import { useMemo, useRef, useState, useEffect, useCallback } from "react";
import { View, StyleSheet, Text, ActivityIndicator, Platform, TouchableOpacity } from "react-native";

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
  /** 네비게이션 모드 - 진행 방향이 항상 위를 향하도록 지도 회전 */
  navigationMode?: boolean;
  /** 지도 터치 조작 허용 (라이브 모드에서도 조작 가능) */
  allowInteraction?: boolean;
  /** 자동 추적 모드 복귀 시간 (초, 기본 10초) */
  autoFollowDelay?: number;
  /** 현재 속도 (km/h) - 속도 기반 자동 줌 레벨 조절에 사용 */
  currentSpeed?: number;
  /** 현재 위치 버튼 표시 여부 */
  showRecenterButton?: boolean;
  /** 현재 위치 버튼 클릭 콜백 */
  onRecenterPress?: () => void;
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
  navigationMode = false,
  allowInteraction = true,
  autoFollowDelay = 10,
  currentSpeed = 0,
  showRecenterButton = true,
  onRecenterPress,
}: GoogleRideMapProps) {
  const colors = useColors();
  const mapRef = useRef<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [region, setRegion] = useState<any>(null);
  const animatedHeading = useRef(currentLocation?.heading || 0);
  const lastCameraHeading = useRef<number>(0);
  
  // 지도 터치 조작 상태 관리
  const [isUserInteracting, setIsUserInteracting] = useState(false);
  const interactionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // 속도 기반 자동 줌 레벨 계산
  // 저속: 줌 17 (상세), 고속: 줌 14 (넓은 시야)
  const getZoomForSpeed = useCallback((speed: number): number => {
    if (speed <= 10) return 17;      // 0-10 km/h: 최대 줌 (상세)
    if (speed <= 30) return 16.5;    // 10-30 km/h
    if (speed <= 50) return 16;      // 30-50 km/h
    if (speed <= 70) return 15.5;    // 50-70 km/h
    if (speed <= 100) return 15;     // 70-100 km/h
    return 14;                        // 100+ km/h: 최소 줌 (넓은 시야)
  }, []);
  
  // 현재 위치로 즉시 복귀
  const handleRecenter = useCallback(() => {
    if (interactionTimeoutRef.current) {
      clearTimeout(interactionTimeoutRef.current);
    }
    setIsUserInteracting(false);
    onRecenterPress?.();
    console.log("[GoogleRideMap] Recenter button pressed");
  }, [onRecenterPress]);
  
  // 사용자 지도 조작 시 호출
  const handleMapInteraction = useCallback(() => {
    if (!allowInteraction || !isLive) return;
    
    setIsUserInteracting(true);
    
    // 기존 타이머 취소
    if (interactionTimeoutRef.current) {
      clearTimeout(interactionTimeoutRef.current);
    }
    
    // autoFollowDelay 초 후 자동 추적 모드 복귀
    interactionTimeoutRef.current = setTimeout(() => {
      setIsUserInteracting(false);
      console.log("[GoogleRideMap] Auto-follow mode resumed");
    }, autoFollowDelay * 1000);
  }, [allowInteraction, isLive, autoFollowDelay]);
  
  // 컴포넌트 언마운트 시 타이머 정리
  useEffect(() => {
    return () => {
      if (interactionTimeoutRef.current) {
        clearTimeout(interactionTimeoutRef.current);
      }
    };
  }, []);

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

  // Track last update time for debugging
  const lastUpdateTimeRef = useRef<number>(Date.now());
  
  // Animate to current location in live mode with optional navigation rotation
  useEffect(() => {
    // 사용자가 지도를 조작 중이면 자동 추적 안함
    if (isUserInteracting) {
      return;
    }
    
    if (isLive && currentLocation && mapRef.current) {
      // Log update frequency for debugging
      const now = Date.now();
      const timeSinceLastUpdate = now - lastUpdateTimeRef.current;
      if (timeSinceLastUpdate > 2000) {
        console.log(`[GoogleRideMap] Camera update after ${timeSinceLastUpdate}ms`);
      }
      lastUpdateTimeRef.current = now;
      
      // Smooth heading animation
      if (currentLocation.heading !== undefined) {
        animatedHeading.current = currentLocation.heading;
      }

      // 속도 기반 자동 줌 레벨 계산
      const dynamicZoom = getZoomForSpeed(currentSpeed);
      
      if (navigationMode) {
        // 네비게이션 모드: 카메라를 회전하여 진행 방향이 항상 위를 향하도록
        const heading = currentLocation.heading ?? lastCameraHeading.current;
        lastCameraHeading.current = heading;
        
        mapRef.current.animateCamera({
          center: {
            latitude: currentLocation.latitude,
            longitude: currentLocation.longitude,
          },
          heading: heading, // 카메라가 진행 방향을 향하도록 회전
          pitch: 45, // 약간 기울어진 시점 (네비게이션 스타일)
          zoom: dynamicZoom, // 속도 기반 동적 줌 레벨
        }, { duration: 150 }); // 더 빠른 애니메이션 (300ms -> 150ms)
      } else {
        // 일반 라이브 모드: 위치만 업데이트
        mapRef.current.animateToRegion({
          latitude: currentLocation.latitude,
          longitude: currentLocation.longitude,
          latitudeDelta: 0.005,
          longitudeDelta: 0.005,
        }, 150); // 더 빠른 애니메이션 (300ms -> 150ms)
      }
    }
  }, [isLive, navigationMode, isUserInteracting, currentLocation?.latitude, currentLocation?.longitude, currentLocation?.heading, currentSpeed, getZoomForSpeed]);

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
        showsCompass={isUserInteracting}
        showsScale={isUserInteracting}
        rotateEnabled={!isLive || allowInteraction}
        scrollEnabled={!isLive || allowInteraction}
        zoomEnabled={!isLive || allowInteraction}
        pitchEnabled={false}
        toolbarEnabled={false}
        mapType="standard"
        customMapStyle={mapStyle}
        onPanDrag={handleMapInteraction}
        onTouchStart={handleMapInteraction}
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
            {/* 네비게이션 모드에서는 지도가 회전하므로 화살표는 항상 위를 향함 (heading: 0) */}
            <ArrowMarker
              heading={navigationMode ? 0 : animatedHeading.current}
              color={colors.primary}
            />
          </Marker>
        )}
      </MapView>
      
      {/* 현재 위치 버튼 - 사용자가 지도를 조작 중일 때만 표시 */}
      {isLive && showRecenterButton && isUserInteracting && (
        <TouchableOpacity
          style={[
            styles.recenterButton,
            { backgroundColor: colors.background, borderColor: colors.border }
          ]}
          onPress={handleRecenter}
          activeOpacity={0.7}
        >
          <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
            <Path
              d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3A8.994 8.994 0 0013 3.06V1h-2v2.06A8.994 8.994 0 003.06 11H1v2h2.06A8.994 8.994 0 0011 20.94V23h2v-2.06A8.994 8.994 0 0020.94 13H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z"
              fill={colors.primary}
            />
          </Svg>
        </TouchableOpacity>
      )}
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
  recenterButton: {
    position: "absolute",
    bottom: 120,
    right: 16,
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
});
