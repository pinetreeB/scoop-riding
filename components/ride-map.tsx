import { useEffect, useRef, useState } from "react";
import { View, StyleSheet, Platform, Text, ActivityIndicator } from "react-native";
import { WebView } from "react-native-webview";
import { GpsPoint, getBoundingBox } from "@/lib/gps-utils";
import { useColors } from "@/hooks/use-colors";

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
  const webViewRef = useRef<WebView>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Calculate center and zoom from GPS points
  const getMapCenter = () => {
    if (gpsPoints.length > 0) {
      const boundingBox = getBoundingBox(gpsPoints);
      if (boundingBox) {
        return {
          lat: (boundingBox.minLat + boundingBox.maxLat) / 2,
          lng: (boundingBox.minLon + boundingBox.maxLon) / 2,
          zoom: calculateZoom(boundingBox),
        };
      }
    }
    if (currentLocation) {
      return {
        lat: currentLocation.latitude,
        lng: currentLocation.longitude,
        zoom: 16,
      };
    }
    // Default to Seoul
    return { lat: 37.5665, lng: 126.978, zoom: 12 };
  };

  const calculateZoom = (boundingBox: { minLat: number; maxLat: number; minLon: number; maxLon: number }) => {
    const latDiff = boundingBox.maxLat - boundingBox.minLat;
    const lonDiff = boundingBox.maxLon - boundingBox.minLon;
    const maxDiff = Math.max(latDiff, lonDiff);
    
    if (maxDiff < 0.005) return 17;
    if (maxDiff < 0.01) return 16;
    if (maxDiff < 0.02) return 15;
    if (maxDiff < 0.05) return 14;
    if (maxDiff < 0.1) return 13;
    if (maxDiff < 0.2) return 12;
    return 11;
  };

  const center = getMapCenter();

  // Generate HTML for the map using OpenStreetMap + Leaflet (free, no API key needed)
  const generateMapHtml = () => {
    const pathCoords = gpsPoints.map(p => `[${p.latitude}, ${p.longitude}]`).join(",");
    const startPoint = gpsPoints.length > 0 ? gpsPoints[0] : null;
    const endPoint = gpsPoints.length > 1 ? gpsPoints[gpsPoints.length - 1] : null;

    return `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; overflow: hidden; }
    #map { width: 100%; height: 100%; }
    .start-marker {
      width: 20px;
      height: 20px;
      background: #4CAF50;
      border: 3px solid white;
      border-radius: 50%;
      box-shadow: 0 2px 4px rgba(0,0,0,0.3);
    }
    .end-marker {
      width: 20px;
      height: 20px;
      background: #F44336;
      border: 3px solid white;
      border-radius: 50%;
      box-shadow: 0 2px 4px rgba(0,0,0,0.3);
    }
    .current-marker {
      width: 24px;
      height: 24px;
      background: ${colors.primary};
      border: 3px solid white;
      border-radius: 50%;
      box-shadow: 0 2px 6px rgba(0,0,0,0.4);
      animation: pulse 2s infinite;
    }
    @keyframes pulse {
      0% { box-shadow: 0 0 0 0 rgba(255, 109, 0, 0.4); }
      70% { box-shadow: 0 0 0 10px rgba(255, 109, 0, 0); }
      100% { box-shadow: 0 0 0 0 rgba(255, 109, 0, 0); }
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    const map = L.map('map', {
      zoomControl: false,
      attributionControl: false
    }).setView([${center.lat}, ${center.lng}], ${center.zoom});

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
    }).addTo(map);

    // Draw path
    const pathCoords = [${pathCoords}];
    if (pathCoords.length > 1) {
      const polyline = L.polyline(pathCoords, {
        color: '${colors.primary}',
        weight: 4,
        opacity: 0.9,
        lineCap: 'round',
        lineJoin: 'round'
      }).addTo(map);
      
      // Fit bounds to path
      map.fitBounds(polyline.getBounds(), { padding: [30, 30] });
    }

    // Start marker
    ${startPoint ? `
    const startIcon = L.divIcon({
      className: 'start-marker-wrapper',
      html: '<div class="start-marker"></div>',
      iconSize: [20, 20],
      iconAnchor: [10, 10]
    });
    L.marker([${startPoint.latitude}, ${startPoint.longitude}], { icon: startIcon }).addTo(map);
    ` : ''}

    // End marker
    ${endPoint && !isLive ? `
    const endIcon = L.divIcon({
      className: 'end-marker-wrapper',
      html: '<div class="end-marker"></div>',
      iconSize: [20, 20],
      iconAnchor: [10, 10]
    });
    L.marker([${endPoint.latitude}, ${endPoint.longitude}], { icon: endIcon }).addTo(map);
    ` : ''}

    // Current location marker (for live mode)
    ${isLive && currentLocation ? `
    const currentIcon = L.divIcon({
      className: 'current-marker-wrapper',
      html: '<div class="current-marker"></div>',
      iconSize: [24, 24],
      iconAnchor: [12, 12]
    });
    const currentMarker = L.marker([${currentLocation.latitude}, ${currentLocation.longitude}], { icon: currentIcon }).addTo(map);
    map.setView([${currentLocation.latitude}, ${currentLocation.longitude}], 16);
    ` : ''}

    // Function to update current location (called from React Native)
    window.updateCurrentLocation = function(lat, lng) {
      if (typeof currentMarker !== 'undefined') {
        currentMarker.setLatLng([lat, lng]);
        map.setView([lat, lng], map.getZoom());
      }
    };

    // Function to add point to path (called from React Native)
    window.addPathPoint = function(lat, lng) {
      if (typeof polyline !== 'undefined') {
        polyline.addLatLng([lat, lng]);
      }
    };
  </script>
</body>
</html>
    `;
  };

  // Update map when location changes in live mode
  useEffect(() => {
    if (isLive && currentLocation && webViewRef.current) {
      webViewRef.current.injectJavaScript(`
        if (window.updateCurrentLocation) {
          window.updateCurrentLocation(${currentLocation.latitude}, ${currentLocation.longitude});
        }
        true;
      `);
    }
  }, [isLive, currentLocation]);

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
      <WebView
        ref={webViewRef}
        source={{ html: generateMapHtml() }}
        style={styles.webview}
        scrollEnabled={false}
        onLoadEnd={() => setIsLoading(false)}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        startInLoadingState={false}
        scalesPageToFit={true}
        originWhitelist={["*"]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    borderRadius: 12,
    overflow: "hidden",
  },
  webview: {
    flex: 1,
    backgroundColor: "transparent",
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
});
