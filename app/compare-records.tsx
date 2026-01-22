import { useState, useEffect, useCallback } from "react";
import {
  Text,
  View,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Haptics from "expo-haptics";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useAuth } from "@/hooks/use-auth";
import { trpc } from "@/lib/trpc";
import { getRidingRecords, formatDuration, type RidingRecord } from "@/lib/riding-store";

interface FriendStats {
  id: number;
  name: string;
  email: string;
  totalDistance: number;
  totalRides: number;
  avgSpeed: number;
  maxSpeed: number;
  totalDuration: number;
}

export default function CompareRecordsScreen() {
  const colors = useColors();
  const router = useRouter();
  const { user } = useAuth();
  
  const [myStats, setMyStats] = useState<FriendStats | null>(null);
  const [selectedFriend, setSelectedFriend] = useState<FriendStats | null>(null);
  const [loading, setLoading] = useState(true);

  // Get friends list
  const friendsQuery = trpc.friends.getFriends.useQuery();

  // Get friend's riding stats (we'll calculate from local data for now)
  // In a real app, this would come from the server

  useEffect(() => {
    loadMyStats();
  }, []);

  const loadMyStats = async () => {
    const records = await getRidingRecords();
    
    const totalDistance = records.reduce((sum, r) => sum + r.distance, 0);
    const totalDuration = records.reduce((sum, r) => sum + r.duration, 0);
    const avgSpeed = records.length > 0
      ? records.reduce((sum, r) => sum + r.avgSpeed, 0) / records.length
      : 0;
    const maxSpeed = records.length > 0
      ? Math.max(...records.map(r => r.maxSpeed))
      : 0;

    setMyStats({
      id: user?.id || 0,
      name: user?.name || "나",
      email: user?.email || "",
      totalDistance,
      totalRides: records.length,
      avgSpeed,
      maxSpeed,
      totalDuration,
    });
    setLoading(false);
  };

  const selectFriend = (friend: { id: number; name: string | null; email: string | null }) => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    
    // For demo purposes, generate random stats for friends
    // In production, this would fetch from the server
    const randomStats: FriendStats = {
      id: friend.id,
      name: friend.name || friend.email?.split("@")[0] || "친구",
      email: friend.email || "",
      totalDistance: Math.random() * 500000 + 10000, // 10-510km
      totalRides: Math.floor(Math.random() * 50) + 5,
      avgSpeed: Math.random() * 15 + 10, // 10-25 km/h
      maxSpeed: Math.random() * 20 + 20, // 20-40 km/h
      totalDuration: Math.random() * 36000 + 3600, // 1-11 hours
    };
    
    setSelectedFriend(randomStats);
  };

  const formatDistance = (meters: number) => {
    const km = meters / 1000;
    return km >= 1 ? `${km.toFixed(1)} km` : `${Math.round(meters)} m`;
  };

  const getComparisonColor = (myValue: number, friendValue: number) => {
    if (myValue > friendValue) return colors.success;
    if (myValue < friendValue) return colors.error;
    return colors.foreground;
  };

  const getComparisonIcon = (myValue: number, friendValue: number): "arrow-upward" | "arrow-downward" | "remove" => {
    if (myValue > friendValue) return "arrow-upward";
    if (myValue < friendValue) return "arrow-downward";
    return "remove";
  };

  if (loading) {
    return (
      <ScreenContainer>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      {/* Header */}
      <View className="flex-row items-center px-5 py-4 border-b border-border">
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
          className="mr-4"
        >
          <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
        </Pressable>
        <Text className="text-xl font-bold text-foreground">주행 기록 비교</Text>
      </View>

      <ScrollView className="flex-1 p-5">
        {/* Friend Selection */}
        <Text className="text-lg font-bold text-foreground mb-3">비교할 친구 선택</Text>
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          className="mb-6"
        >
          <View className="flex-row gap-3">
            {friendsQuery.isLoading ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : friendsQuery.data?.length === 0 ? (
              <View className="bg-surface rounded-xl p-4">
                <Text className="text-muted">친구가 없습니다</Text>
              </View>
            ) : (
              friendsQuery.data?.map((friend) => (
                <Pressable
                  key={friend.id}
                  onPress={() => selectFriend(friend)}
                  style={({ pressed }) => [{ 
                    opacity: pressed ? 0.7 : 1,
                    backgroundColor: selectedFriend?.id === friend.id ? colors.primary : colors.surface,
                    borderColor: selectedFriend?.id === friend.id ? colors.primary : colors.border,
                  }]}
                  className="px-4 py-3 rounded-xl border min-w-[100px] items-center"
                >
                  <MaterialIcons 
                    name="person" 
                    size={24} 
                    color={selectedFriend?.id === friend.id ? "#FFFFFF" : colors.primary} 
                  />
                  <Text 
                    className="mt-1 font-medium"
                    style={{ color: selectedFriend?.id === friend.id ? "#FFFFFF" : colors.foreground }}
                  >
                    {friend.name || friend.email?.split("@")[0] || "친구"}
                  </Text>
                </Pressable>
              ))
            )}
          </View>
        </ScrollView>

        {/* Comparison Stats */}
        {selectedFriend && myStats && (
          <View className="gap-4">
            <Text className="text-lg font-bold text-foreground">통계 비교</Text>
            
            {/* Header Row */}
            <View className="flex-row bg-surface rounded-t-xl border border-border p-3">
              <View className="flex-1">
                <Text className="text-muted text-sm text-center">항목</Text>
              </View>
              <View className="flex-1">
                <Text className="text-primary font-bold text-center">나</Text>
              </View>
              <View className="w-10" />
              <View className="flex-1">
                <Text className="text-foreground font-bold text-center">{selectedFriend.name}</Text>
              </View>
            </View>

            {/* Total Distance */}
            <View className="flex-row bg-surface border-x border-border p-4 items-center">
              <View className="flex-1">
                <Text className="text-foreground font-medium">총 거리</Text>
              </View>
              <View className="flex-1 items-center">
                <Text 
                  className="font-bold"
                  style={{ color: getComparisonColor(myStats.totalDistance, selectedFriend.totalDistance) }}
                >
                  {formatDistance(myStats.totalDistance)}
                </Text>
              </View>
              <View className="w-10 items-center">
                <MaterialIcons 
                  name={getComparisonIcon(myStats.totalDistance, selectedFriend.totalDistance)} 
                  size={20} 
                  color={getComparisonColor(myStats.totalDistance, selectedFriend.totalDistance)} 
                />
              </View>
              <View className="flex-1 items-center">
                <Text className="text-foreground font-bold">
                  {formatDistance(selectedFriend.totalDistance)}
                </Text>
              </View>
            </View>

            {/* Total Rides */}
            <View className="flex-row bg-surface border-x border-border p-4 items-center">
              <View className="flex-1">
                <Text className="text-foreground font-medium">총 주행 횟수</Text>
              </View>
              <View className="flex-1 items-center">
                <Text 
                  className="font-bold"
                  style={{ color: getComparisonColor(myStats.totalRides, selectedFriend.totalRides) }}
                >
                  {myStats.totalRides}회
                </Text>
              </View>
              <View className="w-10 items-center">
                <MaterialIcons 
                  name={getComparisonIcon(myStats.totalRides, selectedFriend.totalRides)} 
                  size={20} 
                  color={getComparisonColor(myStats.totalRides, selectedFriend.totalRides)} 
                />
              </View>
              <View className="flex-1 items-center">
                <Text className="text-foreground font-bold">
                  {selectedFriend.totalRides}회
                </Text>
              </View>
            </View>

            {/* Total Duration */}
            <View className="flex-row bg-surface border-x border-border p-4 items-center">
              <View className="flex-1">
                <Text className="text-foreground font-medium">총 주행 시간</Text>
              </View>
              <View className="flex-1 items-center">
                <Text 
                  className="font-bold"
                  style={{ color: getComparisonColor(myStats.totalDuration, selectedFriend.totalDuration) }}
                >
                  {formatDuration(myStats.totalDuration)}
                </Text>
              </View>
              <View className="w-10 items-center">
                <MaterialIcons 
                  name={getComparisonIcon(myStats.totalDuration, selectedFriend.totalDuration)} 
                  size={20} 
                  color={getComparisonColor(myStats.totalDuration, selectedFriend.totalDuration)} 
                />
              </View>
              <View className="flex-1 items-center">
                <Text className="text-foreground font-bold">
                  {formatDuration(selectedFriend.totalDuration)}
                </Text>
              </View>
            </View>

            {/* Average Speed */}
            <View className="flex-row bg-surface border-x border-border p-4 items-center">
              <View className="flex-1">
                <Text className="text-foreground font-medium">평균 속도</Text>
              </View>
              <View className="flex-1 items-center">
                <Text 
                  className="font-bold"
                  style={{ color: getComparisonColor(myStats.avgSpeed, selectedFriend.avgSpeed) }}
                >
                  {myStats.avgSpeed.toFixed(1)} km/h
                </Text>
              </View>
              <View className="w-10 items-center">
                <MaterialIcons 
                  name={getComparisonIcon(myStats.avgSpeed, selectedFriend.avgSpeed)} 
                  size={20} 
                  color={getComparisonColor(myStats.avgSpeed, selectedFriend.avgSpeed)} 
                />
              </View>
              <View className="flex-1 items-center">
                <Text className="text-foreground font-bold">
                  {selectedFriend.avgSpeed.toFixed(1)} km/h
                </Text>
              </View>
            </View>

            {/* Max Speed */}
            <View className="flex-row bg-surface rounded-b-xl border border-border p-4 items-center">
              <View className="flex-1">
                <Text className="text-foreground font-medium">최고 속도</Text>
              </View>
              <View className="flex-1 items-center">
                <Text 
                  className="font-bold"
                  style={{ color: getComparisonColor(myStats.maxSpeed, selectedFriend.maxSpeed) }}
                >
                  {myStats.maxSpeed.toFixed(1)} km/h
                </Text>
              </View>
              <View className="w-10 items-center">
                <MaterialIcons 
                  name={getComparisonIcon(myStats.maxSpeed, selectedFriend.maxSpeed)} 
                  size={20} 
                  color={getComparisonColor(myStats.maxSpeed, selectedFriend.maxSpeed)} 
                />
              </View>
              <View className="flex-1 items-center">
                <Text className="text-foreground font-bold">
                  {selectedFriend.maxSpeed.toFixed(1)} km/h
                </Text>
              </View>
            </View>

            {/* Legend */}
            <View className="flex-row justify-center gap-6 mt-4">
              <View className="flex-row items-center">
                <MaterialIcons name="arrow-upward" size={16} color={colors.success} />
                <Text className="text-muted text-sm ml-1">내가 앞섬</Text>
              </View>
              <View className="flex-row items-center">
                <MaterialIcons name="arrow-downward" size={16} color={colors.error} />
                <Text className="text-muted text-sm ml-1">친구가 앞섬</Text>
              </View>
              <View className="flex-row items-center">
                <MaterialIcons name="remove" size={16} color={colors.foreground} />
                <Text className="text-muted text-sm ml-1">동일</Text>
              </View>
            </View>
          </View>
        )}

        {/* Empty State */}
        {!selectedFriend && (
          <View className="items-center py-12">
            <MaterialIcons name="compare-arrows" size={64} color={colors.muted} />
            <Text className="text-muted mt-4 text-center">
              위에서 비교할 친구를 선택하세요
            </Text>
          </View>
        )}

        {/* Info */}
        <View className="bg-surface/50 rounded-xl p-4 mt-6 mb-6">
          <View className="flex-row items-start">
            <MaterialIcons name="info-outline" size={20} color={colors.muted} />
            <Text className="flex-1 ml-2 text-muted text-sm">
              친구의 주행 기록은 서버에서 가져옵니다. 
              현재는 데모 데이터로 표시됩니다.
            </Text>
          </View>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
