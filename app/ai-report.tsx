import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Platform,
  Alert,
  RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Haptics from "expo-haptics";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useAuth } from "@/hooks/use-auth";
import { useTranslation } from "@/hooks/use-translation";
import { trpc } from "@/lib/trpc";
import { getRidingRecords, type RidingRecord } from "@/lib/riding-store";
import { AiReportSkeleton } from "@/components/skeleton";

type ReportPeriod = "weekly" | "monthly";

interface AiReport {
  period: ReportPeriod;
  generatedAt: string;
  summary: string;
  totalDistance: number;
  totalDuration: number;
  totalRides: number;
  avgSpeed: number;
  maxSpeed: number;
  distanceChange: string;
  ridesChange: string;
  overallGrade: string;
  safetyAnalysis: string;
  efficiencyAnalysis: string;
  consistencyAnalysis: string;
  topAchievement: string;
  improvementArea: string;
  weeklyGoal: string;
  motivationalMessage: string;
}

export default function AiReportScreen() {
  const router = useRouter();
  const colors = useColors();
  const { isAuthenticated } = useAuth();
  const { t } = useTranslation();

  const [selectedPeriod, setSelectedPeriod] = useState<ReportPeriod>("weekly");
  const [report, setReport] = useState<AiReport | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [rideStats, setRideStats] = useState<{
    totalDistance: number;
    totalDuration: number;
    totalRides: number;
    avgSpeed: number;
    maxSpeed: number;
    rides: RidingRecord[];
  } | null>(null);

  const generateReportMutation = trpc.rides.generateAiReport.useMutation();

  const loadRideStats = useCallback(async (period: ReportPeriod) => {
    const records = await getRidingRecords();
    const now = new Date();
    let startDate: Date;

    if (period === "weekly") {
      const day = now.getDay();
      const diff = now.getDate() - day + (day === 0 ? -6 : 1);
      startDate = new Date(now);
      startDate.setDate(diff);
      startDate.setHours(0, 0, 0, 0);
    } else {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    const filteredRecords = records.filter(
      (r) => new Date(r.startTime) >= startDate
    );

    const totalDistance = filteredRecords.reduce((sum, r) => sum + r.distance, 0);
    const totalDuration = filteredRecords.reduce((sum, r) => sum + r.duration, 0);
    const avgSpeed = filteredRecords.length > 0
      ? filteredRecords.reduce((sum, r) => sum + r.avgSpeed, 0) / filteredRecords.length
      : 0;
    const maxSpeed = filteredRecords.length > 0
      ? Math.max(...filteredRecords.map((r) => r.maxSpeed))
      : 0;

    setRideStats({
      totalDistance,
      totalDuration,
      totalRides: filteredRecords.length,
      avgSpeed,
      maxSpeed,
      rides: filteredRecords,
    });

    return {
      totalDistance,
      totalDuration,
      totalRides: filteredRecords.length,
      avgSpeed,
      maxSpeed,
      rides: filteredRecords,
    };
  }, []);

  useEffect(() => {
    loadRideStats(selectedPeriod);
  }, [selectedPeriod, loadRideStats]);

  const handleGenerateReport = async () => {
    if (!isAuthenticated) {
      Alert.alert(t('common.notice'), t('aiReport.loginRequired'));
      return;
    }

    const stats = await loadRideStats(selectedPeriod);
    
    if (stats.totalRides === 0) {
      Alert.alert(t('common.notice'), t('aiReport.noRides'));
      return;
    }

    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    setIsLoading(true);
    try {
      const result = await generateReportMutation.mutateAsync({
        period: selectedPeriod,
        totalDistance: stats.totalDistance,
        totalDuration: stats.totalDuration,
        totalRides: stats.totalRides,
        avgSpeed: stats.avgSpeed,
        maxSpeed: stats.maxSpeed,
        ridesData: stats.rides.slice(0, 20).map((r) => ({
          distance: r.distance,
          duration: r.duration,
          avgSpeed: r.avgSpeed,
          maxSpeed: r.maxSpeed,
          date: r.startTime,
        })),
      });

      if (result.success && result.report) {
        setReport({
          period: selectedPeriod,
          generatedAt: new Date().toISOString(),
          ...result.report,
          totalDistance: stats.totalDistance,
          totalDuration: stats.totalDuration,
          totalRides: stats.totalRides,
          avgSpeed: stats.avgSpeed,
          maxSpeed: stats.maxSpeed,
        });

        if (Platform.OS !== "web") {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
      } else {
        Alert.alert(t('common.error'), result.error || t('aiReport.generateError'));
      }
    } catch (error: any) {
      console.error("[AiReport] Generate error:", error);
      Alert.alert(t('common.error'), t('aiReport.generateError'));
    } finally {
      setIsLoading(false);
    }
  };

  const formatDistance = (meters: number) => {
    return (meters / 1000).toFixed(1);
  };

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}${t('units.hour')} ${mins}${t('units.min')}`;
    }
    return `${mins}${t('units.min')}`;
  };

  const getGradeColor = (grade: string) => {
    if (grade.includes("A") || grade.includes("S")) return colors.success;
    if (grade.includes("B")) return "#3B82F6";
    if (grade.includes("C")) return colors.warning;
    return colors.error;
  };

  const onRefresh = async () => {
    setIsRefreshing(true);
    await loadRideStats(selectedPeriod);
    setIsRefreshing(false);
  };

  return (
    <ScreenContainer edges={["top", "left", "right"]}>
      {/* Header */}
      <View className="flex-row items-center px-5 py-3 border-b border-border">
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
          className="p-2 -ml-2"
        >
          <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
        </Pressable>
        <Text className="text-xl font-bold text-foreground ml-2">
          {t('aiReport.title')}
        </Text>
        <View className="flex-1" />
        <View className="flex-row items-center">
          <MaterialIcons name="auto-awesome" size={20} color={colors.primary} />
          <Text className="text-xs text-primary ml-1">AI</Text>
        </View>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />
        }
      >
        {/* Period Selector */}
        <View className="flex-row mx-5 mt-4 mb-4 bg-surface rounded-xl p-1">
          <Pressable
            onPress={() => {
              setSelectedPeriod("weekly");
              setReport(null);
              if (Platform.OS !== "web") {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }
            }}
            style={({ pressed }) => [{ opacity: pressed ? 0.8 : 1, flex: 1 }]}
          >
            <View
              className="py-3 rounded-lg items-center"
              style={selectedPeriod === "weekly" ? { backgroundColor: colors.primary } : {}}
            >
              <Text
                className="font-semibold"
                style={{ color: selectedPeriod === "weekly" ? "#FFFFFF" : colors.muted }}
              >
                {t('aiReport.weekly')}
              </Text>
            </View>
          </Pressable>
          <Pressable
            onPress={() => {
              setSelectedPeriod("monthly");
              setReport(null);
              if (Platform.OS !== "web") {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }
            }}
            style={({ pressed }) => [{ opacity: pressed ? 0.8 : 1, flex: 1 }]}
          >
            <View
              className="py-3 rounded-lg items-center"
              style={selectedPeriod === "monthly" ? { backgroundColor: colors.primary } : {}}
            >
              <Text
                className="font-semibold"
                style={{ color: selectedPeriod === "monthly" ? "#FFFFFF" : colors.muted }}
              >
                {t('aiReport.monthly')}
              </Text>
            </View>
          </Pressable>
        </View>

        {/* Current Stats Summary */}
        {rideStats && (
          <View className="mx-5 mb-4 bg-surface rounded-2xl p-4 border border-border">
            <Text className="text-sm font-semibold text-muted mb-3">
              {selectedPeriod === "weekly" ? t('aiReport.thisWeek') : t('aiReport.thisMonth')}
            </Text>
            <View className="flex-row justify-between">
              <View className="items-center flex-1">
                <Text className="text-2xl font-bold text-primary">
                  {formatDistance(rideStats.totalDistance)}
                </Text>
                <Text className="text-xs text-muted">km</Text>
              </View>
              <View className="items-center flex-1">
                <Text className="text-2xl font-bold text-foreground">
                  {rideStats.totalRides}
                </Text>
                <Text className="text-xs text-muted">{t('aiReport.rides')}</Text>
              </View>
              <View className="items-center flex-1">
                <Text className="text-2xl font-bold text-foreground">
                  {formatDuration(rideStats.totalDuration)}
                </Text>
                <Text className="text-xs text-muted">{t('aiReport.rideTime')}</Text>
              </View>
            </View>
          </View>
        )}

        {/* Generate Button */}
        {!report && !isLoading && (
          <View className="mx-5 mb-4">
            <Pressable
              onPress={handleGenerateReport}
              disabled={isLoading || (rideStats?.totalRides ?? 0) === 0}
              style={({ pressed }) => [
                {
                  backgroundColor: (rideStats?.totalRides ?? 0) === 0 ? colors.muted : colors.primary,
                  opacity: pressed ? 0.9 : 1,
                  transform: [{ scale: pressed ? 0.98 : 1 }],
                },
              ]}
              className="py-4 rounded-xl items-center flex-row justify-center"
            >
              <MaterialIcons name="auto-awesome" size={24} color="#FFFFFF" />
              <Text className="text-white font-bold text-base ml-2">
                {t('aiReport.generateReport')}
              </Text>
            </Pressable>
            {(rideStats?.totalRides ?? 0) === 0 && (
              <Text className="text-center text-muted text-xs mt-2">
                {t('aiReport.noRidesHint')}
              </Text>
            )}
          </View>
        )}

        {/* Loading State */}
        {isLoading && (
          <View className="mx-5">
            <AiReportSkeleton />
          </View>
        )}

        {/* Report Content */}
        {report && !isLoading && (
          <View className="mx-5">
            {/* Overall Grade */}
            <View className="bg-surface rounded-2xl p-5 mb-4 border border-border items-center">
              <Text className="text-sm text-muted mb-2">{t('aiReport.overallGrade')}</Text>
              <View
                className="w-20 h-20 rounded-full items-center justify-center mb-3"
                style={{ backgroundColor: `${getGradeColor(report.overallGrade)}20` }}
              >
                <Text
                  className="text-3xl font-bold"
                  style={{ color: getGradeColor(report.overallGrade) }}
                >
                  {report.overallGrade}
                </Text>
              </View>
              <Text className="text-foreground text-center leading-6">
                {report.summary}
              </Text>
            </View>

            {/* Changes */}
            <View className="flex-row mb-4" style={{ gap: 8 }}>
              <View className="flex-1 bg-surface rounded-xl p-4 border border-border">
                <View className="flex-row items-center mb-1">
                  <MaterialIcons name="trending-up" size={16} color={colors.primary} />
                  <Text className="text-xs text-muted ml-1">{t('aiReport.distanceChange')}</Text>
                </View>
                <Text className="text-base font-bold text-foreground">
                  {report.distanceChange}
                </Text>
              </View>
              <View className="flex-1 bg-surface rounded-xl p-4 border border-border">
                <View className="flex-row items-center mb-1">
                  <MaterialIcons name="repeat" size={16} color={colors.primary} />
                  <Text className="text-xs text-muted ml-1">{t('aiReport.ridesChange')}</Text>
                </View>
                <Text className="text-base font-bold text-foreground">
                  {report.ridesChange}
                </Text>
              </View>
            </View>

            {/* Analysis Cards */}
            {/* Safety */}
            <View className="bg-surface rounded-2xl p-4 mb-3 border border-border">
              <View className="flex-row items-center mb-2">
                <MaterialIcons name="shield" size={20} color={colors.success} />
                <Text className="ml-2 font-bold text-foreground">{t('aiReport.safetyAnalysis')}</Text>
              </View>
              <Text className="text-foreground leading-6">{report.safetyAnalysis}</Text>
            </View>

            {/* Efficiency */}
            <View className="bg-surface rounded-2xl p-4 mb-3 border border-border">
              <View className="flex-row items-center mb-2">
                <MaterialIcons name="eco" size={20} color="#22C55E" />
                <Text className="ml-2 font-bold text-foreground">{t('aiReport.efficiencyAnalysis')}</Text>
              </View>
              <Text className="text-foreground leading-6">{report.efficiencyAnalysis}</Text>
            </View>

            {/* Consistency */}
            <View className="bg-surface rounded-2xl p-4 mb-3 border border-border">
              <View className="flex-row items-center mb-2">
                <MaterialIcons name="timeline" size={20} color="#6366F1" />
                <Text className="ml-2 font-bold text-foreground">{t('aiReport.consistencyAnalysis')}</Text>
              </View>
              <Text className="text-foreground leading-6">{report.consistencyAnalysis}</Text>
            </View>

            {/* Top Achievement */}
            <View
              className="rounded-2xl p-4 mb-3"
              style={{ backgroundColor: `${colors.success}10` }}
            >
              <View className="flex-row items-center mb-2">
                <MaterialIcons name="emoji-events" size={20} color="#FFD700" />
                <Text className="ml-2 font-bold text-foreground">{t('aiReport.topAchievement')}</Text>
              </View>
              <Text className="text-foreground leading-6">{report.topAchievement}</Text>
            </View>

            {/* Improvement Area */}
            <View
              className="rounded-2xl p-4 mb-3"
              style={{ backgroundColor: `${colors.warning}10` }}
            >
              <View className="flex-row items-center mb-2">
                <MaterialIcons name="lightbulb" size={20} color={colors.warning} />
                <Text className="ml-2 font-bold text-foreground">{t('aiReport.improvementArea')}</Text>
              </View>
              <Text className="text-foreground leading-6">{report.improvementArea}</Text>
            </View>

            {/* Weekly Goal */}
            <View
              className="rounded-2xl p-4 mb-3"
              style={{ backgroundColor: `${colors.primary}10` }}
            >
              <View className="flex-row items-center mb-2">
                <MaterialIcons name="flag" size={20} color={colors.primary} />
                <Text className="ml-2 font-bold" style={{ color: colors.primary }}>
                  {t('aiReport.suggestedGoal')}
                </Text>
              </View>
              <Text className="text-foreground leading-6">{report.weeklyGoal}</Text>
            </View>

            {/* Motivational Message */}
            <View
              className="rounded-2xl p-5 mb-4 items-center"
              style={{ backgroundColor: `${colors.primary}08` }}
            >
              <MaterialIcons name="psychology" size={32} color={colors.primary} />
              <Text className="text-foreground text-center leading-6 mt-3 text-base">
                {report.motivationalMessage}
              </Text>
            </View>

            {/* Regenerate Button */}
            <Pressable
              onPress={() => {
                setReport(null);
                handleGenerateReport();
              }}
              style={({ pressed }) => [
                {
                  opacity: pressed ? 0.8 : 1,
                  borderColor: colors.primary,
                  borderWidth: 1,
                },
              ]}
              className="py-3 rounded-xl items-center flex-row justify-center mb-4"
            >
              <MaterialIcons name="refresh" size={20} color={colors.primary} />
              <Text className="font-semibold ml-2" style={{ color: colors.primary }}>
                {t('aiReport.regenerate')}
              </Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}
