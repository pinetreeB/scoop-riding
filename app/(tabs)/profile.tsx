import { useEffect, useState, useCallback } from "react";
import { Text, View, ScrollView, Pressable, Linking } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useFocusEffect } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import {
  getRidingStats,
  formatDuration,
  formatDistance,
  type RidingStats,
} from "@/lib/riding-store";

export default function ProfileScreen() {
  const colors = useColors();
  const [stats, setStats] = useState<RidingStats>({
    totalDistance: 0,
    totalDuration: 0,
    totalRides: 0,
    avgSpeed: 0,
  });

  const loadStats = useCallback(async () => {
    const data = await getRidingStats();
    setStats(data);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadStats();
    }, [loadStats])
  );

  const MenuItem = ({
    icon,
    title,
    subtitle,
    onPress,
  }: {
    icon: keyof typeof MaterialIcons.glyphMap;
    title: string;
    subtitle?: string;
    onPress?: () => void;
  }) => (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [{ opacity: pressed && onPress ? 0.7 : 1 }]}
      className="flex-row items-center py-4 border-b border-border"
    >
      <View
        className="w-10 h-10 rounded-full items-center justify-center mr-3"
        style={{ backgroundColor: colors.surface }}
      >
        <MaterialIcons name={icon} size={20} color={colors.primary} />
      </View>
      <View className="flex-1">
        <Text className="text-base text-foreground">{title}</Text>
        {subtitle && (
          <Text className="text-sm text-muted mt-0.5">{subtitle}</Text>
        )}
      </View>
      {onPress && (
        <MaterialIcons name="chevron-right" size={24} color={colors.muted} />
      )}
    </Pressable>
  );

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
        {/* Header */}
        <View className="items-center py-8 bg-surface">
          <View
            className="w-24 h-24 rounded-full items-center justify-center mb-4"
            style={{ backgroundColor: colors.primary }}
          >
            <MaterialIcons name="person" size={48} color="#FFFFFF" />
          </View>
          <Text className="text-2xl font-bold text-foreground">SCOOP 라이더</Text>
          <Text className="text-sm text-muted mt-1">전동킥보드 주행기록</Text>
        </View>

        {/* Stats Summary */}
        <View className="flex-row justify-around py-6 bg-background border-b border-border">
          <View className="items-center">
            <Text className="text-2xl font-bold text-primary">
              {stats.totalRides}
            </Text>
            <Text className="text-xs text-muted mt-1">총 주행</Text>
          </View>
          <View className="items-center">
            <Text className="text-2xl font-bold text-primary">
              {(stats.totalDistance / 1000).toFixed(1)}
            </Text>
            <Text className="text-xs text-muted mt-1">총 거리 (km)</Text>
          </View>
          <View className="items-center">
            <Text className="text-2xl font-bold text-primary">
              {Math.floor(stats.totalDuration / 3600)}
            </Text>
            <Text className="text-xs text-muted mt-1">총 시간 (시간)</Text>
          </View>
        </View>

        {/* Menu Items */}
        <View className="px-4 py-2">
          <Text className="text-sm font-semibold text-muted mb-2 mt-4">
            주행 통계
          </Text>
          <MenuItem
            icon="straighten"
            title="총 주행 거리"
            subtitle={formatDistance(stats.totalDistance)}
          />
          <MenuItem
            icon="access-time"
            title="총 주행 시간"
            subtitle={formatDuration(stats.totalDuration)}
          />
          <MenuItem
            icon="speed"
            title="평균 속도"
            subtitle={`${stats.avgSpeed.toFixed(1)} km/h`}
          />

          <Text className="text-sm font-semibold text-muted mb-2 mt-6">
            앱 정보
          </Text>
          <MenuItem icon="info" title="앱 버전" subtitle="1.0.0" />
          <MenuItem
            icon="business"
            title="SCOOP MOBILITY"
            subtitle="스쿱 모빌리티"
          />
          <MenuItem
            icon="email"
            title="문의하기"
            onPress={() => Linking.openURL("mailto:support@scoopmobility.com")}
          />
        </View>

        {/* Footer */}
        <View className="items-center py-8 mt-auto">
          <Text className="text-primary text-lg font-bold">SCOOP</Text>
          <Text className="text-xs text-muted mt-1">
            © 2025 SCOOP MOBILITY. All rights reserved.
          </Text>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
