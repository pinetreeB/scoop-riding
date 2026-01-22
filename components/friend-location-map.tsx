import { useState, useMemo, useRef } from "react";
import { View, StyleSheet, Text, ActivityIndicator, Platform } from "react-native";
import { WebView } from "react-native-webview";
import { useColors } from "@/hooks/use-colors";

interface FriendLocationMapProps {
  latitude: number;
  longitude: number;
  heading?: number | null;
  name?: string | null;
  profileImageUrl?: string | null;
  style?: any;
}

export function FriendLocationMap({
  latitude,
  longitude,
  heading,
  name,
  profileImageUrl,
  style,
}: FriendLocationMapProps) {
  const colors = useColors();
  const webViewRef = useRef<WebView>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Generate HTML for the map using OpenStreetMap + Leaflet
  const generateMapHtml = useMemo(() => {
    const markerRotation = heading || 0;
    const initial = name?.[0]?.toUpperCase() || "?";
    
    // Use profile image or fallback to initial
    const markerContent = profileImageUrl
      ? `<img src="${profileImageUrl}" style="width:48px;height:48px;border-radius:50%;border:3px solid ${colors.primary};box-shadow:0 2px 8px rgba(0,0,0,0.3);" />`
      : `<div style="width:48px;height:48px;border-radius:50%;background:${colors.primary};display:flex;align-items:center;justify-content:center;color:white;font-weight:bold;font-size:20px;box-shadow:0 2px 8px rgba(0,0,0,0.3);">${initial}</div>`;

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
    .friend-marker {
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .friend-marker img, .friend-marker > div {
      transition: transform 0.3s ease;
    }
    .direction-arrow {
      width: 0;
      height: 0;
      border-left: 8px solid transparent;
      border-right: 8px solid transparent;
      border-bottom: 16px solid ${colors.primary};
      margin-top: -4px;
      transform: rotate(${markerRotation}deg);
    }
    .pulse-ring {
      position: absolute;
      width: 80px;
      height: 80px;
      border-radius: 50%;
      background: ${colors.primary}30;
      animation: pulse 2s infinite;
      top: -16px;
      left: -16px;
    }
    @keyframes pulse {
      0% { transform: scale(0.8); opacity: 1; }
      100% { transform: scale(1.5); opacity: 0; }
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    var map = L.map('map', {
      zoomControl: true,
      attributionControl: false
    }).setView([${latitude}, ${longitude}], 17);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
    }).addTo(map);

    // Custom marker with profile image
    var friendIcon = L.divIcon({
      className: 'friend-marker-container',
      html: '<div class="friend-marker"><div class="pulse-ring"></div>${markerContent}${heading !== null ? '<div class="direction-arrow"></div>' : ''}</div>',
      iconSize: [48, 64],
      iconAnchor: [24, 48],
    });

    L.marker([${latitude}, ${longitude}], { icon: friendIcon }).addTo(map);

    // Notify React Native that map is ready
    window.ReactNativeWebView?.postMessage(JSON.stringify({ type: 'mapReady' }));
  </script>
</body>
</html>
    `;
  }, [latitude, longitude, heading, name, profileImageUrl, colors.primary]);

  if (Platform.OS === "web") {
    return (
      <View style={[styles.container, style]}>
        <iframe
          srcDoc={generateMapHtml}
          style={{ flex: 1, border: 0, width: "100%", height: "100%" }}
        />
      </View>
    );
  }

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
      <WebView
        ref={webViewRef}
        source={{ html: generateMapHtml }}
        style={styles.webview}
        scrollEnabled={false}
        onLoadEnd={() => setIsLoading(false)}
        onMessage={(event) => {
          try {
            const data = JSON.parse(event.nativeEvent.data);
            if (data.type === "mapReady") {
              setIsLoading(false);
            }
          } catch (e) {
            // Ignore parse errors
          }
        }}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        originWhitelist={["*"]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: "hidden",
  },
  webview: {
    flex: 1,
    backgroundColor: "transparent",
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
});
