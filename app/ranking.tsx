import { useState } from "react";
import {
  Text,
  View,
  Pressable,
  FlatList,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useAuth } from "@/hooks/use-auth";
import { trpc } from "@/lib/trpc";
import { useTranslation } from "@/hooks/use-translation";

type RankingPeriod = "weekly" | "monthly";

interface RankingItem {
  userId: number;
  name: string | null;
  email: string | null;
  totalDistance: number;
  totalRides: number;
  rank: number;
}

export default function RankingScreen() {
  const colors = useColors();
  const router = useRouter();
  const { t } = useTranslation();
  const { user, isAuthenticated } = useAuth();

  const [period, setPeriod] = useState<RankingPeriod>("weekly");

  const weeklyQuery = trpc.ranking.getWeekly.useQuery(
    { limit: 30 },
    { enabled: isAuthenticated && period === "weekly" }
  );

  const monthlyQuery = trpc.ranking.getMonthly.useQuery(
    { limit: 30 },
    { enabled: isAuthenticated && period === "monthly" }
  );

  const rankingData = period === "weekly" ? weeklyQuery.data : monthlyQuery.data;
  const isLoading = period === "weekly" ? weeklyQuery.isLoading : monthlyQuery.isLoading;

  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1:
        return { icon: "emoji-events", color: "#FFD700" };
      case 2:
        return { icon: "emoji-events", color: "#C0C0C0" };
      case 3:
        return { icon: "emoji-events", color: "#CD7F32" };
      default:
        return null;
    }
  };

  const renderRankingItem = ({ item }: { item: RankingItem }) => {
    const rankIcon = getRankIcon(item.rank);
    const isCurrentUser = user?.id === item.userId;

    return (
      <Pressable
        onPress={() => router.push(`/user-profile?userId=${item.userId}` as any)}
        style={({ pressed }) => [
          {
            backgroundColor: isCurrentUser ? `${colors.primary}15` : colors.surface,
            opacity: pressed ? 0.8 : 1,
          },
        ]}
        className="flex-row items-center px-4 py-4 mb-2 rounded-xl border border-border"
      >
        {/* Rank */}
        <View className="w-12 items-center">
          {rankIcon ? (
            <MaterialIcons name={rankIcon.icon as any} size={28} color={rankIcon.color} />
          ) : (
            <Text className="text-lg font-bold text-muted">{item.rank}</Text>
          )}
        </View>

        {/* User Info */}
        <View className="flex-1 ml-3">
          <View className="flex-row items-center">
            <Text
              className="text-base font-semibold"
              style={{ color: isCurrentUser ? colors.primary : colors.foreground }}
            >
              {item.name || t("ranking.anonymousRider")}
            </Text>
            {isCurrentUser && (
              <View
                className="ml-2 px-2 py-0.5 rounded-full"
                style={{ backgroundColor: colors.primary }}
              >
                <Text className="text-xs text-white font-medium">{t("ranking.me")}</Text>
              </View>
            )}
          </View>
          <Text className="text-sm text-muted mt-0.5">
            {t("ranking.ridesCount", { count: item.totalRides })}
          </Text>
        </View>

        {/* Distance */}
        <View className="items-end">
          <Text className="text-lg font-bold text-foreground">
            {(item.totalDistance / 1000).toFixed(1)}
          </Text>
          <Text className="text-xs text-muted">{t("units.km")}</Text>
        </View>
      </Pressable>
    );
  };

  const ListHeader = () => (
    <View className="mb-4">
      {/* Period Selector */}
      <View className="flex-row bg-surface rounded-xl p-1 mb-4">
        <Pressable
          onPress={() => setPeriod("weekly")}
          style={({ pressed }) => [
            {
              backgroundColor: period === "weekly" ? colors.primary : "transparent",
              opacity: pressed ? 0.8 : 1,
            },
          ]}
          className="flex-1 py-3 rounded-lg items-center"
        >
          <Text
            className="font-semibold"
            style={{ color: period === "weekly" ? "#FFFFFF" : colors.muted }}
          >
            {t("ranking.weekly")}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setPeriod("monthly")}
          style={({ pressed }) => [
            {
              backgroundColor: period === "monthly" ? colors.primary : "transparent",
              opacity: pressed ? 0.8 : 1,
            },
          ]}
          className="flex-1 py-3 rounded-lg items-center"
        >
          <Text
            className="font-semibold"
            style={{ color: period === "monthly" ? "#FFFFFF" : colors.muted }}
          >
            {t("ranking.monthly")}
          </Text>
        </Pressable>
      </View>

      {/* Info Banner */}
      <View className="bg-surface rounded-xl p-4 mb-4 border border-border">
        <View className="flex-row items-center">
          <MaterialIcons name="info-outline" size={20} color={colors.muted} />
          <Text className="text-muted text-sm ml-2 flex-1">
            {period === "weekly"
              ? t("ranking.weeklyInfo")
              : t("ranking.monthlyInfo")}
          </Text>
        </View>
      </View>
    </View>
  );

  if (!isAuthenticated) {
    return (
      <ScreenContainer>
        <View className="flex-1 items-center justify-center p-6">
          <MaterialIcons name="leaderboard" size={64} color={colors.muted} />
          <Text className="text-foreground text-lg font-semibold mt-4">{t("ranking.loginRequired")}</Text>
          <Text className="text-muted text-center mt-2">
            {t("ranking.loginRequiredDesc")}
          </Text>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      {/* Header */}
      <View className="flex-row items-center justify-between px-5 pt-4 pb-3 border-b border-border">
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
          className="p-1"
        >
          <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
        </Pressable>
        <Text className="text-lg font-bold text-foreground">{t("ranking.title")}</Text>
        <View className="w-8" />
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={rankingData || []}
          keyExtractor={(item) => item.userId.toString()}
          renderItem={renderRankingItem}
          ListHeaderComponent={ListHeader}
          contentContainerStyle={{ padding: 20 }}
          ListEmptyComponent={
            <View className="items-center py-10">
              <MaterialIcons name="leaderboard" size={64} color={colors.muted} />
              <Text className="text-muted mt-4 text-center">
                {t("ranking.noData")}{"\n"}
                {t("ranking.noDataDesc")}
              </Text>
            </View>
          }
        />
      )}
    </ScreenContainer>
  );
}
