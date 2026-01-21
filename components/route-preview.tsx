import { View, Text, Dimensions } from "react-native";
import Svg, { Polyline, Circle } from "react-native-svg";
import { useColors } from "@/hooks/use-colors";
import type { GpsPoint } from "@/lib/gps-utils";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

interface RoutePreviewProps {
  gpsPoints: GpsPoint[];
  width?: number;
  height?: number;
  showStats?: boolean;
  distance?: number;
  duration?: number;
}

export function RoutePreview({
  gpsPoints,
  width,
  height = 150,
  showStats = false,
  distance,
  duration,
}: RoutePreviewProps) {
  // Default width calculation - use 100% of available space
  const effectiveWidth = width ?? SCREEN_WIDTH - 64;
  const colors = useColors();

  if (!gpsPoints || gpsPoints.length < 2) {
    return (
      <View
        className="items-center justify-center rounded-xl"
        style={{
          width,
          height,
          backgroundColor: colors.surface,
        }}
      >
        <Text className="text-muted text-sm">경로 데이터 없음</Text>
      </View>
    );
  }

  // Calculate bounds
  const lats = gpsPoints.map((p) => p.latitude);
  const lngs = gpsPoints.map((p) => p.longitude);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  // Add padding
  const padding = 20;
  const latRange = maxLat - minLat || 0.001;
  const lngRange = maxLng - minLng || 0.001;

  // Scale to fit
  const scaleX = (effectiveWidth - padding * 2) / lngRange;
  const scaleY = (height - padding * 2) / latRange;
  const scale = Math.min(scaleX, scaleY);

  // Center offset
  const offsetX = (effectiveWidth - lngRange * scale) / 2;
  const offsetY = (height - latRange * scale) / 2;

  // Convert GPS points to SVG coordinates
  const svgPoints = gpsPoints.map((p) => ({
    x: (p.longitude - minLng) * scale + offsetX,
    y: height - ((p.latitude - minLat) * scale + offsetY), // Flip Y axis
  }));

  // Create polyline points string
  const pointsString = svgPoints.map((p) => `${p.x},${p.y}`).join(" ");

  // Start and end points
  const startPoint = svgPoints[0];
  const endPoint = svgPoints[svgPoints.length - 1];

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}시간 ${minutes}분`;
    }
    return `${minutes}분`;
  };

  return (
    <View>
      <View
        className="rounded-xl overflow-hidden"
        style={{
          width: effectiveWidth,
          height,
          backgroundColor: colors.surface,
        }}
      >
        <Svg width={effectiveWidth} height={height}>
          {/* Route line */}
          <Polyline
            points={pointsString}
            fill="none"
            stroke={colors.primary}
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Start point (green) */}
          <Circle cx={startPoint.x} cy={startPoint.y} r={6} fill="#22C55E" />
          <Circle cx={startPoint.x} cy={startPoint.y} r={3} fill="#FFFFFF" />
          {/* End point (red) */}
          <Circle cx={endPoint.x} cy={endPoint.y} r={6} fill="#EF4444" />
          <Circle cx={endPoint.x} cy={endPoint.y} r={3} fill="#FFFFFF" />
        </Svg>
      </View>
      {showStats && distance !== undefined && duration !== undefined && (
        <View className="flex-row justify-around mt-2">
          <View className="items-center">
            <Text className="text-muted text-xs">거리</Text>
            <Text className="text-foreground font-semibold">
              {(distance / 1000).toFixed(2)}km
            </Text>
          </View>
          <View className="items-center">
            <Text className="text-muted text-xs">시간</Text>
            <Text className="text-foreground font-semibold">
              {formatDuration(duration)}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}
