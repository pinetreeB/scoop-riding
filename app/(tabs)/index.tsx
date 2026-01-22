import { useCallback, useState, useEffect } from "react";
import {
  Text,
  View,
  Pressable,
  ScrollView,
  Platform,
  Image,
  ActivityIndicator,
  Modal,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Haptics from "expo-haptics";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useAuth } from "@/hooks/use-auth";
import { trpc } from "@/lib/trpc";
import {
  getRidingRecords,
  formatDuration,
  formatDistance,
  syncAllToCloud,
  fetchAndMergeFromCloud,
  type RidingRecord,
} from "@/lib/riding-store";
import { LEVEL_DEFINITIONS, calculateLevel, getLevelTitle, formatLevelDistance } from "@/lib/level-system";

export default function HomeScreen() {
  const router = useRouter();
  const colors = useColors();
  const { user, isAuthenticated } = useAuth();
  const [stats, setStats] = useState({
    totalDistance: 0,
    totalDuration: 0,
    totalRides: 0,
    avgSpeed: 0,
    weeklyDistance: 0,
    weeklyDuration: 0,
    weeklyRides: 0,
    weeklyAvgSpeed: 0,
    monthlyDistance: 0,
    monthlyDuration: 0,
    monthlyRides: 0,
    monthlyAvgSpeed: 0,
  });
  const [recentRides, setRecentRides] = useState<RidingRecord[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<"week" | "month" | "all">("week");
  const [showLevelInfo, setShowLevelInfo] = useState(false);
  const [hasSynced, setHasSynced] = useState(false);
  const trpcUtils = trpc.useUtils();

  // Fetch ranking data
  const weeklyRankingQuery = trpc.ranking.getWeekly.useQuery(
    { limit: 3 },
    { enabled: isAuthenticated }
  );

  const loadStats = useCallback(async () => {
    const records = await getRidingRecords();
    
    // Calculate total stats
    const totalDistance = records.reduce((sum, r) => sum + r.distance, 0);
    const totalDuration = records.reduce((sum, r) => sum + r.duration, 0);
    const avgSpeed = records.length > 0
      ? records.reduce((sum, r) => sum + r.avgSpeed, 0) / records.length
      : 0;

    // Calculate weekly stats
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    const weeklyRecords = records.filter(
      (r) => new Date(r.startTime) >= oneWeekAgo
    );
    const weeklyDistance = weeklyRecords.reduce((sum, r) => sum + r.distance, 0);
    const weeklyDuration = weeklyRecords.reduce((sum, r) => sum + r.duration, 0);
    const weeklyAvgSpeed = weeklyRecords.length > 0
      ? weeklyRecords.reduce((sum, r) => sum + r.avgSpeed, 0) / weeklyRecords.length
      : 0;

    // Calculate monthly stats
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
    const monthlyRecords = records.filter(
      (r) => new Date(r.startTime) >= oneMonthAgo
    );
    const monthlyDistance = monthlyRecords.reduce((sum, r) => sum + r.distance, 0);
    const monthlyDuration = monthlyRecords.reduce((sum, r) => sum + r.duration, 0);
    const monthlyAvgSpeed = monthlyRecords.length > 0
      ? monthlyRecords.reduce((sum, r) => sum + r.avgSpeed, 0) / monthlyRecords.length
      : 0;

    setStats({
      totalDistance,
      totalDuration,
      totalRides: records.length,
      avgSpeed,
      weeklyDistance,
      weeklyDuration,
      weeklyRides: weeklyRecords.length,
      weeklyAvgSpeed,
      monthlyDistance,
      monthlyDuration,
      monthlyRides: monthlyRecords.length,
      monthlyAvgSpeed,
    });

    setRecentRides(records.slice(0, 3));
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadStats();
    }, [loadStats])
  );

  // Auto sync on first load when authenticated
  useEffect(() => {
    const autoSync = async () => {
      if (isAuthenticated && !hasSynced) {
        console.log("[HomeScreen] Auto syncing with cloud...");
        try {
          // First fetch from cloud and merge
          const fetchResult = await fetchAndMergeFromCloud(trpcUtils);
          console.log("[HomeScreen] Fetched from cloud:", fetchResult);
          
          // Then sync local records to cloud
          const syncResult = await syncAllToCloud(trpcUtils);
          console.log("[HomeScreen] Synced to cloud:", syncResult);
          
          setHasSynced(true);
          
          // Reload stats after sync
          loadStats();
        } catch (error) {
          console.error("[HomeScreen] Auto sync error:", error);
        }
      }
    };
    autoSync();
  }, [isAuthenticated, hasSynced, trpcUtils, loadStats]);

  const handleStartRiding = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    // Navigate to scooter selection screen before riding
    router.push("/select-scooter");
  };

  const handleViewHistory = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    router.push("/history");
  };

  const handleViewRanking = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    router.push("/ranking" as any);
  };

  const getDisplayStats = () => {
    switch (selectedPeriod) {
      case "week":
        return {
          distance: stats.weeklyDistance,
          duration: stats.weeklyDuration,
          rides: stats.weeklyRides,
          avgSpeed: stats.weeklyAvgSpeed,
        };
      case "month":
        return {
          distance: stats.monthlyDistance,
          duration: stats.monthlyDuration,
          rides: stats.monthlyRides,
          avgSpeed: stats.monthlyAvgSpeed,
        };
      case "all":
      default:
        return {
          distance: stats.totalDistance,
          duration: stats.totalDuration,
          rides: stats.totalRides,
          avgSpeed: stats.avgSpeed,
        };
    }
  };

  const displayStats = getDisplayStats();

  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1:
        return { color: "#FFD700" };
      case 2:
        return { color: "#C0C0C0" };
      case 3:
        return { color: "#CD7F32" };
      default:
        return { color: colors.muted };
    }
  };

  return (
    <ScreenContainer>
      <ScrollView 
        className="flex-1" 
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 100 }}
      >
        {/* Header with Logo */}
        <View className="px-5 pt-4 pb-2">
          <View className="flex-row items-center">
            <Image
              source={require("@/assets/images/icon.png")}
              style={{ width: 40, height: 40, borderRadius: 8 }}
            />
            <Text className="text-2xl font-bold text-primary ml-2">SCOOP</Text>
            <View className="flex-1" />
            {/* Friends Location Button */}
            <Pressable
              onPress={() => {
                if (Platform.OS !== "web") {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }
                router.push("/friends-map" as any);
              }}
              style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
              className="p-2 mr-1"
            >
              <MaterialIcons name="location-on" size={24} color={colors.primary} />
            </Pressable>
            {/* Notifications Button */}
            <Pressable
              onPress={() => {
                if (Platform.OS !== "web") {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }
                router.push("/notifications-center" as any);
              }}
              style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
              className="p-2"
            >
              <MaterialIcons name="notifications" size={24} color={colors.foreground} />
            </Pressable>
          </View>
        </View>

        {/* Search Bar (Placeholder) */}
        <View className="mx-5 mb-4">
          <View className="bg-surface rounded-full px-4 py-3 flex-row items-center border border-border">
            <MaterialIcons name="search" size={20} color={colors.muted} />
            <Text className="text-muted ml-2 flex-1">어디로 달릴까요?</Text>
          </View>
        </View>

        {/* Start Riding Card */}
        <Pressable
          onPress={handleStartRiding}
          style={({ pressed }) => [
            {
              transform: [{ scale: pressed ? 0.98 : 1 }],
              opacity: pressed ? 0.95 : 1,
            },
          ]}
          className="mx-5 mb-4"
        >
          <View className="bg-[#1A1A1A] rounded-2xl p-5 flex-row items-center justify-between">
            <View>
              <Text className="text-white text-xl font-bold mb-1">라이딩 시작</Text>
              <Text className="text-gray-400 text-sm">안전하고 재밌는 라이딩되세요.</Text>
            </View>
            <View 
              className="w-14 h-14 rounded-full items-center justify-center"
              style={{ backgroundColor: colors.primary }}
            >
              <MaterialIcons name="play-arrow" size={32} color="#FFFFFF" />
            </View>
          </View>
        </Pressable>

        {/* Quick Actions Row */}
        <View className="flex-row mx-5 mb-4">
          {/* My Tracking Report */}
          <Pressable
            onPress={handleViewHistory}
            style={({ pressed }) => [
              {
                flex: 1,
                marginRight: 8,
                opacity: pressed ? 0.9 : 1,
              },
            ]}
          >
            <View className="bg-surface rounded-2xl p-4 h-28 justify-between border border-border">
              <Text className="text-foreground font-semibold">내 트래킹</Text>
              <Text className="text-foreground font-semibold">보고서</Text>
              <View className="flex-row items-center">
                <View className="flex-row">
                  <View className="w-2 h-8 bg-primary rounded-full mr-1" />
                  <View className="w-2 h-5 bg-primary/60 rounded-full mr-1" />
                  <View className="w-2 h-10 bg-primary rounded-full" />
                </View>
              </View>
            </View>
          </Pressable>

          {/* Stats Quick View */}
          <View className="flex-1 ml-2">
            <View 
              className="rounded-2xl p-4 h-28 justify-between"
              style={{ backgroundColor: colors.primary }}
            >
              <Text className="text-white font-semibold">이번 주</Text>
              <View>
                <Text className="text-white text-2xl font-bold">
                  {(stats.weeklyDistance / 1000).toFixed(1)} km
                </Text>
                <Text className="text-white/70 text-xs">
                  {stats.weeklyRides}회 주행
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Period Selector */}
        <View className="mx-5 mb-3">
          <View className="flex-row bg-surface rounded-full p-1 border border-border">
            {(["week", "month", "all"] as const).map((period) => (
              <Pressable
                key={period}
                onPress={() => setSelectedPeriod(period)}
                className={`flex-1 py-2 rounded-full ${
                  selectedPeriod === period ? "bg-foreground" : ""
                }`}
              >
                <Text
                  className={`text-center text-sm font-medium ${
                    selectedPeriod === period ? "text-background" : "text-muted"
                  }`}
                >
                  {period === "week" ? "주간" : period === "month" ? "월간" : "전체"}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Stats Card */}
        <View className="mx-5 mb-4 bg-surface rounded-2xl p-5 border border-border">
          {/* Average Speed */}
          <View className="items-center mb-4">
            <Text className="text-4xl font-bold text-foreground">
              {displayStats.avgSpeed.toFixed(1)}
            </Text>
            <Text className="text-muted text-sm">평균속도(km/h)</Text>
          </View>

          {/* Time and Distance */}
          <View className="flex-row border-t border-border pt-4">
            <View className="flex-1 border-r border-border">
              <Text className="text-xl font-bold text-foreground">
                {formatDuration(displayStats.duration)}
              </Text>
              <Text className="text-muted text-sm">시간</Text>
            </View>
            <View className="flex-1 pl-4">
              <Text className="text-xl font-bold text-foreground">
                {(displayStats.distance / 1000).toFixed(1)}
              </Text>
              <Text className="text-muted text-sm">거리(km)</Text>
            </View>
          </View>

          {/* Level Progress */}
          {(() => {
            const levelInfo = calculateLevel(displayStats.distance / 1000);
            return (
              <View className="mt-4 pt-4 border-t border-border">
                <View className="flex-row justify-between items-center mb-2">
                  <Text className="text-muted text-sm">
                    {levelInfo.nextLevelDistance > 0 
                      ? `다음 레벨까지 ${formatLevelDistance(levelInfo.nextLevelDistance)} 남았습니다.`
                      : "최고 레벨 달성!"}
                  </Text>
                  <Pressable
                    onPress={() => {
                      if (Platform.OS !== "web") {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      }
                      setShowLevelInfo(true);
                    }}
                    style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}
                  >
                    <MaterialIcons name="help-outline" size={16} color={colors.muted} />
                  </Pressable>
                </View>
                <View className="h-2 bg-border rounded-full overflow-hidden">
                  <View
                    className="h-full rounded-full"
                    style={{
                      backgroundColor: colors.primary,
                      width: `${levelInfo.progress * 100}%`,
                    }}
                  />
                </View>
              </View>
            );
          })()}
        </View>

        {/* Weekly Ranking Section */}
        {isAuthenticated && (
          <View className="mx-5 mb-4">
            <View className="flex-row justify-between items-center mb-3">
              <View className="flex-row items-center">
                <MaterialIcons name="emoji-events" size={20} color="#FFD700" />
                <Text className="text-lg font-bold text-foreground ml-1">주간 랭킹</Text>
              </View>
              <Pressable onPress={handleViewRanking}>
                <Text className="text-primary text-sm">전체보기</Text>
              </Pressable>
            </View>

            <View className="bg-surface rounded-2xl border border-border overflow-hidden">
              {weeklyRankingQuery.isLoading ? (
                <View className="py-8 items-center">
                  <ActivityIndicator size="small" color={colors.primary} />
                </View>
              ) : weeklyRankingQuery.data && weeklyRankingQuery.data.length > 0 ? (
                weeklyRankingQuery.data.map((item, index) => {
                  const isCurrentUser = user?.id === item.userId;
                  const rankStyle = getRankIcon(item.rank);
                  
                  return (
                    <Pressable
                      key={item.userId}
                      onPress={() => router.push(`/user-profile?userId=${item.userId}&name=${encodeURIComponent(item.name || "​익명 라이더")}` as any)}
                      style={({ pressed }) => [{ opacity: pressed ? 0.8 : 1 }]}
                    >
                      <View
                        className={`flex-row items-center px-4 py-3 ${
                          index < 2 ? "border-b border-border" : ""
                        }`}
                        style={isCurrentUser ? { backgroundColor: `${colors.primary}10` } : {}}
                      >
                        {/* Rank */}
                        <View className="w-8 items-center">
                          {item.rank <= 3 ? (
                            <MaterialIcons
                              name="emoji-events"
                              size={20}
                              color={rankStyle.color}
                            />
                          ) : (
                            <Text className="text-muted font-bold">{item.rank}</Text>
                          )}
                        </View>

                        {/* User Info */}
                        <View className="flex-1 ml-3">
                          <View className="flex-row items-center">
                            <Text
                              className="font-semibold"
                              style={{ color: isCurrentUser ? colors.primary : colors.foreground }}
                            >
                              {item.name || "익명 라이더"}
                            </Text>
                            {isCurrentUser && (
                              <View
                                className="ml-2 px-1.5 py-0.5 rounded"
                                style={{ backgroundColor: colors.primary }}
                              >
                                <Text className="text-white text-xs font-medium">나</Text>
                              </View>
                            )}
                          </View>
                          <Text className="text-muted text-xs">{item.totalRides}회 주행</Text>
                        </View>

                        {/* Distance */}
                        <View className="items-end">
                          <Text className="text-foreground font-bold">
                            {(item.totalDistance / 1000).toFixed(1)}
                          </Text>
                          <Text className="text-muted text-xs">km</Text>
                        </View>
                      </View>
                    </Pressable>
                  );
                })
              ) : (
                <View className="py-6 items-center">
                  <Text className="text-muted text-sm">아직 랭킹 데이터가 없습니다</Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Recent Rides */}
        {recentRides.length > 0 && (
          <View className="mx-5 mb-4">
            <View className="flex-row justify-between items-center mb-3">
              <Text className="text-lg font-bold text-foreground">최근 주행</Text>
              <Pressable onPress={handleViewHistory}>
                <Text className="text-primary text-sm">전체보기</Text>
              </Pressable>
            </View>

            {recentRides.map((ride) => (
              <Pressable
                key={ride.id}
                onPress={() => router.push(`/ride-detail?id=${ride.id}`)}
                style={({ pressed }) => [{ opacity: pressed ? 0.9 : 1 }]}
              >
                <View className="bg-surface rounded-xl p-4 mb-2 flex-row items-center border border-border">
                  <View className="w-10 h-10 rounded-full bg-primary/10 items-center justify-center mr-3">
                    <MaterialIcons name="electric-scooter" size={20} color={colors.primary} />
                  </View>
                  <View className="flex-1">
                    <Text className="text-foreground font-medium">{ride.date}</Text>
                    <Text className="text-muted text-xs">
                      {formatDistance(ride.distance)} • {formatDuration(ride.duration)}
                    </Text>
                  </View>
                  <Text className="text-primary font-bold">
                    {ride.avgSpeed.toFixed(1)} km/h
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Level Info Modal */}
      <Modal
        visible={showLevelInfo}
        transparent
        animationType="fade"
        onRequestClose={() => setShowLevelInfo(false)}
      >
        <Pressable
          className="flex-1 bg-black/50 items-center justify-center px-6"
          onPress={() => setShowLevelInfo(false)}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            className="bg-surface rounded-2xl p-6 w-full max-w-sm"
          >
            <View className="flex-row items-center mb-4">
              <MaterialIcons name="emoji-events" size={28} color={colors.primary} />
              <Text className="text-xl font-bold text-foreground ml-2">레벨 시스템</Text>
            </View>
            
            <Text className="text-foreground mb-4">
              주행 거리에 따라 레벨이 상승합니다. 더 많이 주행하여 높은 레벨을 달성해보세요!
            </Text>

            <ScrollView className="max-h-[300px]">
              <View className="bg-background rounded-xl p-4 mb-4">
                {LEVEL_DEFINITIONS.map((levelDef, index) => (
                  <View key={levelDef.level} className={`flex-row items-center ${index < LEVEL_DEFINITIONS.length - 1 ? 'mb-3' : ''}`}>
                    <View 
                      className="w-8 h-8 rounded-full items-center justify-center mr-3"
                      style={{ backgroundColor: levelDef.color }}
                    >
                      <Text className="text-white font-bold">{levelDef.level}</Text>
                    </View>
                    <View className="flex-1">
                      <Text className="text-foreground font-medium">{levelDef.title}</Text>
                      <Text className="text-muted text-xs">
                        {levelDef.maxDistance === Infinity 
                          ? `${formatLevelDistance(levelDef.minDistance)} 이상`
                          : `${formatLevelDistance(levelDef.minDistance)} ~ ${formatLevelDistance(levelDef.maxDistance)}`}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            </ScrollView>

            <Pressable
              onPress={() => setShowLevelInfo(false)}
              className="bg-primary rounded-xl py-3 items-center"
              style={({ pressed }) => [{ opacity: pressed ? 0.8 : 1 }]}
            >
              <Text className="text-white font-semibold">확인</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </ScreenContainer>
  );
}
