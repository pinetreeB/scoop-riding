import React, { useState, useCallback } from "react";
import {
  Text,
  View,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Dimensions,
  RefreshControl,
} from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

// Simple bar chart component
function SimpleBarChart({
  data,
  maxValue,
  color,
  label,
}: {
  data: number[];
  maxValue: number;
  color: string;
  label: string;
}) {
  const colors = useColors();
  const barWidth = (SCREEN_WIDTH - 80) / Math.max(data.length, 1);

  return (
    <View className="mt-4">
      <Text className="text-sm mb-2" style={{ color: colors.muted }}>
        {label}
      </Text>
      <View className="flex-row items-end h-24" style={{ backgroundColor: colors.surface, borderRadius: 8, padding: 8 }}>
        {data.map((value, index) => {
          const height = maxValue > 0 ? (value / maxValue) * 80 : 0;
          return (
            <View
              key={index}
              className="items-center justify-end"
              style={{ width: barWidth - 4, marginHorizontal: 2 }}
            >
              <View
                style={{
                  width: barWidth - 8,
                  height: Math.max(height, 2),
                  backgroundColor: color,
                  borderRadius: 4,
                }}
              />
              <Text className="text-xs mt-1" style={{ color: colors.muted }}>
                {index + 1}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

// Circular progress component for battery health
function CircularProgress({
  percentage,
  size = 120,
  strokeWidth = 10,
  color,
}: {
  percentage: number;
  size?: number;
  strokeWidth?: number;
  color: string;
}) {
  const colors = useColors();
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: strokeWidth,
          borderColor: colors.border,
          position: "absolute",
        }}
      />
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: strokeWidth,
          borderColor: color,
          borderTopColor: "transparent",
          borderRightColor: percentage > 25 ? color : "transparent",
          borderBottomColor: percentage > 50 ? color : "transparent",
          borderLeftColor: percentage > 75 ? color : "transparent",
          position: "absolute",
          transform: [{ rotate: "-90deg" }],
        }}
      />
      <Text className="text-2xl font-bold" style={{ color: colors.foreground }}>
        {percentage}%
      </Text>
      <Text className="text-xs" style={{ color: colors.muted }}>
        건강도
      </Text>
    </View>
  );
}

export default function BatteryDashboardScreen() {
  const router = useRouter();
  const colors = useColors();
  const params = useLocalSearchParams<{ scooterId: string; scooterName: string }>();
  const scooterId = params.scooterId ? parseInt(params.scooterId) : null;
  const scooterName = params.scooterName ? decodeURIComponent(params.scooterName) : "기체";

  const [refreshing, setRefreshing] = useState(false);

  // Fetch battery summary
  const { data: summary, isLoading, refetch } = trpc.batteryAi.getSummary.useQuery(
    { scooterId: scooterId ?? 0 },
    { enabled: !!scooterId }
  );

  // Fetch recent rides with voltage data
  const { data: recentRides } = trpc.rides.list.useQuery();

  // Filter rides for this scooter with voltage data
  const scooterRides = recentRides?.filter(
    (r: any) => r.voltageStart && r.voltageEnd
  ).slice(0, 10) || [];

  // Calculate efficiency data for chart
  const efficiencyData = scooterRides.map((r: any) => {
    if (r.energyWh && r.distance > 0) {
      return r.energyWh / (r.distance / 1000);
    }
    return 0;
  }).reverse();

  const maxEfficiency = Math.max(...efficiencyData, 50);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch])
  );

  const getHealthColor = (health: number) => {
    if (health >= 80) return colors.success;
    if (health >= 60) return colors.warning;
    return colors.error;
  };

  if (!scooterId) {
    return (
      <ScreenContainer className="flex-1 items-center justify-center">
        <MaterialIcons name="error-outline" size={48} color={colors.muted} />
        <Text className="mt-4" style={{ color: colors.muted }}>
          기체 정보가 없습니다.
        </Text>
        <Pressable
          onPress={() => router.back()}
          className="mt-4 px-6 py-3 rounded-xl"
          style={{ backgroundColor: colors.primary }}
        >
          <Text className="text-white font-semibold">돌아가기</Text>
        </Pressable>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      {/* Header */}
      <View
        className="flex-row items-center px-4 py-3 border-b"
        style={{ borderBottomColor: colors.border }}
      >
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
          className="p-2 -ml-2"
        >
          <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
        </Pressable>
        <Text className="text-lg font-bold ml-2" style={{ color: colors.foreground }}>
          {scooterName} 배터리 분석
        </Text>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {isLoading ? (
          <View className="items-center py-12">
            <ActivityIndicator size="large" color={colors.primary} />
            <Text className="mt-4" style={{ color: colors.muted }}>
              분석 데이터를 불러오는 중...
            </Text>
          </View>
        ) : summary ? (
          <>
            {/* Battery Spec Card */}
            <View
              className="rounded-2xl p-4 mb-4"
              style={{ backgroundColor: colors.surface }}
            >
              <View className="flex-row items-center mb-3">
                <MaterialIcons name="battery-charging-full" size={24} color={colors.primary} />
                <Text className="ml-2 font-bold text-lg" style={{ color: colors.foreground }}>
                  배터리 사양
                </Text>
              </View>
              <View className="flex-row justify-between">
                <View className="items-center flex-1">
                  <Text className="text-xl font-bold" style={{ color: colors.primary }}>
                    {summary.batterySpec}
                  </Text>
                  <Text className="text-xs" style={{ color: colors.muted }}>
                    용량
                  </Text>
                </View>
                <View className="items-center flex-1">
                  <Text className="text-xl font-bold" style={{ color: colors.foreground }}>
                    {summary.totalCapacityWh.toFixed(0)} Wh
                  </Text>
                  <Text className="text-xs" style={{ color: colors.muted }}>
                    총 에너지
                  </Text>
                </View>
              </View>
            </View>

            {/* Battery Health Card */}
            <View
              className="rounded-2xl p-4 mb-4"
              style={{ backgroundColor: colors.surface }}
            >
              <View className="flex-row items-center mb-4">
                <MaterialIcons name="favorite" size={20} color={colors.error} />
                <Text className="ml-2 font-bold" style={{ color: colors.foreground }}>
                  배터리 건강도
                </Text>
              </View>
              <View className="flex-row items-center justify-around">
                <CircularProgress
                  percentage={summary.batteryHealth}
                  color={getHealthColor(summary.batteryHealth)}
                />
                <View className="ml-4">
                  <View className="mb-2">
                    <Text className="text-xs" style={{ color: colors.muted }}>
                      추정 사이클
                    </Text>
                    <Text className="text-lg font-semibold" style={{ color: colors.foreground }}>
                      {summary.estimatedCycles}회
                    </Text>
                  </View>
                  <View>
                    <Text className="text-xs" style={{ color: colors.muted }}>
                      전압 기록 주행
                    </Text>
                    <Text className="text-lg font-semibold" style={{ color: colors.foreground }}>
                      {summary.totalRidesWithVoltage}회
                    </Text>
                  </View>
                </View>
              </View>
            </View>

            {/* Efficiency Stats Card */}
            <View
              className="rounded-2xl p-4 mb-4"
              style={{ backgroundColor: colors.surface }}
            >
              <View className="flex-row items-center mb-3">
                <MaterialIcons name="speed" size={20} color={colors.warning} />
                <Text className="ml-2 font-bold" style={{ color: colors.foreground }}>
                  연비 통계
                </Text>
              </View>
              <View className="flex-row justify-between">
                <View className="items-center flex-1">
                  <Text
                    className="text-xl font-bold"
                    style={{ color: summary.avgEfficiencyWhKm ? colors.foreground : colors.muted }}
                  >
                    {summary.avgEfficiencyWhKm ? summary.avgEfficiencyWhKm.toFixed(1) : "-"}
                  </Text>
                  <Text className="text-xs" style={{ color: colors.muted }}>
                    평균 (Wh/km)
                  </Text>
                </View>
                <View className="items-center flex-1">
                  <Text
                    className="text-xl font-bold"
                    style={{ color: summary.bestEfficiencyWhKm ? colors.success : colors.muted }}
                  >
                    {summary.bestEfficiencyWhKm ? summary.bestEfficiencyWhKm.toFixed(1) : "-"}
                  </Text>
                  <Text className="text-xs" style={{ color: colors.muted }}>
                    최고 (Wh/km)
                  </Text>
                </View>
                <View className="items-center flex-1">
                  <Text
                    className="text-xl font-bold"
                    style={{ color: summary.worstEfficiencyWhKm ? colors.error : colors.muted }}
                  >
                    {summary.worstEfficiencyWhKm ? summary.worstEfficiencyWhKm.toFixed(1) : "-"}
                  </Text>
                  <Text className="text-xs" style={{ color: colors.muted }}>
                    최저 (Wh/km)
                  </Text>
                </View>
              </View>

              {/* Estimated Range */}
              {summary.estimatedRangeKm && (
                <View className="mt-4 pt-4 border-t" style={{ borderTopColor: colors.border }}>
                  <View className="flex-row items-center justify-center">
                    <MaterialIcons name="explore" size={20} color={colors.primary} />
                    <Text className="ml-2" style={{ color: colors.foreground }}>
                      예상 주행 가능 거리:
                    </Text>
                    <Text className="ml-2 font-bold text-lg" style={{ color: colors.primary }}>
                      {summary.estimatedRangeKm.toFixed(0)} km
                    </Text>
                  </View>
                </View>
              )}
            </View>

            {/* Efficiency Chart */}
            {efficiencyData.length > 0 && (
              <View
                className="rounded-2xl p-4 mb-4"
                style={{ backgroundColor: colors.surface }}
              >
                <View className="flex-row items-center mb-2">
                  <MaterialIcons name="show-chart" size={20} color={colors.primary} />
                  <Text className="ml-2 font-bold" style={{ color: colors.foreground }}>
                    최근 연비 추이
                  </Text>
                </View>
                <SimpleBarChart
                  data={efficiencyData}
                  maxValue={maxEfficiency}
                  color={colors.primary}
                  label="최근 주행별 연비 (Wh/km)"
                />
              </View>
            )}

            {/* AI Chat Button */}
            <Pressable
              onPress={() => router.push(`/battery-ai?scooterId=${scooterId}&scooterName=${encodeURIComponent(scooterName)}`)}
              style={({ pressed }) => [
                {
                  backgroundColor: colors.primary,
                  opacity: pressed ? 0.8 : 1,
                },
              ]}
              className="rounded-xl py-4 flex-row items-center justify-center"
            >
              <MaterialIcons name="chat" size={20} color="white" />
              <Text className="text-white font-bold ml-2">AI에게 배터리 상담하기</Text>
            </Pressable>
          </>
        ) : (
          <View className="items-center py-12">
            <MaterialIcons name="battery-unknown" size={48} color={colors.muted} />
            <Text className="mt-4 text-center" style={{ color: colors.muted }}>
              배터리 분석 데이터가 없습니다.{"\n"}
              주행 시 전압을 기록하면 분석이 시작됩니다.
            </Text>
          </View>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}
