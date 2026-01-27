import { useState, useEffect, useMemo } from "react";
import {
  View,
  Text,
  Pressable,
  FlatList,
  Modal,
  ActivityIndicator,
  Dimensions,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Svg, { Path, Defs, LinearGradient, Stop, Line, Text as SvgText } from "react-native-svg";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import {
  RidingRecord,
  getRidingRecords,
  getRidingRecordWithGps,
  formatDuration,
} from "@/lib/riding-store";
import { GpsPoint } from "@/lib/gps-utils";
import { CompareMap } from "@/components/compare-map";
import { GoogleCompareMap } from "@/components/google-compare-map";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

export default function CompareRoutesScreen() {
  const router = useRouter();
  const colors = useColors();

  const [records, setRecords] = useState<RidingRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showRecordPicker, setShowRecordPicker] = useState<"first" | "second" | null>(null);

  const [firstRecord, setFirstRecord] = useState<RidingRecord | null>(null);
  const [secondRecord, setSecondRecord] = useState<RidingRecord | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);

  // 주행 기록 목록 로드
  useEffect(() => {
    loadRecords();
  }, []);

  const loadRecords = async () => {
    setIsLoading(true);
    try {
      const allRecords = await getRidingRecords();
      // GPS 데이터가 있는 기록만 필터링
      const recordsWithGps = allRecords.filter(r => r.distance > 0);
      setRecords(recordsWithGps);
    } catch (error) {
      console.error("Failed to load records:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // 기록 선택 시 GPS 데이터 로드
  const handleSelectRecord = async (record: RidingRecord, slot: "first" | "second") => {
    setIsLoadingDetails(true);
    try {
      const fullRecord = await getRidingRecordWithGps(record.id);
      if (slot === "first") {
        setFirstRecord(fullRecord);
      } else {
        setSecondRecord(fullRecord);
      }
      setShowRecordPicker(null);
      
      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    } catch (error) {
      console.error("Failed to load record details:", error);
    } finally {
      setIsLoadingDetails(false);
    }
  };

  // 비교 통계 계산
  const comparison = useMemo(() => {
    if (!firstRecord || !secondRecord) return null;

    const distanceDiff = secondRecord.distance - firstRecord.distance;
    const durationDiff = secondRecord.duration - firstRecord.duration;
    const avgSpeedDiff = secondRecord.avgSpeed - firstRecord.avgSpeed;
    const maxSpeedDiff = secondRecord.maxSpeed - firstRecord.maxSpeed;

    return {
      distanceDiff,
      durationDiff,
      avgSpeedDiff,
      maxSpeedDiff,
      distancePercent: firstRecord.distance > 0 
        ? ((distanceDiff / firstRecord.distance) * 100).toFixed(1) 
        : "0",
      durationPercent: firstRecord.duration > 0 
        ? ((durationDiff / firstRecord.duration) * 100).toFixed(1) 
        : "0",
      avgSpeedPercent: firstRecord.avgSpeed > 0 
        ? ((avgSpeedDiff / firstRecord.avgSpeed) * 100).toFixed(1) 
        : "0",
      maxSpeedPercent: firstRecord.maxSpeed > 0 
        ? ((maxSpeedDiff / firstRecord.maxSpeed) * 100).toFixed(1) 
        : "0",
    };
  }, [firstRecord, secondRecord]);

  // 기록 선택 카드 렌더링
  const renderRecordSelector = (
    record: RidingRecord | null,
    slot: "first" | "second",
    color: string,
    label: string
  ) => (
    <Pressable
      onPress={() => setShowRecordPicker(slot)}
      style={({ pressed }) => [{ opacity: pressed ? 0.8 : 1 }]}
      className="flex-1 bg-surface rounded-xl p-3 border border-border"
    >
      <View className="flex-row items-center mb-2">
        <View
          style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: color }}
        />
        <Text className="text-xs text-muted ml-2">{label}</Text>
      </View>
      {record ? (
        <>
          <Text className="text-sm font-semibold text-foreground">{record.date}</Text>
          <Text className="text-xs text-muted mt-1">
            {(record.distance / 1000).toFixed(2)}km · {formatDuration(record.duration)}
          </Text>
        </>
      ) : (
        <View className="flex-row items-center">
          <MaterialIcons name="add-circle-outline" size={20} color={colors.primary} />
          <Text className="text-sm text-primary ml-2">기록 선택</Text>
        </View>
      )}
    </Pressable>
  );

  // 비교 항목 렌더링
  const renderComparisonItem = (
    label: string,
    firstValue: string,
    secondValue: string,
    diff: number,
    percent: string,
    unit: string,
    higherIsBetter: boolean = true
  ) => {
    const isImproved = higherIsBetter ? diff > 0 : diff < 0;
    const diffColor = isImproved ? colors.success : diff < 0 ? colors.error : colors.muted;

    return (
      <View className="flex-row items-center py-3 border-b border-border">
        <View className="flex-1">
          <Text className="text-xs text-muted">{label}</Text>
          <Text className="text-lg font-bold text-foreground">{firstValue}{unit}</Text>
        </View>
        <View className="items-center px-4">
          {diff !== 0 ? (
            <View className="flex-row items-center">
              <MaterialIcons
                name={diff > 0 ? "arrow-upward" : "arrow-downward"}
                size={16}
                color={diffColor}
              />
              <Text style={{ color: diffColor }} className="text-sm font-medium">
                {Math.abs(diff).toFixed(1)}{unit}
              </Text>
            </View>
          ) : (
            <Text className="text-sm text-muted">동일</Text>
          )}
          {diff !== 0 && (
            <Text style={{ color: diffColor }} className="text-xs">
              ({diff > 0 ? "+" : ""}{percent}%)
            </Text>
          )}
        </View>
        <View className="flex-1 items-end">
          <Text className="text-xs text-muted">{label}</Text>
          <Text className="text-lg font-bold text-foreground">{secondValue}{unit}</Text>
        </View>
      </View>
    );
  };

  // 기록 목록 아이템 렌더링
  const renderRecordItem = ({ item }: { item: RidingRecord }) => (
    <Pressable
      onPress={() => handleSelectRecord(item, showRecordPicker!)}
      style={({ pressed }) => [{ opacity: pressed ? 0.8 : 1 }]}
      className="flex-row items-center p-4 border-b border-border"
    >
      <View className="flex-1">
        <Text className="text-base font-semibold text-foreground">{item.date}</Text>
        <Text className="text-sm text-muted mt-1">
          {(item.distance / 1000).toFixed(2)}km · {formatDuration(item.duration)} · 평균 {item.avgSpeed.toFixed(1)}km/h
        </Text>
      </View>
      <MaterialIcons name="chevron-right" size={24} color={colors.muted} />
    </Pressable>
  );

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]}>
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-border">
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
        >
          <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
        </Pressable>
        <Text className="text-lg font-bold text-foreground">경로 비교</Text>
        <View style={{ width: 24 }} />
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={[1]} // 단일 아이템으로 전체 콘텐츠 렌더링
          renderItem={() => (
            <View className="flex-1">
              {/* Record Selectors */}
              <View className="flex-row px-4 py-4 gap-3">
                {renderRecordSelector(firstRecord, "first", "#3B82F6", "기준 기록")}
                {renderRecordSelector(secondRecord, "second", "#22C55E", "비교 기록")}
              </View>

              {/* Map Comparison */}
              {firstRecord?.gpsPoints && secondRecord?.gpsPoints ? (
                <View className="mx-4 h-64 rounded-2xl overflow-hidden mb-4">
                  {Platform.OS !== "web" ? (
                    <GoogleCompareMap
                      firstRoute={firstRecord.gpsPoints}
                      secondRoute={secondRecord.gpsPoints}
                      firstColor="#3B82F6"
                      secondColor="#22C55E"
                    />
                  ) : (
                    <CompareMap
                      firstRoute={firstRecord.gpsPoints}
                      secondRoute={secondRecord.gpsPoints}
                      firstColor="#3B82F6"
                      secondColor="#22C55E"
                    />
                  )}
                </View>
              ) : (
                <View className="mx-4 h-48 rounded-2xl bg-surface items-center justify-center mb-4 border border-border">
                  <MaterialIcons name="compare-arrows" size={48} color={colors.muted} />
                  <Text className="text-muted mt-2 text-center">
                    두 개의 주행 기록을 선택하면{"\n"}경로를 비교할 수 있습니다
                  </Text>
                </View>
              )}

              {/* Comparison Stats */}
              {comparison && (
                <View className="mx-4 bg-surface rounded-2xl p-4 mb-4 border border-border">
                  <View className="flex-row items-center mb-4">
                    <View className="flex-row items-center flex-1">
                      <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: "#3B82F6" }} />
                      <Text className="text-sm font-medium text-foreground ml-2">기준</Text>
                    </View>
                    <Text className="text-sm font-medium text-muted">차이</Text>
                    <View className="flex-row items-center flex-1 justify-end">
                      <Text className="text-sm font-medium text-foreground mr-2">비교</Text>
                      <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: "#22C55E" }} />
                    </View>
                  </View>

                  {renderComparisonItem(
                    "거리",
                    (firstRecord!.distance / 1000).toFixed(2),
                    (secondRecord!.distance / 1000).toFixed(2),
                    comparison.distanceDiff / 1000,
                    comparison.distancePercent,
                    "km",
                    true
                  )}
                  {renderComparisonItem(
                    "시간",
                    formatDuration(firstRecord!.duration),
                    formatDuration(secondRecord!.duration),
                    comparison.durationDiff,
                    comparison.durationPercent,
                    "",
                    false
                  )}
                  {renderComparisonItem(
                    "평균속도",
                    firstRecord!.avgSpeed.toFixed(1),
                    secondRecord!.avgSpeed.toFixed(1),
                    comparison.avgSpeedDiff,
                    comparison.avgSpeedPercent,
                    "km/h",
                    true
                  )}
                  {renderComparisonItem(
                    "최고속도",
                    firstRecord!.maxSpeed.toFixed(1),
                    secondRecord!.maxSpeed.toFixed(1),
                    comparison.maxSpeedDiff,
                    comparison.maxSpeedPercent,
                    "km/h",
                    true
                  )}
                </View>
              )}

              {/* Speed Comparison Chart */}
              {firstRecord?.gpsPoints && secondRecord?.gpsPoints && (
                <SpeedComparisonChart
                  firstPoints={firstRecord.gpsPoints}
                  secondPoints={secondRecord.gpsPoints}
                  firstDuration={firstRecord.duration}
                  secondDuration={secondRecord.duration}
                />
              )}
            </View>
          )}
          keyExtractor={() => "content"}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Record Picker Modal */}
      <Modal
        visible={showRecordPicker !== null}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowRecordPicker(null)}
      >
        <View className="flex-1 bg-black/50 justify-end">
          <View className="bg-background rounded-t-3xl max-h-[70%]">
            <View className="flex-row items-center justify-between px-4 py-4 border-b border-border">
              <Text className="text-lg font-bold text-foreground">
                {showRecordPicker === "first" ? "기준 기록 선택" : "비교 기록 선택"}
              </Text>
              <Pressable
                onPress={() => setShowRecordPicker(null)}
                style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
              >
                <MaterialIcons name="close" size={24} color={colors.foreground} />
              </Pressable>
            </View>
            
            {isLoadingDetails ? (
              <View className="py-8 items-center">
                <ActivityIndicator size="large" color={colors.primary} />
              </View>
            ) : (
              <FlatList
                data={records.filter(r => 
                  showRecordPicker === "first" 
                    ? r.id !== secondRecord?.id 
                    : r.id !== firstRecord?.id
                )}
                renderItem={renderRecordItem}
                keyExtractor={(item) => item.id}
                showsVerticalScrollIndicator={false}
                ListEmptyComponent={
                  <View className="py-8 items-center">
                    <Text className="text-muted">주행 기록이 없습니다</Text>
                  </View>
                }
              />
            )}
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

// 속도 비교 차트 컴포넌트
function SpeedComparisonChart({
  firstPoints,
  secondPoints,
  firstDuration,
  secondDuration,
}: {
  firstPoints: GpsPoint[];
  secondPoints: GpsPoint[];
  firstDuration: number;
  secondDuration: number;
}) {
  const colors = useColors();

  const chartWidth = SCREEN_WIDTH - 32;
  const chartHeight = 160;
  const paddingLeft = 40;
  const paddingRight = 16;
  const paddingTop = 16;
  const paddingBottom = 32;
  const graphWidth = chartWidth - paddingLeft - paddingRight;
  const graphHeight = chartHeight - paddingTop - paddingBottom;

  // 속도 데이터 추출 및 정규화
  const { firstData, secondData, maxSpeed } = useMemo(() => {
    const extractSpeedData = (points: GpsPoint[], duration: number) => {
      if (points.length < 2) return [];
      
      const startTime = points[0].timestamp;
      const data: { percent: number; speed: number }[] = [];
      const sampleRate = Math.max(1, Math.floor(points.length / 50));

      for (let i = 0; i < points.length; i += sampleRate) {
        const point = points[i];
        const elapsed = (point.timestamp - startTime) / 1000;
        const percent = duration > 0 ? elapsed / duration : 0;
        const speed = (point.speed || 0) * 3.6; // m/s to km/h
        data.push({ percent: Math.min(percent, 1), speed });
      }

      return data;
    };

    const first = extractSpeedData(firstPoints, firstDuration);
    const second = extractSpeedData(secondPoints, secondDuration);
    
    const allSpeeds = [...first.map(d => d.speed), ...second.map(d => d.speed)];
    const max = Math.max(...allSpeeds, 10);

    return { firstData: first, secondData: second, maxSpeed: Math.ceil(max / 10) * 10 };
  }, [firstPoints, secondPoints, firstDuration, secondDuration]);

  // SVG 경로 생성
  const generatePath = (data: { percent: number; speed: number }[]): string => {
    if (data.length < 2) return "";

    const points = data.map((d) => {
      const x = paddingLeft + d.percent * graphWidth;
      const y = paddingTop + graphHeight - (d.speed / maxSpeed) * graphHeight;
      return { x, y };
    });

    let path = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      path += ` L ${points[i].x} ${points[i].y}`;
    }

    return path;
  };

  const hasData = firstData.length >= 2 && secondData.length >= 2;

  return (
    <View className="mx-4 mb-4">
      <Text className="text-base font-semibold text-foreground mb-3">구간별 속도 비교</Text>
      <View className="bg-surface rounded-2xl p-2 border border-border">
        {hasData ? (
          <Svg width={chartWidth} height={chartHeight}>
            {/* 그리드 라인 */}
            {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => {
              const y = paddingTop + graphHeight * (1 - ratio);
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

            {/* 기준 기록 라인 */}
            <Path
              d={generatePath(firstData)}
              stroke="#3B82F6"
              strokeWidth={2}
              fill="none"
            />

            {/* 비교 기록 라인 */}
            <Path
              d={generatePath(secondData)}
              stroke="#22C55E"
              strokeWidth={2}
              fill="none"
            />

            {/* Y축 레이블 */}
            {[0, 0.5, 1].map((ratio, i) => {
              const y = paddingTop + graphHeight * (1 - ratio);
              const value = Math.round(maxSpeed * ratio);
              return (
                <SvgText
                  key={`y-label-${i}`}
                  x={paddingLeft - 8}
                  y={y + 4}
                  fontSize={10}
                  fill={colors.muted}
                  textAnchor="end"
                >
                  {value}
                </SvgText>
              );
            })}

            {/* X축 레이블 */}
            {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => {
              const x = paddingLeft + graphWidth * ratio;
              return (
                <SvgText
                  key={`x-label-${i}`}
                  x={x}
                  y={chartHeight - 8}
                  fontSize={10}
                  fill={colors.muted}
                  textAnchor="middle"
                >
                  {Math.round(ratio * 100)}%
                </SvgText>
              );
            })}

            {/* 단위 표시 */}
            <SvgText x={8} y={paddingTop - 4} fontSize={10} fill={colors.muted}>
              km/h
            </SvgText>
          </Svg>
        ) : (
          <View style={{ height: chartHeight }} className="items-center justify-center">
            <Text className="text-muted">속도 데이터가 부족합니다</Text>
          </View>
        )}
      </View>

      {/* 범례 */}
      <View className="flex-row justify-center mt-3 gap-6">
        <View className="flex-row items-center">
          <View style={{ width: 12, height: 3, backgroundColor: "#3B82F6", borderRadius: 1.5 }} />
          <Text className="text-xs text-muted ml-2">기준 기록</Text>
        </View>
        <View className="flex-row items-center">
          <View style={{ width: 12, height: 3, backgroundColor: "#22C55E", borderRadius: 1.5 }} />
          <Text className="text-xs text-muted ml-2">비교 기록</Text>
        </View>
      </View>
    </View>
  );
}
