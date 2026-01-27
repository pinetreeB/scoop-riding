import { useMemo, useRef, useState } from "react";
import { View, StyleSheet, Text, ActivityIndicator, Platform, Image } from "react-native";

// Only import react-native-maps on native platforms
let MapView: any = null;
let Marker: any = null;
let PROVIDER_GOOGLE: any = null;

if (Platform.OS !== "web") {
  const maps = require("react-native-maps");
  MapView = maps.default;
  Marker = maps.Marker;
  PROVIDER_GOOGLE = maps.PROVIDER_GOOGLE;
}
import { useColors } from "@/hooks/use-colors";
import Svg, { Path } from "react-native-svg";

interface GoogleFriendLocationMapProps {
  latitude: number;
  longitude: number;
  heading?: number | null;
  name?: string | null;
  profileImageUrl?: string | null;
  style?: any;
}

export function GoogleFriendLocationMap({
  latitude,
  longitude,
  heading,
  name,
  profileImageUrl,
  style,
}: GoogleFriendLocationMapProps) {
  const colors = useColors();
  const mapRef = useRef<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const initial = name?.[0]?.toUpperCase() || "?";

  const initialRegion = {
    latitude,
    longitude,
    latitudeDelta: 0.005,
    longitudeDelta: 0.005,
  };

  return (
    <View style={[styles.container, style]}>
      {isLoading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.muted }]}>
            지도 로딩 중...
          </Text>
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
        showsCompass={true}
        showsScale={false}
        toolbarEnabled={false}
        mapType="standard"
        customMapStyle={mapStyle}
      >
        <Marker
          coordinate={{ latitude, longitude }}
          anchor={{ x: 0.5, y: 0.5 }}
        >
          <View style={styles.markerContainer}>
            {/* Pulse ring effect */}
            <View style={[styles.pulseRing, { backgroundColor: `${colors.primary}30` }]} />
            
            {/* Profile image or initial */}
            {profileImageUrl ? (
              <Image
                source={{ uri: profileImageUrl }}
                style={[styles.profileImage, { borderColor: colors.primary }]}
              />
            ) : (
              <View style={[styles.initialContainer, { backgroundColor: colors.primary }]}>
                <Text style={styles.initialText}>{initial}</Text>
              </View>
            )}
            
            {/* Direction arrow */}
            {heading !== null && heading !== undefined && (
              <View style={[styles.arrowWrapper, { transform: [{ rotate: `${heading}deg` }] }]}>
                <Svg width={16} height={16} viewBox="0 0 16 16">
                  <Path
                    d="M8 0 L16 16 L8 12 L0 16 Z"
                    fill={colors.primary}
                  />
                </Svg>
              </View>
            )}
          </View>
        </Marker>
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
    overflow: "hidden",
  },
  map: {
    flex: 1,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#f5f5f5",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
  },
  loadingText: {
    marginTop: 8,
    fontSize: 14,
  },
  markerContainer: {
    alignItems: "center",
    justifyContent: "center",
    width: 80,
    height: 80,
  },
  pulseRing: {
    position: "absolute",
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  profileImage: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  initialContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  initialText: {
    color: "white",
    fontWeight: "bold",
    fontSize: 20,
  },
  arrowWrapper: {
    marginTop: -4,
  },
});
