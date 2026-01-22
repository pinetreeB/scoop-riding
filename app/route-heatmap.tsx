import { useState, useEffect, useCallback, useMemo } from "react";
import {
  View,
  Text,
  Pressable,
  Dimensions,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
import { WebView } from "react-native-webview";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { getRidingRecords, type RidingRecord } from "@/lib/riding-store";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

interface GpsPoint {
  latitude: number;
  longitude: number;
  count: number;
}

export default function RouteHeatmapScreen() {
  const router = useRouter();
  const colors = useColors();
  const [records, setRecords] = useState<RidingRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [totalPoints, setTotalPoints] = useState(0);

  useEffect(() => {
    const loadRecords = async () => {
      try {
        const allRecords = await getRidingRecords();
        setRecords(allRecords);
        
        // 총 포인트 수 계산
        let points = 0;
        allRecords.forEach(record => {
          if (record.gpsPoints) {
            points += record.gpsPoints.length;
          }
        });
        setTotalPoints(points);
      } catch (error) {
        console.error("Failed to load records:", error);
      } finally {
        setIsLoading(false);
      }
    };
    loadRecords();
  }, []);

  // 히트맵 데이터 생성 - 그리드 기반 집계
  const heatmapData = useMemo(() => {
    const gridSize = 0.0005; // 약 50m 그리드
    const grid: Map<string, GpsPoint> = new Map();

    records.forEach(record => {
      if (!record.gpsPoints || record.gpsPoints.length === 0) return;

      record.gpsPoints.forEach(point => {
        const gridLat = Math.floor(point.latitude / gridSize) * gridSize;
        const gridLng = Math.floor(point.longitude / gridSize) * gridSize;
        const key = `${gridLat.toFixed(6)},${gridLng.toFixed(6)}`;

        if (grid.has(key)) {
          const existing = grid.get(key)!;
          existing.count += 1;
        } else {
          grid.set(key, {
            latitude: gridLat + gridSize / 2,
            longitude: gridLng + gridSize / 2,
            count: 1,
          });
        }
      });
    });

    return Array.from(grid.values());
  }, [records]);

  // 중심 좌표 계산
  const center = useMemo(() => {
    if (heatmapData.length === 0) {
      return { lat: 37.5665, lng: 126.978 }; // 서울 기본값
    }

    let sumLat = 0;
    let sumLng = 0;
    heatmapData.forEach(point => {
      sumLat += point.latitude;
      sumLng += point.longitude;
    });

    return {
      lat: sumLat / heatmapData.length,
      lng: sumLng / heatmapData.length,
    };
  }, [heatmapData]);

  // 최대 카운트 (색상 정규화용)
  const maxCount = useMemo(() => {
    if (heatmapData.length === 0) return 1;
    return Math.max(...heatmapData.map(p => p.count));
  }, [heatmapData]);

  // 지도 HTML 생성
  const generateMapHtml = useCallback(() => {
    const heatPoints = heatmapData.map(p => {
      const intensity = Math.min(p.count / maxCount, 1);
      return `[${p.latitude}, ${p.longitude}, ${intensity}]`;
    }).join(",");

    return `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script src="https://unpkg.com/leaflet.heat@0.2.0/dist/leaflet-heat.js"></script>
  <style>
    body { margin: 0; padding: 0; }
    #map { width: 100%; height: 100vh; }
    .legend {
      position: absolute;
      bottom: 20px;
      right: 10px;
      background: white;
      padding: 10px;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
      z-index: 1000;
      font-size: 12px;
    }
    .legend-gradient {
      width: 100px;
      height: 10px;
      background: linear-gradient(to right, #00ff00, #ffff00, #ff0000);
      border-radius: 4px;
      margin-top: 4px;
    }
    .legend-labels {
      display: flex;
      justify-content: space-between;
      font-size: 10px;
      color: #666;
      margin-top: 2px;
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <div class="legend">
    <div>주행 빈도</div>
    <div class="legend-gradient"></div>
    <div class="legend-labels">
      <span>낮음</span>
      <span>높음</span>
    </div>
  </div>
  <script>
    const map = L.map('map').setView([${center.lat}, ${center.lng}], 13);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap'
    }).addTo(map);
    
    const heatData = [${heatPoints}];
    
    if (heatData.length > 0) {
      const heat = L.heatLayer(heatData, {
        radius: 25,
        blur: 15,
        maxZoom: 17,
        max: 1.0,
        gradient: {
          0.0: '#00ff00',
          0.3: '#7fff00',
          0.5: '#ffff00',
          0.7: '#ff7f00',
          1.0: '#ff0000'
        }
      }).addTo(map);
      
      // 모든 포인트가 보이도록 줌 조정
      if (heatData.length > 1) {
        const bounds = L.latLngBounds(heatData.map(p => [p[0], p[1]]));
        map.fitBounds(bounds, { padding: [50, 50] });
      }
    }
  </script>
</body>
</html>
    `;
  }, [heatmapData, center, maxCount]);

  if (isLoading) {
    return (
      <ScreenContainer className="flex-1 items-center justify-center">
        <ActivityIndicator size="large" color={colors.primary} />
        <Text className="text-muted mt-4">주행 기록 분석 중...</Text>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer edges={["top", "left", "right"]} className="flex-1">
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-border">
        <View className="flex-row items-center">
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
          >
            <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
          </Pressable>
          <Text className="text-xl font-bold text-foreground ml-4">주행 히트맵</Text>
        </View>
        <View className="flex-row items-center">
          <MaterialIcons name="place" size={16} color={colors.muted} />
          <Text className="text-sm text-muted ml-1">{totalPoints.toLocaleString()}개 포인트</Text>
        </View>
      </View>

      {/* Map */}
      {heatmapData.length === 0 ? (
        <View className="flex-1 items-center justify-center px-8">
          <MaterialIcons name="map" size={64} color={colors.muted} />
          <Text className="text-lg font-semibold text-foreground mt-4 text-center">
            주행 기록이 없습니다
          </Text>
          <Text className="text-muted text-center mt-2">
            주행을 시작하면 자주 다니는 경로가 히트맵으로 표시됩니다
          </Text>
        </View>
      ) : (
        <View className="flex-1">
          <WebView
            source={{ html: generateMapHtml() }}
            style={{ flex: 1 }}
            scrollEnabled={false}
            javaScriptEnabled={true}
          />
        </View>
      )}

      {/* Stats */}
      <View className="bg-surface border-t border-border px-4 py-4">
        <View className="flex-row justify-around">
          <View className="items-center">
            <Text className="text-2xl font-bold text-foreground">{records.length}</Text>
            <Text className="text-xs text-muted">총 주행 횟수</Text>
          </View>
          <View className="w-px bg-border" />
          <View className="items-center">
            <Text className="text-2xl font-bold text-foreground">{heatmapData.length}</Text>
            <Text className="text-xs text-muted">방문 구역</Text>
          </View>
          <View className="w-px bg-border" />
          <View className="items-center">
            <Text className="text-2xl font-bold text-primary">{maxCount}</Text>
            <Text className="text-xs text-muted">최다 방문</Text>
          </View>
        </View>
      </View>
    </ScreenContainer>
  );
}
