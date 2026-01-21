import { useState, useCallback } from "react";
import {
  Text,
  View,
  FlatList,
  Pressable,
  RefreshControl,
  Platform,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Haptics from "expo-haptics";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";

// Badge definitions with icons and descriptions (10x increased requirements)
const BADGE_DEFINITIONS: Record<string, { name: string; description: string; icon: string; color: string }> = {
  first_ride: {
    name: "첫 주행",
    description: "첫 번째 주행을 완료했습니다",
    icon: "directions-bike",
    color: "#3B82F6",
  },
  distance_100km: {
    name: "100km 달성",
    description: "총 주행거리 100km를 달성했습니다",
    icon: "speed",
    color: "#10B981",
  },
  distance_500km: {
    name: "500km 달성",
    description: "총 주행거리 500km를 달성했습니다",
    icon: "speed",
    color: "#22C55E",
  },
  distance_1000km: {
    name: "1,000km 달성",
    description: "총 주행거리 1,000km를 달성했습니다",
    icon: "emoji-events",
    color: "#F59E0B",
  },
  distance_5000km: {
    name: "5,000km 달성",
    description: "총 주행거리 5,000km를 달성했습니다",
    icon: "emoji-events",
    color: "#EF4444",
  },
  distance_10000km: {
    name: "10,000km 달성",
    description: "총 주행거리 10,000km를 달성했습니다",
    icon: "military-tech",
    color: "#8B5CF6",
  },
  rides_10: {
    name: "10회 주행",
    description: "총 10회 주행을 완료했습니다",
    icon: "repeat",
    color: "#06B6D4",
  },
  rides_50: {
    name: "50회 주행",
    description: "총 50회 주행을 완료했습니다",
    icon: "repeat",
    color: "#14B8A6",
  },
  rides_100: {
    name: "100회 주행",
    description: "총 100회 주행을 완료했습니다",
    icon: "star",
    color: "#F59E0B",
  },
  rides_500: {
    name: "500회 주행",
    description: "총 500회 주행을 완료했습니다",
    icon: "star",
    color: "#EC4899",
  },
  rides_1000: {
    name: "1,000회 주행",
    description: "총 1,000회 주행을 완료했습니다",
    icon: "military-tech",
    color: "#FFD700",
  },
};

// All possible badges for display
const ALL_BADGES = Object.keys(BADGE_DEFINITIONS);

export default function BadgesScreen() {
  const router = useRouter();
  const colors = useColors();
  const [refreshing, setRefreshing] = useState(false);

  const { data: myBadges, refetch } = trpc.badges.mine.useQuery();

  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch])
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const earnedBadgeNames = new Set(myBadges?.map((b) => b.badge.name) || []);

  const renderBadge = ({ item: badgeType }: { item: string }) => {
    const badge = BADGE_DEFINITIONS[badgeType];
    if (!badge) return null;

    const isEarned = earnedBadgeNames.has(badge.name);
    const earnedBadge = myBadges?.find((b) => b.badge.name === badge.name);

    return (
      <View
        className="flex-row items-center p-4 mb-3 rounded-xl border"
        style={{
          backgroundColor: isEarned ? colors.surface : colors.background,
          borderColor: isEarned ? badge.color + "40" : colors.border,
          opacity: isEarned ? 1 : 0.5,
        }}
      >
        {/* Badge Icon */}
        <View
          className="w-14 h-14 rounded-full items-center justify-center mr-4"
          style={{
            backgroundColor: isEarned ? badge.color + "20" : colors.border,
          }}
        >
          <MaterialIcons
            name={badge.icon as any}
            size={28}
            color={isEarned ? badge.color : colors.muted}
          />
        </View>

        {/* Badge Info */}
        <View className="flex-1">
          <View className="flex-row items-center">
            <Text
              className="font-bold text-base"
              style={{ color: isEarned ? colors.foreground : colors.muted }}
            >
              {badge.name}
            </Text>
            {isEarned && (
              <MaterialIcons
                name="verified"
                size={18}
                color={badge.color}
                style={{ marginLeft: 6 }}
              />
            )}
          </View>
          <Text
            className="text-sm mt-1"
            style={{ color: isEarned ? colors.muted : colors.muted }}
          >
            {badge.description}
          </Text>
          {isEarned && earnedBadge && (
            <Text className="text-xs mt-1" style={{ color: badge.color }}>
              {new Date(earnedBadge.earnedAt).toLocaleDateString("ko-KR")} 획득
            </Text>
          )}
        </View>
      </View>
    );
  };

  const earnedCount = earnedBadgeNames.size;
  const totalCount = ALL_BADGES.length;

  return (
    <ScreenContainer>
      {/* Header */}
      <View className="flex-row items-center px-5 py-4 border-b border-border">
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
        >
          <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
        </Pressable>
        <Text className="text-lg font-bold text-foreground ml-4">업적 / 배지</Text>
      </View>

      {/* Progress Summary */}
      <View className="px-5 py-4 border-b border-border">
        <View className="flex-row items-center justify-between mb-3">
          <Text className="text-foreground font-medium">획득한 배지</Text>
          <Text className="text-primary font-bold">
            {earnedCount} / {totalCount}
          </Text>
        </View>
        <View className="h-3 bg-border rounded-full overflow-hidden">
          <View
            className="h-full rounded-full"
            style={{
              backgroundColor: colors.primary,
              width: `${(earnedCount / totalCount) * 100}%`,
            }}
          />
        </View>
      </View>

      {/* Badges List */}
      <FlatList
        data={ALL_BADGES}
        renderItem={renderBadge}
        keyExtractor={(item) => item}
        contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
          />
        }
        ListEmptyComponent={
          <View className="items-center py-10">
            <MaterialIcons name="emoji-events" size={48} color={colors.muted} />
            <Text className="text-muted mt-2">배지를 불러오는 중...</Text>
          </View>
        }
      />
    </ScreenContainer>
  );
}
