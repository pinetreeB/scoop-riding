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
import { useTranslation } from "@/hooks/use-translation";
import { AiCoachingSkeleton } from "./skeleton";

export interface RideAnalysis {
  summary: string;
  efficiencyScore: "좋음" | "보통" | "개선필요" | string;
  ridingStyle: "안정적" | "보통" | "공격적" | string;
  batteryStatus: "좋음" | "보통" | "주의필요" | string | null;
  tips: string[];
  highlights: string[];
  // AI Coaching fields (new)
  coachingMessage?: string;
  safetyScore?: number; // 0-100
  efficiencyTip?: string;
  comparisonWithAvg?: string;
  nextGoalSuggestion?: string;
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
  // Support both Korean and English score values
  const lowerScore = score.toLowerCase();
  switch (score) {
    case "좋음":
    case "안정적":
      return colors.success;
    case "보통":
      return colors.warning;
    case "개선필요":
    case "주의필요":
    case "공격적":
      return colors.error;
    default:
      // English fallback
      if (lowerScore === "good" || lowerScore === "stable" || lowerScore === "excellent") return colors.success;
      if (lowerScore === "average" || lowerScore === "normal" || lowerScore === "moderate") return colors.warning;
      if (lowerScore === "needs improvement" || lowerScore === "caution" || lowerScore === "aggressive") return colors.error;
      return colors.muted;
  }
};

const getScoreIcon = (score: string): string => {
  const lowerScore = score.toLowerCase();
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
      if (lowerScore === "good" || lowerScore === "stable" || lowerScore === "excellent") return "sentiment-satisfied";
      if (lowerScore === "average" || lowerScore === "normal" || lowerScore === "moderate") return "sentiment-neutral";
      if (lowerScore === "needs improvement" || lowerScore === "caution" || lowerScore === "aggressive") return "sentiment-dissatisfied";
      return "help-outline";
  }
};

const getSafetyScoreColor = (score: number, colors: any) => {
  if (score >= 80) return colors.success;
  if (score >= 50) return colors.warning;
  return colors.error;
};

export function RideAnalysisModal({
  visible,
  onClose,
  analysis,
  isLoading,
  rideStats,
}: RideAnalysisModalProps) {
  const colors = useColors();
  const { t } = useTranslation();

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}${t('units.min')} ${secs}${t('units.sec')}`;
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
            {t('analysis.title')}
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
                  {t('analysis.rideTime')}
                </Text>
              </View>
            </View>
            <View className="flex-row justify-between">
              <View className="items-center flex-1">
                <Text className="text-lg font-semibold" style={{ color: colors.foreground }}>
                  {rideStats.avgSpeed.toFixed(1)} km/h
                </Text>
                <Text className="text-xs" style={{ color: colors.muted }}>
                  {t('analysis.avgSpeed')}
                </Text>
              </View>
              <View className="items-center flex-1">
                <Text className="text-lg font-semibold" style={{ color: colors.foreground }}>
                  {rideStats.maxSpeed.toFixed(1)} km/h
                </Text>
                <Text className="text-xs" style={{ color: colors.muted }}>
                  {t('analysis.maxSpeed')}
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

          {/* Loading State - Skeleton */}
          {isLoading && <AiCoachingSkeleton />}

          {/* Analysis Results */}
          {!isLoading && analysis && (
            <>
              {/* AI Coaching Message */}
              {analysis.coachingMessage && (
                <View
                  className="rounded-2xl p-4 mb-4"
                  style={{ backgroundColor: `${colors.primary}10` }}
                >
                  <View className="flex-row items-center mb-2">
                    <View
                      className="w-8 h-8 rounded-full items-center justify-center"
                      style={{ backgroundColor: colors.primary }}
                    >
                      <MaterialIcons name="psychology" size={20} color="#FFFFFF" />
                    </View>
                    <Text className="ml-2 font-bold text-base" style={{ color: colors.primary }}>
                      {t('analysis.aiCoaching')}
                    </Text>
                  </View>
                  <Text style={{ color: colors.foreground, lineHeight: 22, fontSize: 15 }}>
                    {analysis.coachingMessage}
                  </Text>
                </View>
              )}

              {/* Summary */}
              <View
                className="rounded-2xl p-4 mb-4"
                style={{ backgroundColor: colors.surface }}
              >
                <View className="flex-row items-center mb-2">
                  <MaterialIcons name="auto-awesome" size={20} color={colors.primary} />
                  <Text className="ml-2 font-bold" style={{ color: colors.foreground }}>
                    {t('analysis.aiSummary')}
                  </Text>
                </View>
                <Text style={{ color: colors.foreground, lineHeight: 22 }}>
                  {analysis.summary}
                </Text>
              </View>

              {/* Safety Score */}
              {analysis.safetyScore !== undefined && (
                <View
                  className="rounded-2xl p-4 mb-4"
                  style={{ backgroundColor: colors.surface }}
                >
                  <View className="flex-row items-center mb-3">
                    <MaterialIcons name="shield" size={20} color={getSafetyScoreColor(analysis.safetyScore, colors)} />
                    <Text className="ml-2 font-bold" style={{ color: colors.foreground }}>
                      {t('analysis.safetyScore')}
                    </Text>
                  </View>
                  <View className="items-center mb-2">
                    <Text
                      className="text-4xl font-bold"
                      style={{ color: getSafetyScoreColor(analysis.safetyScore, colors) }}
                    >
                      {analysis.safetyScore}
                    </Text>
                    <Text className="text-sm" style={{ color: colors.muted }}>/ 100</Text>
                  </View>
                  {/* Progress bar */}
                  <View className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: colors.border }}>
                    <View
                      className="h-full rounded-full"
                      style={{
                        width: `${analysis.safetyScore}%`,
                        backgroundColor: getSafetyScoreColor(analysis.safetyScore, colors),
                      }}
                    />
                  </View>
                </View>
              )}

              {/* Scores */}
              <View className="flex-row mb-4" style={{ gap: 8 }}>
                {/* Efficiency Score */}
                <View
                  className="flex-1 rounded-xl p-3"
                  style={{ backgroundColor: colors.surface }}
                >
                  <Text className="text-xs mb-1" style={{ color: colors.muted }}>
                    {t('analysis.efficiency')}
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
                  className="flex-1 rounded-xl p-3"
                  style={{ backgroundColor: colors.surface }}
                >
                  <Text className="text-xs mb-1" style={{ color: colors.muted }}>
                    {t('analysis.ridingStyle')}
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
                    {t('analysis.batteryStatus')}
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

              {/* Comparison with Average */}
              {analysis.comparisonWithAvg && (
                <View
                  className="rounded-2xl p-4 mb-4"
                  style={{ backgroundColor: colors.surface }}
                >
                  <View className="flex-row items-center mb-2">
                    <MaterialIcons name="compare-arrows" size={20} color={colors.primary} />
                    <Text className="ml-2 font-bold" style={{ color: colors.foreground }}>
                      {t('analysis.comparisonTitle')}
                    </Text>
                  </View>
                  <Text style={{ color: colors.foreground, lineHeight: 22 }}>
                    {analysis.comparisonWithAvg}
                  </Text>
                </View>
              )}

              {/* Efficiency Tip */}
              {analysis.efficiencyTip && (
                <View
                  className="rounded-2xl p-4 mb-4"
                  style={{ backgroundColor: `${colors.success}10` }}
                >
                  <View className="flex-row items-center mb-2">
                    <MaterialIcons name="eco" size={20} color={colors.success} />
                    <Text className="ml-2 font-bold" style={{ color: colors.success }}>
                      {t('analysis.efficiencyTip')}
                    </Text>
                  </View>
                  <Text style={{ color: colors.foreground, lineHeight: 22 }}>
                    {analysis.efficiencyTip}
                  </Text>
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
                      {t('analysis.highlights')}
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
                      {t('analysis.tips')}
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

              {/* Next Goal Suggestion */}
              {analysis.nextGoalSuggestion && (
                <View
                  className="rounded-2xl p-4 mb-4"
                  style={{ backgroundColor: `${colors.primary}10` }}
                >
                  <View className="flex-row items-center mb-2">
                    <MaterialIcons name="flag" size={20} color={colors.primary} />
                    <Text className="ml-2 font-bold" style={{ color: colors.primary }}>
                      {t('analysis.nextGoal')}
                    </Text>
                  </View>
                  <Text style={{ color: colors.foreground, lineHeight: 22 }}>
                    {analysis.nextGoalSuggestion}
                  </Text>
                </View>
              )}
            </>
          )}

          {/* Error State */}
          {!isLoading && !analysis && (
            <View className="items-center py-8">
              <MaterialIcons name="error-outline" size={48} color={colors.muted} />
              <Text className="mt-4 text-center" style={{ color: colors.muted }}>
                {t('analysis.errorMessage')}
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
            <Text className="text-white font-bold text-base">{t('common.confirm')}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
