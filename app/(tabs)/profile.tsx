import { useCallback, useState } from "react";
import {
  Text,
  View,
  ScrollView,
  Pressable,
  Alert,
  Platform,
  Image,
} from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Haptics from "expo-haptics";
import { useFocusEffect } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import {
  getRidingRecords,
  clearAllRecords,
  formatDuration,
  type RidingRecord,
} from "@/lib/riding-store";

export default function ProfileScreen() {
  const colors = useColors();
  const [stats, setStats] = useState({
    totalDistance: 0,
    totalDuration: 0,
    totalRides: 0,
    avgSpeed: 0,
    maxSpeed: 0,
    level: 1,
    levelProgress: 0,
  });

  const calculateLevel = (totalDistanceKm: number) => {
    // Level up every 50km
    const level = Math.floor(totalDistanceKm / 50) + 1;
    const progress = (totalDistanceKm % 50) / 50;
    return { level, progress };
  };

  const loadStats = useCallback(async () => {
    const records = await getRidingRecords();
    
    const totalDistance = records.reduce((sum, r) => sum + r.distance, 0);
    const totalDuration = records.reduce((sum, r) => sum + r.duration, 0);
    const avgSpeed = records.length > 0
      ? records.reduce((sum, r) => sum + r.avgSpeed, 0) / records.length
      : 0;
    const maxSpeed = records.length > 0
      ? Math.max(...records.map((r) => r.maxSpeed))
      : 0;

    const { level, progress } = calculateLevel(totalDistance / 1000);

    setStats({
      totalDistance,
      totalDuration,
      totalRides: records.length,
      avgSpeed,
      maxSpeed,
      level,
      levelProgress: progress,
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadStats();
    }, [loadStats])
  );

  const handleClearData = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    Alert.alert(
      "데이터 초기화",
      "모든 주행 기록이 삭제됩니다. 계속하시겠습니까?",
      [
        { text: "취소", style: "cancel" },
        {
          text: "삭제",
          style: "destructive",
          onPress: async () => {
            await clearAllRecords();
            await loadStats();
            if (Platform.OS !== "web") {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            }
          },
        },
      ]
    );
  };

  const getLevelTitle = (level: number) => {
    if (level >= 100) return "레전드 라이더";
    if (level >= 50) return "마스터 라이더";
    if (level >= 20) return "프로 라이더";
    if (level >= 10) return "시니어 라이더";
    if (level >= 5) return "주니어 라이더";
    return "루키 라이더";
  };

  return (
    <ScreenContainer>
      <ScrollView 
        className="flex-1" 
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 100 }}
      >
        {/* Header */}
        <View className="px-5 pt-4 pb-6">
          <Text className="text-2xl font-bold text-foreground">내 정보</Text>
        </View>

        {/* Profile Card */}
        <View className="mx-5 mb-6 bg-surface rounded-2xl p-5 border border-border">
          <View className="flex-row items-center mb-4">
            <View 
              className="w-16 h-16 rounded-full items-center justify-center mr-4"
              style={{ backgroundColor: colors.primary }}
            >
              <MaterialIcons name="person" size={32} color="#FFFFFF" />
            </View>
            <View className="flex-1">
              <Text className="text-xl font-bold text-foreground">SCOOP 라이더</Text>
              <View className="flex-row items-center mt-1">
                <View 
                  className="px-2 py-1 rounded-full mr-2"
                  style={{ backgroundColor: colors.primary }}
                >
                  <Text className="text-white text-xs font-bold">Lv.{stats.level}</Text>
                </View>
                <Text className="text-muted text-sm">{getLevelTitle(stats.level)}</Text>
              </View>
            </View>
          </View>

          {/* Level Progress */}
          <View className="mb-2">
            <View className="flex-row justify-between mb-1">
              <Text className="text-muted text-xs">레벨 진행도</Text>
              <Text className="text-muted text-xs">{(stats.levelProgress * 100).toFixed(0)}%</Text>
            </View>
            <View className="h-2 bg-border rounded-full overflow-hidden">
              <View
                className="h-full rounded-full"
                style={{
                  backgroundColor: colors.primary,
                  width: `${stats.levelProgress * 100}%`,
                }}
              />
            </View>
            <Text className="text-muted text-xs mt-1">
              다음 레벨까지 {(50 - (stats.levelProgress * 50)).toFixed(1)}km
            </Text>
          </View>
        </View>

        {/* Stats Grid */}
        <View className="mx-5 mb-6">
          <Text className="text-lg font-bold text-foreground mb-3">누적 기록</Text>
          
          <View className="flex-row flex-wrap">
            {/* Total Distance */}
            <View className="w-1/2 pr-2 mb-3">
              <View className="bg-surface rounded-xl p-4 border border-border">
                <View className="flex-row items-center mb-2">
                  <MaterialIcons name="straighten" size={20} color={colors.primary} />
                  <Text className="text-muted text-xs ml-2">총 거리</Text>
                </View>
                <Text className="text-2xl font-bold text-foreground">
                  {(stats.totalDistance / 1000).toFixed(1)}
                </Text>
                <Text className="text-muted text-xs">km</Text>
              </View>
            </View>

            {/* Total Duration */}
            <View className="w-1/2 pl-2 mb-3">
              <View className="bg-surface rounded-xl p-4 border border-border">
                <View className="flex-row items-center mb-2">
                  <MaterialIcons name="schedule" size={20} color={colors.primary} />
                  <Text className="text-muted text-xs ml-2">총 시간</Text>
                </View>
                <Text className="text-2xl font-bold text-foreground">
                  {formatDuration(stats.totalDuration)}
                </Text>
                <Text className="text-muted text-xs">시간</Text>
              </View>
            </View>

            {/* Total Rides */}
            <View className="w-1/2 pr-2 mb-3">
              <View className="bg-surface rounded-xl p-4 border border-border">
                <View className="flex-row items-center mb-2">
                  <MaterialIcons name="electric-scooter" size={20} color={colors.primary} />
                  <Text className="text-muted text-xs ml-2">주행 횟수</Text>
                </View>
                <Text className="text-2xl font-bold text-foreground">
                  {stats.totalRides}
                </Text>
                <Text className="text-muted text-xs">회</Text>
              </View>
            </View>

            {/* Average Speed */}
            <View className="w-1/2 pl-2 mb-3">
              <View className="bg-surface rounded-xl p-4 border border-border">
                <View className="flex-row items-center mb-2">
                  <MaterialIcons name="speed" size={20} color={colors.primary} />
                  <Text className="text-muted text-xs ml-2">평균 속도</Text>
                </View>
                <Text className="text-2xl font-bold text-foreground">
                  {stats.avgSpeed.toFixed(1)}
                </Text>
                <Text className="text-muted text-xs">km/h</Text>
              </View>
            </View>

            {/* Max Speed */}
            <View className="w-full mb-3">
              <View className="bg-surface rounded-xl p-4 border border-border flex-row items-center">
                <View className="flex-1">
                  <View className="flex-row items-center mb-2">
                    <MaterialIcons name="bolt" size={20} color={colors.warning} />
                    <Text className="text-muted text-xs ml-2">최고 속도</Text>
                  </View>
                  <Text className="text-3xl font-bold text-foreground">
                    {stats.maxSpeed.toFixed(1)} <Text className="text-lg text-muted">km/h</Text>
                  </Text>
                </View>
                <MaterialIcons name="emoji-events" size={40} color={colors.warning} />
              </View>
            </View>
          </View>
        </View>

        {/* Settings */}
        <View className="mx-5 mb-6">
          <Text className="text-lg font-bold text-foreground mb-3">설정</Text>
          
          <View className="bg-surface rounded-2xl border border-border overflow-hidden">
            {/* App Info */}
            <Pressable
              style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
              className="flex-row items-center p-4 border-b border-border"
            >
              <MaterialIcons name="info-outline" size={24} color={colors.muted} />
              <View className="flex-1 ml-3">
                <Text className="text-foreground font-medium">앱 정보</Text>
                <Text className="text-muted text-xs">SCOOP Riding v1.0.0</Text>
              </View>
              <MaterialIcons name="chevron-right" size={24} color={colors.muted} />
            </Pressable>

            {/* Data Management */}
            <Pressable
              onPress={handleClearData}
              style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
              className="flex-row items-center p-4"
            >
              <MaterialIcons name="delete-outline" size={24} color={colors.error} />
              <View className="flex-1 ml-3">
                <Text className="text-error font-medium">데이터 초기화</Text>
                <Text className="text-muted text-xs">모든 주행 기록 삭제</Text>
              </View>
              <MaterialIcons name="chevron-right" size={24} color={colors.muted} />
            </Pressable>
          </View>
        </View>

        {/* Footer */}
        <View className="items-center py-6">
          <Image
            source={require("@/assets/images/icon.png")}
            style={{ width: 48, height: 48, borderRadius: 12, marginBottom: 8 }}
          />
          <Text className="text-muted text-sm">SCOOP MOBILITY</Text>
          <Text className="text-muted text-xs mt-1">© 2024 SCOOP. All rights reserved.</Text>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
