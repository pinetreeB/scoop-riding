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
import { useTranslation } from "@/hooks/use-translation";
import { useAuth } from "@/hooks/use-auth";

// Badge definitions with icons and colors
const BADGE_DEFINITIONS: Record<string, { nameKey: string; descKey: string; icon: string; color: string }> = {
  first_ride: {
    nameKey: "badge.badges.firstRide",
    descKey: "badge.badges.firstRideDesc",
    icon: "directions-bike",
    color: "#3B82F6",
  },
  distance_100km: {
    nameKey: "badge.badges.distance100",
    descKey: "badge.badges.distance100Desc",
    icon: "speed",
    color: "#10B981",
  },
  distance_500km: {
    nameKey: "badge.badges.distance500",
    descKey: "badge.badges.distance500Desc",
    icon: "speed",
    color: "#22C55E",
  },
  distance_1000km: {
    nameKey: "badge.badges.distance1000",
    descKey: "badge.badges.distance1000Desc",
    icon: "emoji-events",
    color: "#F59E0B",
  },
  distance_5000km: {
    nameKey: "badge.badges.distance5000",
    descKey: "badge.badges.distance5000Desc",
    icon: "emoji-events",
    color: "#EF4444",
  },
  distance_10000km: {
    nameKey: "badge.badges.distance10000",
    descKey: "badge.badges.distance10000Desc",
    icon: "military-tech",
    color: "#8B5CF6",
  },
  rides_10: {
    nameKey: "badge.badges.rides10",
    descKey: "badge.badges.rides10Desc",
    icon: "repeat",
    color: "#06B6D4",
  },
  rides_50: {
    nameKey: "badge.badges.rides50",
    descKey: "badge.badges.rides50Desc",
    icon: "repeat",
    color: "#14B8A6",
  },
  rides_100: {
    nameKey: "badge.badges.rides100",
    descKey: "badge.badges.rides100Desc",
    icon: "star",
    color: "#F59E0B",
  },
  rides_500: {
    nameKey: "badge.badges.rides500",
    descKey: "badge.badges.rides500Desc",
    icon: "star",
    color: "#EC4899",
  },
  rides_1000: {
    nameKey: "badge.badges.rides1000",
    descKey: "badge.badges.rides1000Desc",
    icon: "military-tech",
    color: "#FFD700",
  },
};

// Badge name mapping for matching with server data
const BADGE_NAME_MAPPING: Record<string, string> = {
  first_ride: "첫 주행",
  distance_100km: "100km 달성",
  distance_500km: "500km 달성",
  distance_1000km: "1,000km 달성",
  distance_5000km: "5,000km 달성",
  distance_10000km: "10,000km 달성",
  rides_10: "10회 주행",
  rides_50: "50회 주행",
  rides_100: "100회 주행",
  rides_500: "500회 주행",
  rides_1000: "1,000회 주행",
};

// All possible badges for display
const ALL_BADGES = Object.keys(BADGE_DEFINITIONS);

export default function BadgesScreen() {
  const router = useRouter();
  const colors = useColors();
  const { t, language } = useTranslation();
  const { isAuthenticated } = useAuth();
  const [refreshing, setRefreshing] = useState(false);

  const { data: myBadges, refetch } = trpc.badges.mine.useQuery(undefined, { enabled: isAuthenticated });
  const myStatsQuery = trpc.friends.getMyStats.useQuery(undefined, { enabled: isAuthenticated });
  const checkBadgesMutation = trpc.badges.check.useMutation();

  useFocusEffect(
    useCallback(() => {
      const runBadgeCheck = async () => {
        if (!isAuthenticated) return;

        try {
          const stats = await myStatsQuery.refetch();
          const statsData = stats.data;

          if (statsData) {
            await checkBadgesMutation.mutateAsync({
              totalDistance: statsData.totalDistance || 0,
              totalRides: statsData.totalRides || 0,
            });
          }
        } catch (error) {
          console.log("[Badges] Badge check error:", error);
        } finally {
          await refetch();
        }
      };

      runBadgeCheck();
    }, [isAuthenticated, myStatsQuery, checkBadgesMutation, refetch])
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const stats = await myStatsQuery.refetch();
      if (stats.data) {
        await checkBadgesMutation.mutateAsync({
          totalDistance: stats.data.totalDistance || 0,
          totalRides: stats.data.totalRides || 0,
        });
      }
      await refetch();
    } catch (error) {
      console.log("[Badges] Refresh badge check error:", error);
    } finally {
      setRefreshing(false);
    }
  };

  const earnedBadgeNames = new Set(myBadges?.map((b) => b.badge.name) || []);

  const renderBadge = ({ item: badgeType }: { item: string }) => {
    const badge = BADGE_DEFINITIONS[badgeType];
    if (!badge) return null;

    const badgeName = BADGE_NAME_MAPPING[badgeType];
    const isEarned = earnedBadgeNames.has(badgeName);
    const earnedBadge = myBadges?.find((b) => b.badge.name === badgeName);

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
              {t(badge.nameKey)}
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
            {t(badge.descKey)}
          </Text>
          {isEarned && earnedBadge && (
            <Text className="text-xs mt-1" style={{ color: badge.color }}>
              {new Date(earnedBadge.earnedAt).toLocaleDateString(language === "ko" ? "ko-KR" : "en-US")} {language === "ko" ? "획득" : "earned"}
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
        <Text className="text-lg font-bold text-foreground ml-4">{t("badge.title")}</Text>
      </View>

      {/* Progress Summary */}
      <View className="px-5 py-4 border-b border-border">
        <View className="flex-row items-center justify-between mb-3">
          <Text className="text-foreground font-medium">{t("badge.earned")}</Text>
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
            <Text className="text-muted mt-2">{t("badge.loading")}</Text>
          </View>
        }
      />
    </ScreenContainer>
  );
}
