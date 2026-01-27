import { useState, useMemo } from "react";
import { View, Text, Pressable, Dimensions } from "react-native";
import Svg, { Path, Defs, LinearGradient, Stop, Line, Text as SvgText } from "react-native-svg";

import { useColors } from "@/hooks/use-colors";
import { GpsPoint } from "@/lib/gps-utils";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

interface RideChartProps {
  gpsPoints: GpsPoint[];
  duration: number; // 전체 주행 시간 (초)
}

type ChartType = "altitude" | "speed";

interface ChartData {
  time: number; // 초
  value: number;
}

export function RideChart({ gpsPoints, duration }: RideChartProps) {
  const colors = useColors();
  const [selectedChart, setSelectedChart] = useState<ChartType>("altitude");

  // 차트 크기 설정
  const chartWidth = SCREEN_WIDTH - 32;
  const chartHeight = 180;
  const paddingLeft = 40;
  const paddingRight = 16;
  const paddingTop = 16;
  const paddingBottom = 40;
  const graphWidth = chartWidth - paddingLeft - paddingRight;
  const graphHeight = chartHeight - paddingTop - paddingBottom;

  // GPS 데이터에서 고도/속도 데이터 추출
  const { altitudeData, speedData, stats } = useMemo(() => {
    if (gpsPoints.length < 2) {
      return {
        altitudeData: [],
        speedData: [],
        stats: { minAlt: 0, maxAlt: 100, avgSpeed: 0, maxSpeed: 0 },
      };
    }

    const startTime = gpsPoints[0].timestamp;
    const altData: ChartData[] = [];
    const spdData: ChartData[] = [];

    let minAlt = Infinity;
    let maxAlt = -Infinity;
    let maxSpd = 0;
    let totalSpd = 0;
    let spdCount = 0;

    // 데이터 샘플링 (너무 많은 포인트 방지)
    const sampleRate = Math.max(1, Math.floor(gpsPoints.length / 100));

    for (let i = 0; i < gpsPoints.length; i += sampleRate) {
      const point = gpsPoints[i];
      const time = (point.timestamp - startTime) / 1000; // 초 단위

      // 고도 데이터
      if (point.altitude !== undefined && point.altitude !== null) {
        const alt = point.altitude;
        altData.push({ time, value: alt });
        minAlt = Math.min(minAlt, alt);
        maxAlt = Math.max(maxAlt, alt);
      }

      // 속도 데이터
      if (point.speed !== undefined && point.speed !== null) {
        const spd = point.speed * 3.6; // m/s to km/h
        spdData.push({ time, value: spd });
        maxSpd = Math.max(maxSpd, spd);
        totalSpd += spd;
        spdCount++;
      }
    }

    // 고도 범위 조정 (최소 10m 범위)
    if (maxAlt - minAlt < 10) {
      const mid = (maxAlt + minAlt) / 2;
      minAlt = mid - 5;
      maxAlt = mid + 5;
    }

    return {
      altitudeData: altData,
      speedData: spdData,
      stats: {
        minAlt: Math.floor(minAlt),
        maxAlt: Math.ceil(maxAlt),
        avgSpeed: spdCount > 0 ? totalSpd / spdCount : 0,
        maxSpeed: maxSpd,
      },
    };
  }, [gpsPoints]);

  // 시간 포맷 (MM:SS)
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // SVG 경로 생성
  const generatePath = (data: ChartData[], minVal: number, maxVal: number): string => {
    if (data.length < 2) return "";

    const maxTime = duration || data[data.length - 1].time;
    const range = maxVal - minVal || 1;

    const points = data.map((d) => {
      const x = paddingLeft + (d.time / maxTime) * graphWidth;
      const y = paddingTop + graphHeight - ((d.value - minVal) / range) * graphHeight;
      return { x, y };
    });

    let path = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      path += ` L ${points[i].x} ${points[i].y}`;
    }

    return path;
  };

  // 채워진 영역 경로 생성
  const generateAreaPath = (data: ChartData[], minVal: number, maxVal: number): string => {
    if (data.length < 2) return "";

    const linePath = generatePath(data, minVal, maxVal);
    const maxTime = duration || data[data.length - 1].time;
    const lastX = paddingLeft + (data[data.length - 1].time / maxTime) * graphWidth;
    const firstX = paddingLeft + (data[0].time / maxTime) * graphWidth;
    const bottomY = paddingTop + graphHeight;

    return `${linePath} L ${lastX} ${bottomY} L ${firstX} ${bottomY} Z`;
  };

  // 시간축 눈금 생성
  const timeLabels = useMemo(() => {
    const labels: { time: number; label: string }[] = [];
    const maxTime = duration || (gpsPoints.length > 0 ? (gpsPoints[gpsPoints.length - 1].timestamp - gpsPoints[0].timestamp) / 1000 : 0);
    
    if (maxTime <= 0) return labels;

    // 적절한 간격 계산 (5개 정도의 눈금)
    const interval = Math.ceil(maxTime / 5 / 60) * 60; // 분 단위로 반올림
    
    for (let t = 0; t <= maxTime; t += interval) {
      labels.push({ time: t, label: formatTime(t) });
    }

    return labels;
  }, [duration, gpsPoints]);

  // 값 축 눈금 생성
  const valueLabels = useMemo(() => {
    const labels: { value: number; label: string }[] = [];
    
    if (selectedChart === "altitude") {
      const range = stats.maxAlt - stats.minAlt;
      const step = Math.ceil(range / 4 / 10) * 10; // 10m 단위
      for (let v = stats.minAlt; v <= stats.maxAlt; v += step) {
        labels.push({ value: v, label: `${Math.round(v)}` });
      }
    } else {
      const maxSpd = Math.ceil(stats.maxSpeed / 10) * 10 || 100;
      const step = maxSpd / 4;
      for (let v = 0; v <= maxSpd; v += step) {
        labels.push({ value: v, label: `${Math.round(v)}` });
      }
    }

    return labels;
  }, [selectedChart, stats]);

  const currentData = selectedChart === "altitude" ? altitudeData : speedData;
  const minVal = selectedChart === "altitude" ? stats.minAlt : 0;
  const maxVal = selectedChart === "altitude" ? stats.maxAlt : (Math.ceil(stats.maxSpeed / 10) * 10 || 100);

  const hasData = currentData.length >= 2;

  return (
    <View className="mx-4 mb-4">
      {/* 탭 버튼 */}
      <View className="flex-row mb-4">
        <Pressable
          onPress={() => setSelectedChart("altitude")}
          style={({ pressed }) => [{ opacity: pressed ? 0.8 : 1 }]}
          className={`px-5 py-2 rounded-full mr-2 ${
            selectedChart === "altitude"
              ? "bg-green-500"
              : "bg-surface border border-border"
          }`}
        >
          <Text
            className={`font-medium ${
              selectedChart === "altitude" ? "text-white" : "text-muted"
            }`}
          >
            고도
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setSelectedChart("speed")}
          style={({ pressed }) => [{ opacity: pressed ? 0.8 : 1 }]}
          className={`px-5 py-2 rounded-full ${
            selectedChart === "speed"
              ? "bg-blue-500"
              : "bg-surface border border-border"
          }`}
        >
          <Text
            className={`font-medium ${
              selectedChart === "speed" ? "text-white" : "text-muted"
            }`}
          >
            속도
          </Text>
        </Pressable>
      </View>

      {/* 차트 */}
      <View className="bg-surface rounded-2xl p-2 border border-border">
        {hasData ? (
          <Svg width={chartWidth} height={chartHeight}>
            <Defs>
              <LinearGradient id="altitudeGradient" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0%" stopColor="#22C55E" stopOpacity="0.6" />
                <Stop offset="100%" stopColor="#22C55E" stopOpacity="0.1" />
              </LinearGradient>
              <LinearGradient id="speedGradient" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0%" stopColor="#3B82F6" stopOpacity="0.6" />
                <Stop offset="100%" stopColor="#3B82F6" stopOpacity="0.1" />
              </LinearGradient>
            </Defs>

            {/* 그리드 라인 */}
            {valueLabels.map((label, i) => {
              const y = paddingTop + graphHeight - ((label.value - minVal) / (maxVal - minVal || 1)) * graphHeight;
              return (
                <Line
                  key={`grid-${i}`}
                  x1={paddingLeft}
                  y1={y}
                  x2={chartWidth - paddingRight}
                  y2={y}
                  stroke={colors.border}
                  strokeWidth={1}
                  strokeDasharray="4,4"
                />
              );
            })}

            {/* 채워진 영역 */}
            <Path
              d={generateAreaPath(currentData, minVal, maxVal)}
              fill={selectedChart === "altitude" ? "url(#altitudeGradient)" : "url(#speedGradient)"}
            />

            {/* 라인 */}
            <Path
              d={generatePath(currentData, minVal, maxVal)}
              stroke={selectedChart === "altitude" ? "#22C55E" : "#3B82F6"}
              strokeWidth={2}
              fill="none"
            />

            {/* Y축 레이블 */}
            {valueLabels.map((label, i) => {
              const y = paddingTop + graphHeight - ((label.value - minVal) / (maxVal - minVal || 1)) * graphHeight;
              return (
                <SvgText
                  key={`y-label-${i}`}
                  x={paddingLeft - 8}
                  y={y + 4}
                  fontSize={10}
                  fill={colors.muted}
                  textAnchor="end"
                >
                  {label.label}
                </SvgText>
              );
            })}

            {/* X축 레이블 */}
            {timeLabels.map((label, i) => {
              const maxTime = duration || (gpsPoints.length > 0 ? (gpsPoints[gpsPoints.length - 1].timestamp - gpsPoints[0].timestamp) / 1000 : 1);
              const x = paddingLeft + (label.time / maxTime) * graphWidth;
              return (
                <SvgText
                  key={`x-label-${i}`}
                  x={x}
                  y={chartHeight - 8}
                  fontSize={10}
                  fill={colors.muted}
                  textAnchor="middle"
                >
                  {label.label}
                </SvgText>
              );
            })}

            {/* 단위 표시 */}
            <SvgText
              x={8}
              y={paddingTop - 4}
              fontSize={10}
              fill={colors.muted}
            >
              {selectedChart === "altitude" ? "m" : "km/h"}
            </SvgText>
          </Svg>
        ) : (
          <View style={{ height: chartHeight }} className="items-center justify-center">
            <Text className="text-muted">
              {selectedChart === "altitude" ? "고도 데이터가 없습니다" : "속도 데이터가 없습니다"}
            </Text>
          </View>
        )}
      </View>

      {/* 하단 통계 */}
      <View className="flex-row mt-4 justify-around">
        {selectedChart === "altitude" ? (
          <>
            <View className="items-center">
              <Text className="text-xs text-muted">최저 고도</Text>
              <Text className="text-lg font-bold text-foreground">
                {stats.minAlt === Infinity ? "-" : `${stats.minAlt}m`}
              </Text>
            </View>
            <View className="items-center">
              <Text className="text-xs text-muted">최고 고도</Text>
              <Text className="text-lg font-bold text-foreground">
                {stats.maxAlt === -Infinity ? "-" : `${stats.maxAlt}m`}
              </Text>
            </View>
            <View className="items-center">
              <Text className="text-xs text-muted">고도 차이</Text>
              <Text className="text-lg font-bold text-foreground">
                {stats.minAlt === Infinity || stats.maxAlt === -Infinity
                  ? "-"
                  : `${stats.maxAlt - stats.minAlt}m`}
              </Text>
            </View>
          </>
        ) : (
          <>
            <View className="items-center">
              <View className="flex-row items-center">
                <View className="w-2 h-2 rounded-full bg-blue-500 mr-1" />
                <Text className="text-xs text-muted">평균 속도</Text>
              </View>
              <Text className="text-lg font-bold text-foreground">
                {stats.avgSpeed.toFixed(1)} km/h
              </Text>
            </View>
            <View className="items-center">
              <Text className="text-xs text-muted">최고 속도</Text>
              <Text className="text-lg font-bold text-foreground">
                {stats.maxSpeed.toFixed(1)} km/h
              </Text>
            </View>
          </>
        )}
      </View>
    </View>
  );
}
