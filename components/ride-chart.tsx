import { useState, useMemo } from "react";
import { View, Text, Pressable, Dimensions, ScrollView } from "react-native";
import Svg, { Path, Defs, LinearGradient, Stop, Line, Text as SvgText } from "react-native-svg";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

import { useColors } from "@/hooks/use-colors";
import { GpsPoint } from "@/lib/gps-utils";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

interface RideChartProps {
  gpsPoints: GpsPoint[];
  duration: number; // 전체 주행 시간 (초)
}

type ChartType = "altitude" | "speed" | "both";

interface ChartData {
  time: number; // 초
  value: number;
}

export function RideChart({ gpsPoints, duration }: RideChartProps) {
  const colors = useColors();
  const [selectedChart, setSelectedChart] = useState<ChartType>("altitude");

  // 차트 크기 설정
  const chartWidth = selectedChart === "both" ? SCREEN_WIDTH * 1.5 : SCREEN_WIDTH - 32;
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

    // 고도 범위 조정 - 고저차가 시각적으로 잘 보이도록 스케일 조정
    const altRange = maxAlt - minAlt;
    if (altRange > 0) {
      const padding = Math.max(altRange * 0.1, 2);
      minAlt = minAlt - padding;
      maxAlt = maxAlt + padding;
    } else {
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
  const generatePath = (data: ChartData[], minVal: number, maxVal: number, width: number): string => {
    if (data.length < 2) return "";

    const maxTime = duration || data[data.length - 1].time;
    const range = maxVal - minVal || 1;
    const gWidth = width - paddingLeft - paddingRight;

    const points = data.map((d) => {
      const x = paddingLeft + (d.time / maxTime) * gWidth;
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
  const generateAreaPath = (data: ChartData[], minVal: number, maxVal: number, width: number): string => {
    if (data.length < 2) return "";

    const linePath = generatePath(data, minVal, maxVal, width);
    const maxTime = duration || data[data.length - 1].time;
    const gWidth = width - paddingLeft - paddingRight;
    const lastX = paddingLeft + (data[data.length - 1].time / maxTime) * gWidth;
    const firstX = paddingLeft + (data[0].time / maxTime) * gWidth;
    const bottomY = paddingTop + graphHeight;

    return `${linePath} L ${lastX} ${bottomY} L ${firstX} ${bottomY} Z`;
  };

  // 시간축 눈금 생성
  const getTimeLabels = (width: number) => {
    const labels: { time: number; label: string }[] = [];
    const maxTime = duration || (gpsPoints.length > 0 ? (gpsPoints[gpsPoints.length - 1].timestamp - gpsPoints[0].timestamp) / 1000 : 0);
    
    if (maxTime <= 0) return labels;

    const numLabels = selectedChart === "both" ? 8 : 5;
    const interval = Math.ceil(maxTime / numLabels / 60) * 60;
    
    for (let t = 0; t <= maxTime; t += interval) {
      labels.push({ time: t, label: formatTime(t) });
    }

    return labels;
  };

  // 값 축 눈금 생성
  const getValueLabels = (type: "altitude" | "speed") => {
    const labels: { value: number; label: string }[] = [];
    
    if (type === "altitude") {
      const range = stats.maxAlt - stats.minAlt;
      const step = Math.ceil(range / 4 / 10) * 10 || 10;
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
  };

  const hasAltitudeData = altitudeData.length >= 2;
  const hasSpeedData = speedData.length >= 2;

  // 단일 차트 렌더링
  const renderSingleChart = (type: "altitude" | "speed", width: number) => {
    const data = type === "altitude" ? altitudeData : speedData;
    const minVal = type === "altitude" ? stats.minAlt : 0;
    const maxVal = type === "altitude" ? stats.maxAlt : (Math.ceil(stats.maxSpeed / 10) * 10 || 100);
    const valueLabels = getValueLabels(type);
    const timeLabels = getTimeLabels(width);
    const hasData = data.length >= 2;
    const gWidth = width - paddingLeft - paddingRight;

    if (!hasData) {
      return (
        <View style={{ width, height: chartHeight }} className="items-center justify-center bg-surface rounded-2xl border border-border">
          <Text className="text-muted">
            {type === "altitude" ? "고도 데이터가 없습니다" : "속도 데이터가 없습니다"}
          </Text>
        </View>
      );
    }

    return (
      <Svg width={width} height={chartHeight}>
        <Defs>
          <LinearGradient id={`${type}Gradient`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor={type === "altitude" ? "#22C55E" : "#3B82F6"} stopOpacity="0.6" />
            <Stop offset="100%" stopColor={type === "altitude" ? "#22C55E" : "#3B82F6"} stopOpacity="0.1" />
          </LinearGradient>
        </Defs>

        {/* 그리드 라인 */}
        {valueLabels.map((label, i) => {
          const y = paddingTop + graphHeight - ((label.value - minVal) / (maxVal - minVal || 1)) * graphHeight;
          return (
            <Line
              key={`grid-${type}-${i}`}
              x1={paddingLeft}
              y1={y}
              x2={width - paddingRight}
              y2={y}
              stroke={colors.border}
              strokeWidth={1}
              strokeDasharray="4,4"
            />
          );
        })}

        {/* 채워진 영역 */}
        <Path
          d={generateAreaPath(data, minVal, maxVal, width)}
          fill={`url(#${type}Gradient)`}
        />

        {/* 라인 */}
        <Path
          d={generatePath(data, minVal, maxVal, width)}
          stroke={type === "altitude" ? "#22C55E" : "#3B82F6"}
          strokeWidth={2}
          fill="none"
        />

        {/* Y축 레이블 */}
        {valueLabels.map((label, i) => {
          const y = paddingTop + graphHeight - ((label.value - minVal) / (maxVal - minVal || 1)) * graphHeight;
          return (
            <SvgText
              key={`y-label-${type}-${i}`}
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
          const x = paddingLeft + (label.time / maxTime) * gWidth;
          return (
            <SvgText
              key={`x-label-${type}-${i}`}
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
          {type === "altitude" ? "m" : "km/h"}
        </SvgText>
      </Svg>
    );
  };

  // 동시 보기 차트 렌더링 (두 개의 Y축)
  const renderCombinedChart = () => {
    const width = SCREEN_WIDTH * 1.5;
    const timeLabels = getTimeLabels(width);
    const altValueLabels = getValueLabels("altitude");
    const spdValueLabels = getValueLabels("speed");
    const gWidth = width - paddingLeft - paddingRight - 40; // 오른쪽 Y축 공간 추가

    const altMinVal = stats.minAlt;
    const altMaxVal = stats.maxAlt;
    const spdMinVal = 0;
    const spdMaxVal = Math.ceil(stats.maxSpeed / 10) * 10 || 100;

    if (!hasAltitudeData && !hasSpeedData) {
      return (
        <View style={{ width, height: chartHeight }} className="items-center justify-center bg-surface rounded-2xl border border-border">
          <Text className="text-muted">데이터가 없습니다</Text>
        </View>
      );
    }

    return (
      <Svg width={width} height={chartHeight}>
        <Defs>
          <LinearGradient id="altGradientCombined" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor="#22C55E" stopOpacity="0.4" />
            <Stop offset="100%" stopColor="#22C55E" stopOpacity="0.05" />
          </LinearGradient>
          <LinearGradient id="spdGradientCombined" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor="#3B82F6" stopOpacity="0.4" />
            <Stop offset="100%" stopColor="#3B82F6" stopOpacity="0.05" />
          </LinearGradient>
        </Defs>

        {/* 고도 그리드 라인 */}
        {altValueLabels.map((label, i) => {
          const y = paddingTop + graphHeight - ((label.value - altMinVal) / (altMaxVal - altMinVal || 1)) * graphHeight;
          return (
            <Line
              key={`grid-alt-${i}`}
              x1={paddingLeft}
              y1={y}
              x2={width - paddingRight - 40}
              y2={y}
              stroke={colors.border}
              strokeWidth={1}
              strokeDasharray="4,4"
              opacity={0.5}
            />
          );
        })}

        {/* 고도 채워진 영역 */}
        {hasAltitudeData && (
          <Path
            d={generateAreaPath(altitudeData, altMinVal, altMaxVal, width - 40)}
            fill="url(#altGradientCombined)"
          />
        )}

        {/* 고도 라인 */}
        {hasAltitudeData && (
          <Path
            d={generatePath(altitudeData, altMinVal, altMaxVal, width - 40)}
            stroke="#22C55E"
            strokeWidth={2}
            fill="none"
          />
        )}

        {/* 속도 라인 */}
        {hasSpeedData && (
          <Path
            d={generatePath(speedData, spdMinVal, spdMaxVal, width - 40)}
            stroke="#3B82F6"
            strokeWidth={2}
            fill="none"
            strokeDasharray="6,3"
          />
        )}

        {/* 왼쪽 Y축 레이블 (고도) */}
        {altValueLabels.map((label, i) => {
          const y = paddingTop + graphHeight - ((label.value - altMinVal) / (altMaxVal - altMinVal || 1)) * graphHeight;
          return (
            <SvgText
              key={`y-label-alt-${i}`}
              x={paddingLeft - 8}
              y={y + 4}
              fontSize={10}
              fill="#22C55E"
              textAnchor="end"
            >
              {label.label}
            </SvgText>
          );
        })}

        {/* 오른쪽 Y축 레이블 (속도) */}
        {spdValueLabels.map((label, i) => {
          const y = paddingTop + graphHeight - ((label.value - spdMinVal) / (spdMaxVal - spdMinVal || 1)) * graphHeight;
          return (
            <SvgText
              key={`y-label-spd-${i}`}
              x={width - paddingRight - 32}
              y={y + 4}
              fontSize={10}
              fill="#3B82F6"
              textAnchor="start"
            >
              {label.label}
            </SvgText>
          );
        })}

        {/* X축 레이블 */}
        {timeLabels.map((label, i) => {
          const maxTime = duration || (gpsPoints.length > 0 ? (gpsPoints[gpsPoints.length - 1].timestamp - gpsPoints[0].timestamp) / 1000 : 1);
          const x = paddingLeft + (label.time / maxTime) * gWidth;
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
        <SvgText x={8} y={paddingTop - 4} fontSize={10} fill="#22C55E">m</SvgText>
        <SvgText x={width - 48} y={paddingTop - 4} fontSize={10} fill="#3B82F6">km/h</SvgText>
      </Svg>
    );
  };

  return (
    <View className="mx-4 mb-4">
      {/* 탭 버튼 - 스크롤 가능 */}
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        className="mb-4"
        contentContainerStyle={{ paddingRight: 16 }}
      >
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
          className={`px-5 py-2 rounded-full mr-2 ${
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
        <Pressable
          onPress={() => setSelectedChart("both")}
          style={({ pressed }) => [{ opacity: pressed ? 0.8 : 1 }]}
          className={`px-5 py-2 rounded-full flex-row items-center ${
            selectedChart === "both"
              ? "bg-primary"
              : "bg-surface border border-border"
          }`}
        >
          <MaterialIcons 
            name="compare-arrows" 
            size={16} 
            color={selectedChart === "both" ? "#fff" : colors.muted} 
          />
          <Text
            className={`font-medium ml-1 ${
              selectedChart === "both" ? "text-white" : "text-muted"
            }`}
          >
            동시 보기
          </Text>
        </Pressable>
      </ScrollView>

      {/* 차트 */}
      {selectedChart === "both" ? (
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={true}
          className="bg-surface rounded-2xl border border-border"
        >
          <View className="p-2">
            {renderCombinedChart()}
          </View>
        </ScrollView>
      ) : (
        <View className="bg-surface rounded-2xl p-2 border border-border">
          {renderSingleChart(selectedChart, SCREEN_WIDTH - 32)}
        </View>
      )}

      {/* 범례 (동시 보기일 때) */}
      {selectedChart === "both" && (
        <View className="flex-row justify-center mt-3 gap-6">
          <View className="flex-row items-center">
            <View className="w-4 h-1 bg-green-500 rounded mr-2" />
            <Text className="text-sm text-muted">고도 (m)</Text>
          </View>
          <View className="flex-row items-center">
            <View className="w-4 h-1 bg-blue-500 rounded mr-2" style={{ borderStyle: 'dashed' }} />
            <Text className="text-sm text-muted">속도 (km/h)</Text>
          </View>
        </View>
      )}

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
        ) : selectedChart === "speed" ? (
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
        ) : (
          <>
            <View className="items-center">
              <View className="flex-row items-center">
                <View className="w-2 h-2 rounded-full bg-green-500 mr-1" />
                <Text className="text-xs text-muted">고도 차이</Text>
              </View>
              <Text className="text-lg font-bold text-foreground">
                {stats.minAlt === Infinity || stats.maxAlt === -Infinity
                  ? "-"
                  : `${stats.maxAlt - stats.minAlt}m`}
              </Text>
            </View>
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
