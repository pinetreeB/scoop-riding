import React from "react";
import {
  View,
  Text,
  Modal,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useColors } from "@/hooks/use-colors";

export interface RideAnalysis {
  summary: string;
  efficiencyScore: "좋음" | "보통" | "개선필요" | string;
  ridingStyle: "안정적" | "보통" | "공격적" | string;
  batteryStatus: "좋음" | "보통" | "주의필요" | string | null;
  tips: string[];
  highlights: string[];
}

interface RideAnalysisModalProps {
  visible: boolean;
  onClose: () => void;
  analysis: RideAnalysis | null;
  isLoading: boolean;
  rideStats: {
    distance: number; // meters
    duration: number; // seconds
    avgSpeed: number; // km/h
    maxSpeed: number; // km/h
    voltageStart?: number;
    voltageEnd?: number;
    socStart?: number;
    socEnd?: number;
  };
}

const getScoreColor = (score: string, colors: any) => {
  switch (score) {
    case "좋음":
      return colors.success;
    case "보통":
      return colors.warning;
    case "개선필요":
    case "주의필요":
    case "공격적":
      return colors.error;
    case "안정적":
      return colors.success;
    default:
      return colors.muted;
  }
};

const getScoreIcon = (score: string): string => {
  switch (score) {
    case "좋음":
    case "안정적":
      return "sentiment-satisfied";
    case "보통":
      return "sentiment-neutral";
    case "개선필요":
    case "주의필요":
    case "공격적":
      return "sentiment-dissatisfied";
    default:
      return "help-outline";
  }
};

export function RideAnalysisModal({
  visible,
  onClose,
  analysis,
  isLoading,
  rideStats,
}: RideAnalysisModalProps) {
  const colors = useColors();

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}분 ${secs}초`;
  };

  const formatDistance = (meters: number) => {
    return (meters / 1000).toFixed(2);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        {/* Header */}
        <View
          className="flex-row items-center justify-between px-5 py-4 border-b"
          style={{ borderBottomColor: colors.border }}
        >
          <Text className="text-xl font-bold" style={{ color: colors.foreground }}>
            주행 분석 리포트
          </Text>
          <Pressable
            onPress={onClose}
            style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
            className="p-2"
          >
            <MaterialIcons name="close" size={24} color={colors.foreground} />
          </Pressable>
        </View>

        <ScrollView
          className="flex-1"
          contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Stats Summary */}
          <View
            className="rounded-2xl p-4 mb-4"
            style={{ backgroundColor: colors.surface }}
          >
            <View className="flex-row justify-between mb-3">
              <View className="items-center flex-1">
                <Text className="text-2xl font-bold" style={{ color: colors.primary }}>
                  {formatDistance(rideStats.distance)}
                </Text>
                <Text className="text-xs" style={{ color: colors.muted }}>
                  km
                </Text>
              </View>
              <View className="items-center flex-1">
                <Text className="text-2xl font-bold" style={{ color: colors.foreground }}>
                  {formatDuration(rideStats.duration)}
                </Text>
                <Text className="text-xs" style={{ color: colors.muted }}>
                  주행시간
                </Text>
              </View>
            </View>
            <View className="flex-row justify-between">
              <View className="items-center flex-1">
                <Text className="text-lg font-semibold" style={{ color: colors.foreground }}>
                  {rideStats.avgSpeed.toFixed(1)} km/h
                </Text>
                <Text className="text-xs" style={{ color: colors.muted }}>
                  평균속도
                </Text>
              </View>
              <View className="items-center flex-1">
                <Text className="text-lg font-semibold" style={{ color: colors.foreground }}>
                  {rideStats.maxSpeed.toFixed(1)} km/h
                </Text>
                <Text className="text-xs" style={{ color: colors.muted }}>
                  최고속도
                </Text>
              </View>
            </View>

            {/* Battery Info */}
            {rideStats.voltageStart && rideStats.voltageEnd && (
              <View
                className="mt-4 pt-4 border-t"
                style={{ borderTopColor: colors.border }}
              >
                <View className="flex-row items-center justify-center">
                  <MaterialIcons name="battery-charging-full" size={20} color={colors.success} />
                  <Text className="ml-2" style={{ color: colors.foreground }}>
                    {rideStats.voltageStart}V → {rideStats.voltageEnd}V
                  </Text>
                  {rideStats.socStart !== undefined && rideStats.socEnd !== undefined && (
                    <Text className="ml-2" style={{ color: colors.muted }}>
                      ({rideStats.socStart}% → {rideStats.socEnd}%)
                    </Text>
                  )}
                </View>
              </View>
            )}
          </View>

          {/* Loading State */}
          {isLoading && (
            <View className="items-center py-8">
              <ActivityIndicator size="large" color={colors.primary} />
              <Text className="mt-4" style={{ color: colors.muted }}>
                AI가 주행을 분석하고 있습니다...
              </Text>
            </View>
          )}

          {/* Analysis Results */}
          {!isLoading && analysis && (
            <>
              {/* Summary */}
              <View
                className="rounded-2xl p-4 mb-4"
                style={{ backgroundColor: colors.surface }}
              >
                <View className="flex-row items-center mb-2">
                  <MaterialIcons name="auto-awesome" size={20} color={colors.primary} />
                  <Text className="ml-2 font-bold" style={{ color: colors.foreground }}>
                    AI 분석 요약
                  </Text>
                </View>
                <Text style={{ color: colors.foreground, lineHeight: 22 }}>
                  {analysis.summary}
                </Text>
              </View>

              {/* Scores */}
              <View className="flex-row mb-4">
                {/* Efficiency Score */}
                <View
                  className="flex-1 rounded-xl p-3 mr-2"
                  style={{ backgroundColor: colors.surface }}
                >
                  <Text className="text-xs mb-1" style={{ color: colors.muted }}>
                    연비
                  </Text>
                  <View className="flex-row items-center">
                    <MaterialIcons
                      name={getScoreIcon(analysis.efficiencyScore) as any}
                      size={24}
                      color={getScoreColor(analysis.efficiencyScore, colors)}
                    />
                    <Text
                      className="ml-2 font-bold"
                      style={{ color: getScoreColor(analysis.efficiencyScore, colors) }}
                    >
                      {analysis.efficiencyScore}
                    </Text>
                  </View>
                </View>

                {/* Riding Style */}
                <View
                  className="flex-1 rounded-xl p-3 ml-2"
                  style={{ backgroundColor: colors.surface }}
                >
                  <Text className="text-xs mb-1" style={{ color: colors.muted }}>
                    주행 스타일
                  </Text>
                  <View className="flex-row items-center">
                    <MaterialIcons
                      name={getScoreIcon(analysis.ridingStyle) as any}
                      size={24}
                      color={getScoreColor(analysis.ridingStyle, colors)}
                    />
                    <Text
                      className="ml-2 font-bold"
                      style={{ color: getScoreColor(analysis.ridingStyle, colors) }}
                    >
                      {analysis.ridingStyle}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Battery Status */}
              {analysis.batteryStatus && (
                <View
                  className="rounded-xl p-3 mb-4"
                  style={{ backgroundColor: colors.surface }}
                >
                  <Text className="text-xs mb-1" style={{ color: colors.muted }}>
                    배터리 상태
                  </Text>
                  <View className="flex-row items-center">
                    <MaterialIcons
                      name="battery-std"
                      size={24}
                      color={getScoreColor(analysis.batteryStatus, colors)}
                    />
                    <Text
                      className="ml-2 font-bold"
                      style={{ color: getScoreColor(analysis.batteryStatus, colors) }}
                    >
                      {analysis.batteryStatus}
                    </Text>
                  </View>
                </View>
              )}

              {/* Highlights */}
              {analysis.highlights.length > 0 && (
                <View
                  className="rounded-xl p-4 mb-4"
                  style={{ backgroundColor: colors.surface }}
                >
                  <View className="flex-row items-center mb-3">
                    <MaterialIcons name="thumb-up" size={18} color={colors.success} />
                    <Text className="ml-2 font-bold" style={{ color: colors.foreground }}>
                      잘한 점
                    </Text>
                  </View>
                  {analysis.highlights.map((highlight, index) => (
                    <View key={index} className="flex-row items-start mb-2">
                      <MaterialIcons name="check-circle" size={16} color={colors.success} />
                      <Text className="ml-2 flex-1" style={{ color: colors.foreground }}>
                        {highlight}
                      </Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Tips */}
              {analysis.tips.length > 0 && (
                <View
                  className="rounded-xl p-4 mb-4"
                  style={{ backgroundColor: colors.surface }}
                >
                  <View className="flex-row items-center mb-3">
                    <MaterialIcons name="lightbulb" size={18} color={colors.warning} />
                    <Text className="ml-2 font-bold" style={{ color: colors.foreground }}>
                      개선 팁
                    </Text>
                  </View>
                  {analysis.tips.map((tip, index) => (
                    <View key={index} className="flex-row items-start mb-2">
                      <MaterialIcons name="arrow-right" size={16} color={colors.warning} />
                      <Text className="ml-2 flex-1" style={{ color: colors.foreground }}>
                        {tip}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </>
          )}

          {/* Error State */}
          {!isLoading && !analysis && (
            <View className="items-center py-8">
              <MaterialIcons name="error-outline" size={48} color={colors.muted} />
              <Text className="mt-4 text-center" style={{ color: colors.muted }}>
                분석 결과를 불러올 수 없습니다.
              </Text>
            </View>
          )}
        </ScrollView>

        {/* Close Button */}
        <View className="px-5 pb-8">
          <Pressable
            onPress={onClose}
            style={({ pressed }) => [
              {
                backgroundColor: colors.primary,
                opacity: pressed ? 0.8 : 1,
              },
            ]}
            className="py-4 rounded-xl items-center"
          >
            <Text className="text-white font-bold text-base">확인</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
