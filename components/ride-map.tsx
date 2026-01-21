import { useEffect, useRef, useState, useMemo } from "react";
import { View, StyleSheet, Text, ActivityIndicator } from "react-native";
import { WebView } from "react-native-webview";
import { GpsPoint, getBoundingBox } from "@/lib/gps-utils";
import { useColors } from "@/hooks/use-colors";

interface RideMapProps {
  gpsPoints: GpsPoint[];
  currentLocation?: { latitude: number; longitude: number; heading?: number } | null;
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
  const lastUpdateRef = useRef<number>(0);

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
        zoom: 17,
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

  // Generate HTML for the map using OpenStreetMap + Leaflet
  const generateMapHtml = useMemo(() => {
    const pathCoords = gpsPoints.map(p => `[${p.latitude}, ${p.longitude}]`).join(",");
    const startPoint = gpsPoints.length > 0 ? gpsPoints[0] : null;
    const endPoint = gpsPoints.length > 1 ? gpsPoints[gpsPoints.length - 1] : null;
    const initialHeading = currentLocation?.heading || 0;

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
    .leaflet-container {
      background: #f5f5f5;
    }
    .start-marker {
      width: 16px;
      height: 16px;
      background: #4CAF50;
      border: 2px solid white;
      border-radius: 50%;
      box-shadow: 0 2px 4px rgba(0,0,0,0.3);
    }
    .end-marker {
      width: 16px;
      height: 16px;
      background: #F44336;
      border: 2px solid white;
      border-radius: 50%;
      box-shadow: 0 2px 4px rgba(0,0,0,0.3);
    }
    /* Navigation arrow marker */
    .arrow-marker {
      width: 0;
      height: 0;
      border-left: 12px solid transparent;
      border-right: 12px solid transparent;
      border-bottom: 28px solid ${colors.primary};
      filter: drop-shadow(0 2px 4px rgba(0,0,0,0.4));
      transform-origin: center center;
      transition: transform 0.3s ease-out;
    }
    .arrow-marker::after {
      content: '';
      position: absolute;
      top: 8px;
      left: -6px;
      width: 0;
      height: 0;
      border-left: 6px solid transparent;
      border-right: 6px solid transparent;
      border-bottom: 14px solid white;
    }
    /* Pulsing circle around arrow */
    .arrow-container {
      position: relative;
      width: 50px;
      height: 50px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .pulse-ring {
      position: absolute;
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: rgba(255, 109, 0, 0.2);
      animation: pulse-ring 2s infinite;
    }
    @keyframes pulse-ring {
      0% { transform: scale(0.8); opacity: 1; }
      100% { transform: scale(1.5); opacity: 0; }
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    // State variables
    let currentMarker = null;
    let polyline = null;
    let currentHeading = ${initialHeading};
    let targetLat = ${currentLocation?.latitude || center.lat};
    let targetLng = ${currentLocation?.longitude || center.lng};
    let currentLat = targetLat;
    let currentLng = targetLng;
    let isLiveMode = ${isLive};
    let animationFrame = null;

    // Initialize map
    const map = L.map('map', {
      zoomControl: false,
      attributionControl: false,
      rotate: true,
      rotateControl: false,
      touchRotate: false,
    }).setView([${center.lat}, ${center.lng}], ${isLive ? 17 : center.zoom});

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
    }).addTo(map);

    // Draw path
    const pathCoords = [${pathCoords}];
    if (pathCoords.length > 1) {
      polyline = L.polyline(pathCoords, {
        color: '${colors.primary}',
        weight: 5,
        opacity: 0.9,
        lineCap: 'round',
        lineJoin: 'round'
      }).addTo(map);
      
      if (!isLiveMode) {
        map.fitBounds(polyline.getBounds(), { padding: [30, 30] });
      }
    }

    // Start marker
    ${startPoint ? `
    const startIcon = L.divIcon({
      className: 'start-marker-wrapper',
      html: '<div class="start-marker"></div>',
      iconSize: [16, 16],
      iconAnchor: [8, 8]
    });
    L.marker([${startPoint.latitude}, ${startPoint.longitude}], { icon: startIcon }).addTo(map);
    ` : ''}

    // End marker (only for non-live mode)
    ${endPoint && !isLive ? `
    const endIcon = L.divIcon({
      className: 'end-marker-wrapper',
      html: '<div class="end-marker"></div>',
      iconSize: [16, 16],
      iconAnchor: [8, 8]
    });
    L.marker([${endPoint.latitude}, ${endPoint.longitude}], { icon: endIcon }).addTo(map);
    ` : ''}

    // Create arrow marker for live mode
    ${isLive && currentLocation ? `
    function createArrowIcon(heading) {
      return L.divIcon({
        className: 'arrow-marker-wrapper',
        html: '<div class="arrow-container"><div class="pulse-ring"></div><div class="arrow-marker" id="arrow" style="transform: rotate(' + heading + 'deg)"></div></div>',
        iconSize: [50, 50],
        iconAnchor: [25, 25]
      });
    }

    currentMarker = L.marker([${currentLocation.latitude}, ${currentLocation.longitude}], { 
      icon: createArrowIcon(${initialHeading}),
      zIndexOffset: 1000
    }).addTo(map);
    
    // Set initial view with rotation
    map.setView([${currentLocation.latitude}, ${currentLocation.longitude}], 17);
    ` : ''}

    // Smooth animation function
    function lerp(start, end, factor) {
      return start + (end - start) * factor;
    }

    // Normalize angle difference
    function normalizeAngle(angle) {
      while (angle > 180) angle -= 360;
      while (angle < -180) angle += 360;
      return angle;
    }

    // Animation loop for smooth updates
    function animate() {
      if (!isLiveMode) return;

      // Smooth position interpolation
      const positionFactor = 0.15;
      currentLat = lerp(currentLat, targetLat, positionFactor);
      currentLng = lerp(currentLng, targetLng, positionFactor);

      // Update marker position
      if (currentMarker) {
        currentMarker.setLatLng([currentLat, currentLng]);
      }

      // Smooth map pan to follow marker
      const mapCenter = map.getCenter();
      const newCenterLat = lerp(mapCenter.lat, currentLat, positionFactor);
      const newCenterLng = lerp(mapCenter.lng, currentLng, positionFactor);
      map.setView([newCenterLat, newCenterLng], map.getZoom(), { animate: false });

      // Continue animation
      animationFrame = requestAnimationFrame(animate);
    }

    // Start animation loop for live mode
    if (isLiveMode) {
      animate();
    }

    // Function to update current location (called from React Native)
    window.updateCurrentLocation = function(lat, lng, heading) {
      targetLat = lat;
      targetLng = lng;
      
      if (typeof heading === 'number' && !isNaN(heading)) {
        currentHeading = heading;
        
        // Update arrow rotation
        const arrowEl = document.getElementById('arrow');
        if (arrowEl) {
          arrowEl.style.transform = 'rotate(' + heading + 'deg)';
        }
      }
    };

    // Function to add point to path (called from React Native)
    window.addPathPoint = function(lat, lng) {
      if (polyline) {
        polyline.addLatLng([lat, lng]);
      } else {
        // Create new polyline if doesn't exist
        polyline = L.polyline([[lat, lng]], {
          color: '${colors.primary}',
          weight: 5,
          opacity: 0.9,
          lineCap: 'round',
          lineJoin: 'round'
        }).addTo(map);
      }
    };

    // Cleanup on page unload
    window.addEventListener('beforeunload', function() {
      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
      }
    });
  </script>
</body>
</html>
    `;
  }, [gpsPoints.length, isLive, colors.primary]);

  // Update map when location changes in live mode - throttled for performance
  useEffect(() => {
    if (isLive && currentLocation && webViewRef.current) {
      const now = Date.now();
      // Throttle updates to max 10 per second for smooth animation
      if (now - lastUpdateRef.current < 100) {
        return;
      }
      lastUpdateRef.current = now;

      const heading = currentLocation.heading || 0;
      webViewRef.current.injectJavaScript(`
        if (window.updateCurrentLocation) {
          window.updateCurrentLocation(${currentLocation.latitude}, ${currentLocation.longitude}, ${heading});
        }
        true;
      `);
    }
  }, [isLive, currentLocation?.latitude, currentLocation?.longitude, currentLocation?.heading]);

  // Add new GPS points to path
  useEffect(() => {
    if (isLive && gpsPoints.length > 0 && webViewRef.current) {
      const lastPoint = gpsPoints[gpsPoints.length - 1];
      webViewRef.current.injectJavaScript(`
        if (window.addPathPoint) {
          window.addPathPoint(${lastPoint.latitude}, ${lastPoint.longitude});
        }
        true;
      `);
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
      <WebView
        ref={webViewRef}
        source={{ html: generateMapHtml }}
        style={styles.webview}
        scrollEnabled={false}
        onLoadEnd={() => setIsLoading(false)}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        startInLoadingState={false}
        scalesPageToFit={true}
        originWhitelist={["*"]}
        cacheEnabled={true}
        cacheMode="LOAD_CACHE_ELSE_NETWORK"
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
