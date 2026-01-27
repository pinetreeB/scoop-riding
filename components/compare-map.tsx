import { useMemo, useRef } from "react";
import { View, Platform } from "react-native";
import { WebView } from "react-native-webview";

import { GpsPoint } from "@/lib/gps-utils";

interface CompareMapProps {
  firstRoute: GpsPoint[];
  secondRoute: GpsPoint[];
  firstColor?: string;
  secondColor?: string;
}

export function CompareMap({
  firstRoute,
  secondRoute,
  firstColor = "#3B82F6",
  secondColor = "#22C55E",
}: CompareMapProps) {
  const webViewRef = useRef<WebView>(null);

  // 두 경로의 중심점 및 경계 계산
  const { center, bounds } = useMemo(() => {
    const allPoints = [...firstRoute, ...secondRoute];
    
    if (allPoints.length === 0) {
      return {
        center: { lat: 37.5665, lng: 126.978 },
        bounds: null,
      };
    }

    let minLat = Infinity, maxLat = -Infinity;
    let minLng = Infinity, maxLng = -Infinity;

    allPoints.forEach((p) => {
      minLat = Math.min(minLat, p.latitude);
      maxLat = Math.max(maxLat, p.latitude);
      minLng = Math.min(minLng, p.longitude);
      maxLng = Math.max(maxLng, p.longitude);
    });

    return {
      center: {
        lat: (minLat + maxLat) / 2,
        lng: (minLng + maxLng) / 2,
      },
      bounds: {
        sw: { lat: minLat, lng: minLng },
        ne: { lat: maxLat, lng: maxLng },
      },
    };
  }, [firstRoute, secondRoute]);

  // 경로 데이터 샘플링
  const sampleRoute = (route: GpsPoint[], maxPoints: number = 200): GpsPoint[] => {
    if (route.length <= maxPoints) return route;
    const step = Math.ceil(route.length / maxPoints);
    return route.filter((_, i) => i % step === 0);
  };

  const sampledFirst = useMemo(() => sampleRoute(firstRoute), [firstRoute]);
  const sampledSecond = useMemo(() => sampleRoute(secondRoute), [secondRoute]);

  // HTML 생성
  const mapHtml = useMemo(() => {
    const firstCoords = sampledFirst.map((p) => `[${p.latitude}, ${p.longitude}]`).join(",");
    const secondCoords = sampledSecond.map((p) => `[${p.latitude}, ${p.longitude}]`).join(",");

    const firstStart = sampledFirst[0];
    const firstEnd = sampledFirst[sampledFirst.length - 1];
    const secondStart = sampledSecond[0];
    const secondEnd = sampledSecond[sampledSecond.length - 1];

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
    .leaflet-control-attribution { display: none !important; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    const map = L.map('map', {
      zoomControl: false,
      attributionControl: false,
    }).setView([${center.lat}, ${center.lng}], 14);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
    }).addTo(map);

    // 첫 번째 경로 (파란색)
    const firstRoute = [${firstCoords}];
    if (firstRoute.length > 1) {
      L.polyline(firstRoute, {
        color: '${firstColor}',
        weight: 4,
        opacity: 0.8,
      }).addTo(map);

      // 시작점 마커
      L.circleMarker([${firstStart?.latitude || 0}, ${firstStart?.longitude || 0}], {
        radius: 8,
        fillColor: '${firstColor}',
        color: '#fff',
        weight: 2,
        fillOpacity: 1,
      }).addTo(map).bindPopup('기준 시작');

      // 종료점 마커
      L.circleMarker([${firstEnd?.latitude || 0}, ${firstEnd?.longitude || 0}], {
        radius: 8,
        fillColor: '${firstColor}',
        color: '#fff',
        weight: 2,
        fillOpacity: 0.6,
      }).addTo(map).bindPopup('기준 종료');
    }

    // 두 번째 경로 (녹색)
    const secondRoute = [${secondCoords}];
    if (secondRoute.length > 1) {
      L.polyline(secondRoute, {
        color: '${secondColor}',
        weight: 4,
        opacity: 0.8,
      }).addTo(map);

      // 시작점 마커
      L.circleMarker([${secondStart?.latitude || 0}, ${secondStart?.longitude || 0}], {
        radius: 8,
        fillColor: '${secondColor}',
        color: '#fff',
        weight: 2,
        fillOpacity: 1,
      }).addTo(map).bindPopup('비교 시작');

      // 종료점 마커
      L.circleMarker([${secondEnd?.latitude || 0}, ${secondEnd?.longitude || 0}], {
        radius: 8,
        fillColor: '${secondColor}',
        color: '#fff',
        weight: 2,
        fillOpacity: 0.6,
      }).addTo(map).bindPopup('비교 종료');
    }

    // 두 경로가 모두 보이도록 지도 범위 조정
    const allPoints = [...firstRoute, ...secondRoute];
    if (allPoints.length > 0) {
      const bounds = L.latLngBounds(allPoints);
      map.fitBounds(bounds, { padding: [30, 30] });
    }
  </script>
</body>
</html>
    `;
  }, [sampledFirst, sampledSecond, center, firstColor, secondColor]);

  if (Platform.OS === "web") {
    return (
      <View className="flex-1">
        <iframe
          srcDoc={mapHtml}
          style={{ width: "100%", height: "100%", border: "none" }}
        />
      </View>
    );
  }

  return (
    <View className="flex-1">
      <WebView
        ref={webViewRef}
        source={{ html: mapHtml }}
        style={{ flex: 1 }}
        scrollEnabled={false}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        originWhitelist={["*"]}
      />
    </View>
  );
}
