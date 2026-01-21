import { useState, useEffect, useCallback } from "react";
import {
  Text,
  View,
  ScrollView,
  Pressable,
  Alert,
  Platform,
  Switch,
} from "react-native";
import { useRouter } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Haptics from "expo-haptics";
import Slider from "@react-native-community/slider";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import {
  RidingGoals,
  GoalProgress,
  getGoals,
  saveGoals,
  calculateProgress,
  formatDistance,
  formatGoalDuration,
} from "@/lib/goals-store";

export default function GoalsScreen() {
  const router = useRouter();
  const colors = useColors();
  const [goals, setGoals] = useState<RidingGoals | null>(null);
  const [progress, setProgress] = useState<GoalProgress | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const loadData = useCallback(async () => {
    const [loadedGoals, loadedProgress] = await Promise.all([
      getGoals(),
      calculateProgress(),
    ]);
    setGoals(loadedGoals);
    setProgress(loadedProgress);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSave = async () => {
    if (!goals) return;

    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    setIsSaving(true);
    try {
      await saveGoals(goals);
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      Alert.alert("저장 완료", "목표가 저장되었습니다.");
    } catch (error) {
      Alert.alert("오류", "목표 저장에 실패했습니다.");
    } finally {
      setIsSaving(false);
    }
  };

  const updateGoal = (key: keyof RidingGoals, value: number | boolean) => {
    if (!goals) return;
    setGoals({ ...goals, [key]: value });
  };

  if (!goals || !progress) {
    return (
      <ScreenContainer className="p-4">
        <View className="flex-1 items-center justify-center">
          <Text className="text-muted">로딩 중...</Text>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]}>
      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View className="flex-row items-center px-4 py-3 border-b border-border">
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
            className="p-2 -ml-2"
          >
            <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
          </Pressable>
          <Text className="text-lg font-semibold text-foreground ml-2">목표 설정</Text>
        </View>

        {/* Enable Goals */}
        <View className="mx-4 mt-4 bg-surface rounded-2xl p-4">
          <View className="flex-row items-center justify-between">
            <View className="flex-1">
              <Text className="text-foreground font-semibold">목표 활성화</Text>
              <Text className="text-muted text-sm mt-1">
                홈 화면에 목표 달성률을 표시합니다
              </Text>
            </View>
            <Switch
              value={goals.enabled}
              onValueChange={(value) => updateGoal("enabled", value)}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor="#FFFFFF"
            />
          </View>
        </View>

        {/* Daily Goals */}
        <View className="mx-4 mt-4">
          <Text className="text-foreground font-semibold mb-3">일일 목표</Text>

          {/* Daily Distance */}
          <View className="bg-surface rounded-2xl p-4 mb-3">
            <View className="flex-row items-center justify-between mb-2">
              <View className="flex-row items-center">
                <MaterialIcons name="straighten" size={20} color={colors.primary} />
                <Text className="text-foreground font-medium ml-2">거리</Text>
              </View>
              <Text className="text-primary font-bold">
                {formatDistance(goals.dailyDistance)}
              </Text>
            </View>
            <Slider
              style={{ width: "100%", height: 40 }}
              minimumValue={1000}
              maximumValue={50000}
              step={1000}
              value={goals.dailyDistance}
              onValueChange={(value: number) => updateGoal("dailyDistance", value)}
              minimumTrackTintColor={colors.primary}
              maximumTrackTintColor={colors.border}
              thumbTintColor={colors.primary}
            />
            <View className="flex-row justify-between">
              <Text className="text-muted text-xs">1km</Text>
              <Text className="text-muted text-xs">50km</Text>
            </View>
            {/* Progress */}
            <View className="mt-3">
              <View className="flex-row items-center justify-between mb-1">
                <Text className="text-muted text-xs">오늘 진행률</Text>
                <Text className="text-primary text-xs font-medium">
                  {progress.daily.distance.percentage.toFixed(0)}%
                </Text>
              </View>
              <View className="h-2 bg-border rounded-full overflow-hidden">
                <View
                  className="h-full bg-primary rounded-full"
                  style={{ width: `${progress.daily.distance.percentage}%` }}
                />
              </View>
              <Text className="text-muted text-xs mt-1">
                {formatDistance(progress.daily.distance.current)} / {formatDistance(goals.dailyDistance)}
              </Text>
            </View>
          </View>

          {/* Daily Duration */}
          <View className="bg-surface rounded-2xl p-4">
            <View className="flex-row items-center justify-between mb-2">
              <View className="flex-row items-center">
                <MaterialIcons name="timer" size={20} color={colors.primary} />
                <Text className="text-foreground font-medium ml-2">시간</Text>
              </View>
              <Text className="text-primary font-bold">
                {formatGoalDuration(goals.dailyDuration)}
              </Text>
            </View>
            <Slider
              style={{ width: "100%", height: 40 }}
              minimumValue={600}
              maximumValue={7200}
              step={300}
              value={goals.dailyDuration}
              onValueChange={(value: number) => updateGoal("dailyDuration", value)}
              minimumTrackTintColor={colors.primary}
              maximumTrackTintColor={colors.border}
              thumbTintColor={colors.primary}
            />
            <View className="flex-row justify-between">
              <Text className="text-muted text-xs">10분</Text>
              <Text className="text-muted text-xs">2시간</Text>
            </View>
            {/* Progress */}
            <View className="mt-3">
              <View className="flex-row items-center justify-between mb-1">
                <Text className="text-muted text-xs">오늘 진행률</Text>
                <Text className="text-primary text-xs font-medium">
                  {progress.daily.duration.percentage.toFixed(0)}%
                </Text>
              </View>
              <View className="h-2 bg-border rounded-full overflow-hidden">
                <View
                  className="h-full bg-primary rounded-full"
                  style={{ width: `${progress.daily.duration.percentage}%` }}
                />
              </View>
              <Text className="text-muted text-xs mt-1">
                {formatGoalDuration(progress.daily.duration.current)} / {formatGoalDuration(goals.dailyDuration)}
              </Text>
            </View>
          </View>
        </View>

        {/* Weekly Goals */}
        <View className="mx-4 mt-6">
          <Text className="text-foreground font-semibold mb-3">주간 목표</Text>

          {/* Weekly Distance */}
          <View className="bg-surface rounded-2xl p-4 mb-3">
            <View className="flex-row items-center justify-between mb-2">
              <View className="flex-row items-center">
                <MaterialIcons name="map" size={20} color={colors.success} />
                <Text className="text-foreground font-medium ml-2">주간 거리</Text>
              </View>
              <Text style={{ color: colors.success }} className="font-bold">
                {formatDistance(goals.weeklyDistance)}
              </Text>
            </View>
            <Slider
              style={{ width: "100%", height: 40 }}
              minimumValue={5000}
              maximumValue={200000}
              step={5000}
              value={goals.weeklyDistance}
              onValueChange={(value: number) => updateGoal("weeklyDistance", value)}
              minimumTrackTintColor={colors.success}
              maximumTrackTintColor={colors.border}
              thumbTintColor={colors.success}
            />
            <View className="flex-row justify-between">
              <Text className="text-muted text-xs">5km</Text>
              <Text className="text-muted text-xs">200km</Text>
            </View>
            {/* Progress */}
            <View className="mt-3">
              <View className="flex-row items-center justify-between mb-1">
                <Text className="text-muted text-xs">이번 주 진행률</Text>
                <Text style={{ color: colors.success }} className="text-xs font-medium">
                  {progress.weekly.distance.percentage.toFixed(0)}%
                </Text>
              </View>
              <View className="h-2 bg-border rounded-full overflow-hidden">
                <View
                  className="h-full rounded-full"
                  style={{
                    width: `${progress.weekly.distance.percentage}%`,
                    backgroundColor: colors.success,
                  }}
                />
              </View>
              <Text className="text-muted text-xs mt-1">
                {formatDistance(progress.weekly.distance.current)} / {formatDistance(goals.weeklyDistance)}
              </Text>
            </View>
          </View>

          {/* Weekly Rides */}
          <View className="bg-surface rounded-2xl p-4">
            <View className="flex-row items-center justify-between mb-2">
              <View className="flex-row items-center">
                <MaterialIcons name="electric-scooter" size={20} color={colors.success} />
                <Text className="text-foreground font-medium ml-2">주간 라이딩 횟수</Text>
              </View>
              <Text style={{ color: colors.success }} className="font-bold">
                {goals.weeklyRides}회
              </Text>
            </View>
            <Slider
              style={{ width: "100%", height: 40 }}
              minimumValue={1}
              maximumValue={14}
              step={1}
              value={goals.weeklyRides}
              onValueChange={(value: number) => updateGoal("weeklyRides", value)}
              minimumTrackTintColor={colors.success}
              maximumTrackTintColor={colors.border}
              thumbTintColor={colors.success}
            />
            <View className="flex-row justify-between">
              <Text className="text-muted text-xs">1회</Text>
              <Text className="text-muted text-xs">14회</Text>
            </View>
            {/* Progress */}
            <View className="mt-3">
              <View className="flex-row items-center justify-between mb-1">
                <Text className="text-muted text-xs">이번 주 진행률</Text>
                <Text style={{ color: colors.success }} className="text-xs font-medium">
                  {progress.weekly.rides.percentage.toFixed(0)}%
                </Text>
              </View>
              <View className="h-2 bg-border rounded-full overflow-hidden">
                <View
                  className="h-full rounded-full"
                  style={{
                    width: `${progress.weekly.rides.percentage}%`,
                    backgroundColor: colors.success,
                  }}
                />
              </View>
              <Text className="text-muted text-xs mt-1">
                {progress.weekly.rides.current}회 / {goals.weeklyRides}회
              </Text>
            </View>
          </View>
        </View>

        {/* Save Button */}
        <View className="mx-4 mt-6 mb-6">
          <Pressable
            onPress={handleSave}
            disabled={isSaving}
            style={({ pressed }) => [
              {
                backgroundColor: colors.primary,
                opacity: pressed || isSaving ? 0.7 : 1,
              },
            ]}
            className="py-4 rounded-xl items-center"
          >
            <Text className="text-white font-semibold">
              {isSaving ? "저장 중..." : "목표 저장"}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
