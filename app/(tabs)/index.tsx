import { useEffect, useState, useCallback } from "react";
import { Text, View, Pressable, ScrollView, RefreshControl } from "react-native";
import { useRouter } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import {
  getRidingStats,
  getRidingRecords,
  formatDuration,
  formatDistance,
  type RidingRecord,
  type RidingStats,
} from "@/lib/riding-store";

export default function HomeScreen() {
  const router = useRouter();
  const colors = useColors();
  const [stats, setStats] = useState<RidingStats>({
    totalDistance: 0,
    totalDuration: 0,
    totalRides: 0,
    avgSpeed: 0,
  });
  const [recentRides, setRecentRides] = useState<RidingRecord[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    const [statsData, recordsData] = await Promise.all([
      getRidingStats(),
      getRidingRecords(),
    ]);
    setStats(statsData);
    setRecentRides(recordsData.slice(0, 3));
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const handleStartRiding = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    router.push("/riding" as any);
  };

  return (
    <ScreenContainer>
      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      >
        <View className="flex-1 p-4">
          {/* Header */}
          <View className="items-center mb-6 mt-2">
            <Text className="text-3xl font-bold text-primary">SCOOP</Text>
            <Text className="text-sm text-muted mt-1">전동킥보드 주행기록</Text>
          </View>

          {/* Stats Cards */}
          <View className="flex-row flex-wrap justify-between mb-6">
            <View className="w-[48%] bg-surface rounded-2xl p-4 mb-3">
              <View className="flex-row items-center mb-2">
                <MaterialIcons name="straighten" size={20} color={colors.primary} />
                <Text className="text-sm text-muted ml-2">총 거리</Text>
              </View>
              <Text className="text-2xl font-bold text-foreground">
                {formatDistance(stats.totalDistance)}
              </Text>
            </View>

            <View className="w-[48%] bg-surface rounded-2xl p-4 mb-3">
              <View className="flex-row items-center mb-2">
                <MaterialIcons name="access-time" size={20} color={colors.primary} />
                <Text className="text-sm text-muted ml-2">총 시간</Text>
              </View>
              <Text className="text-2xl font-bold text-foreground">
                {formatDuration(stats.totalDuration)}
              </Text>
            </View>

            <View className="w-[48%] bg-surface rounded-2xl p-4">
              <View className="flex-row items-center mb-2">
                <MaterialIcons name="repeat" size={20} color={colors.primary} />
                <Text className="text-sm text-muted ml-2">주행 횟수</Text>
              </View>
              <Text className="text-2xl font-bold text-foreground">
                {stats.totalRides}회
              </Text>
            </View>

            <View className="w-[48%] bg-surface rounded-2xl p-4">
              <View className="flex-row items-center mb-2">
                <MaterialIcons name="speed" size={20} color={colors.primary} />
                <Text className="text-sm text-muted ml-2">평균 속도</Text>
              </View>
              <Text className="text-2xl font-bold text-foreground">
                {stats.avgSpeed.toFixed(1)} km/h
              </Text>
            </View>
          </View>

          {/* Start Riding Button */}
          <View className="items-center mb-8">
            <Pressable
              onPress={handleStartRiding}
              style={({ pressed }) => [
                {
                  backgroundColor: colors.primary,
                  transform: [{ scale: pressed ? 0.97 : 1 }],
                  opacity: pressed ? 0.9 : 1,
                  width: 144,
                  height: 144,
                  borderRadius: 72,
                  alignItems: "center",
                  justifyContent: "center",
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.3,
                  shadowRadius: 8,
                  elevation: 8,
                },
              ]}
            >
              <MaterialIcons name="play-arrow" size={64} color="#FFFFFF" />
              <Text style={{ color: "#FFFFFF", fontWeight: "bold", fontSize: 18, marginTop: 4 }}>
                주행 시작
              </Text>
            </Pressable>
          </View>

          {/* Recent Rides */}
          {recentRides.length > 0 && (
            <View>
              <Text className="text-lg font-bold text-foreground mb-3">
                최근 주행
              </Text>
              {recentRides.map((ride) => (
                <View
                  key={ride.id}
                  className="bg-surface rounded-xl p-4 mb-2 flex-row justify-between items-center"
                >
                  <View>
                    <Text className="text-sm text-muted">{ride.date}</Text>
                    <Text className="text-base font-semibold text-foreground mt-1">
                      {formatDistance(ride.distance)}
                    </Text>
                  </View>
                  <View className="items-end">
                    <Text className="text-sm text-muted">
                      {formatDuration(ride.duration)}
                    </Text>
                    <Text className="text-sm text-primary mt-1">
                      평균 {ride.avgSpeed.toFixed(1)} km/h
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}

          {recentRides.length === 0 && (
            <View className="items-center py-8">
              <MaterialIcons name="directions-bike" size={48} color={colors.muted} />
              <Text className="text-muted mt-2 text-center">
                아직 주행 기록이 없습니다.{"\n"}주행을 시작해보세요!
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
